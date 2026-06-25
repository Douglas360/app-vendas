-- ============================================================
-- Editar e cancelar venda (transacional, somente admin)
-- ============================================================

-- Cancela a venda: estorna estoque (trigger) + cancela parcelas/pagamentos
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar vendas.';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_sale.status = 'cancelada' THEN RETURN; END IF;

  UPDATE credit_installments
    SET status = 'cancelado', updated_at = NOW()
    WHERE sale_id = p_sale_id AND status IN ('pendente', 'atrasado');

  UPDATE payments SET status = 'cancelado', updated_at = NOW() WHERE sale_id = p_sale_id;

  UPDATE sales SET status = 'cancelada', updated_at = NOW() WHERE id = p_sale_id;
END;
$$;

-- Edita itens/desconto da venda, recalcula total, ajusta estoque e parcelas
CREATE OR REPLACE FUNCTION edit_sale_items(
  p_sale_id UUID,
  p_items JSONB,
  p_discount_percent NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales;
  v_payment payments;
  v_item RECORD;
  v_subtotal NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_new_total NUMERIC(12,2);
  v_paid NUMERIC(12,2);
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem editar vendas.';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_sale.status <> 'finalizada' THEN
    RAISE EXCEPTION 'Apenas vendas finalizadas podem ser editadas.';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um item.';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0) INTO v_paid
    FROM credit_installments WHERE sale_id = p_sale_id;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Não é possível editar: já houve recebimento de parcelas desta venda.';
  END IF;

  -- Devolve estoque dos itens atuais
  UPDATE products p
    SET stock_quantity = p.stock_quantity + si.quantity
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.product_id = p.id;

  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  -- Insere novos itens e dá baixa no estoque
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(
      product_id UUID, quantity NUMERIC, unit_price NUMERIC,
      cost_price NUMERIC, discount_amount NUMERIC
    )
  LOOP
    INSERT INTO sale_items(sale_id, product_id, quantity, unit_price, cost_price, discount_amount, total)
    VALUES (
      p_sale_id, v_item.product_id, v_item.quantity, v_item.unit_price,
      COALESCE(v_item.cost_price, 0), COALESCE(v_item.discount_amount, 0),
      v_item.quantity * v_item.unit_price - COALESCE(v_item.discount_amount, 0)
    );
    UPDATE products SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.product_id;
  END LOOP;

  -- Recalcula totais
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal FROM sale_items WHERE sale_id = p_sale_id;
  v_discount := ROUND(v_subtotal * COALESCE(p_discount_percent, 0) / 100, 2);
  v_new_total := GREATEST(0, v_subtotal - v_discount);

  UPDATE sales SET
    subtotal = v_subtotal,
    discount_percent = COALESCE(p_discount_percent, 0),
    discount_amount = v_discount,
    total = v_new_total,
    updated_at = NOW()
  WHERE id = p_sale_id;

  -- Atualiza pagamento e redistribui parcelas (fiado), mantendo datas
  SELECT * INTO v_payment FROM payments WHERE sale_id = p_sale_id ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    UPDATE payments SET amount = v_new_total, updated_at = NOW() WHERE id = v_payment.id;

    IF v_payment.method = 'fiado' THEN
      WITH ordered AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY installment_number) AS rn,
               COUNT(*) OVER () AS cnt
        FROM credit_installments WHERE sale_id = p_sale_id
      )
      UPDATE credit_installments ci
        SET amount = CASE
              WHEN o.rn < o.cnt THEN ROUND(v_new_total / o.cnt, 2)
              ELSE v_new_total - ROUND(v_new_total / o.cnt, 2) * (o.cnt - 1)
            END,
            updated_at = NOW()
        FROM ordered o
        WHERE ci.id = o.id;
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- Pagamento avulso do crediário: recebe um valor qualquer e
-- abate nas parcelas em aberto do cliente, em ordem de
-- vencimento (quita as primeiras, deixa a última parcial).
-- Registra cada abatimento no livro-caixa (cash_movements).
-- ============================================================

CREATE OR REPLACE FUNCTION pay_customer_amount(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_method payment_method DEFAULT 'dinheiro'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rest NUMERIC := p_amount;
  v_apply NUMERIC;
  v_total_open NUMERIC;
  v_details JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido.';
  END IF;

  SELECT COALESCE(SUM(amount - amount_paid), 0) INTO v_total_open
  FROM credit_installments
  WHERE customer_id = p_customer_id AND status IN ('pendente', 'atrasado');

  IF v_total_open <= 0 THEN
    RAISE EXCEPTION 'O cliente não possui parcelas em aberto.';
  END IF;

  IF p_amount > v_total_open + 0.001 THEN
    RAISE EXCEPTION 'Valor (R$ %) excede o total devido (R$ %).', p_amount, v_total_open;
  END IF;

  FOR r IN
    SELECT * FROM credit_installments
    WHERE customer_id = p_customer_id AND status IN ('pendente', 'atrasado')
    ORDER BY due_date, installment_number
    FOR UPDATE
  LOOP
    EXIT WHEN v_rest <= 0.001;
    v_apply := LEAST(v_rest, r.amount - r.amount_paid);
    CONTINUE WHEN v_apply <= 0;

    UPDATE credit_installments SET
      amount_paid = amount_paid + v_apply,
      status = CASE WHEN amount_paid + v_apply >= amount THEN 'pago' ELSE status END,
      paid_date = CASE WHEN amount_paid + v_apply >= amount THEN CURRENT_DATE ELSE paid_date END,
      updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO cash_movements (
      sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by, notes
    ) VALUES (
      r.sale_id, p_customer_id, r.id, v_apply, p_method, 'parcela', NOW(), auth.uid(),
      'Recebimento da ' || r.installment_number || 'ª parcela (pagamento avulso)'
    );

    v_details := v_details || jsonb_build_object(
      'installment_number', r.installment_number,
      'applied', v_apply
    );
    v_rest := v_rest - v_apply;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_amount - v_rest,
    'remaining_debt', GREATEST(0, v_total_open - (p_amount - v_rest)),
    'installments', v_details
  );
END;
$$;

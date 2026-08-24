-- ============================================================
-- Edição de kit consignado em aberto (ajusta o estoque conforme
-- a diferença entre os itens atuais e os novos)
-- ============================================================

CREATE OR REPLACE FUNCTION edit_consignment_kit(
  p_kit_id UUID,
  p_items JSONB,          -- [{product_id, quantity, unit_price, cost_price}]
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kit consignment_kits;
  v_item RECORD;
  v_stock NUMERIC;
  v_name TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem editar kits.';
  END IF;

  SELECT * INTO v_kit FROM consignment_kits WHERE id = p_kit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit não encontrado.'; END IF;
  IF v_kit.status <> 'aberto' THEN
    RAISE EXCEPTION 'Apenas kits em aberto podem ser editados.';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'O kit precisa ter ao menos um produto.';
  END IF;

  -- Devolve ao estoque tudo que está no kit hoje
  UPDATE products p
    SET stock_quantity = p.stock_quantity + ki.quantity, updated_at = NOW()
    FROM consignment_kit_items ki
    WHERE ki.kit_id = p_kit_id AND ki.product_id = p.id;

  DELETE FROM consignment_kit_items WHERE kit_id = p_kit_id;

  -- Aplica os novos itens, validando estoque
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(
      product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC
    )
  LOOP
    SELECT stock_quantity, name INTO v_stock, v_name FROM products WHERE id = v_item.product_id;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;
    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente de % (disponível: %).', v_name, v_stock;
    END IF;

    INSERT INTO consignment_kit_items (kit_id, product_id, quantity, unit_price, cost_price)
    VALUES (p_kit_id, v_item.product_id, v_item.quantity, v_item.unit_price,
            COALESCE(v_item.cost_price, 0));

    UPDATE products SET stock_quantity = stock_quantity - v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE consignment_kits
    SET notes = COALESCE(p_notes, notes), updated_at = NOW()
    WHERE id = p_kit_id;
END;
$$;

-- Cancela um kit em aberto, devolvendo tudo ao estoque
CREATE OR REPLACE FUNCTION cancel_consignment_kit(p_kit_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_kit consignment_kits;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar kits.';
  END IF;

  SELECT * INTO v_kit FROM consignment_kits WHERE id = p_kit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit não encontrado.'; END IF;
  IF v_kit.status <> 'aberto' THEN
    RAISE EXCEPTION 'Apenas kits em aberto podem ser cancelados.';
  END IF;

  UPDATE products p
    SET stock_quantity = p.stock_quantity + ki.quantity, updated_at = NOW()
    FROM consignment_kit_items ki
    WHERE ki.kit_id = p_kit_id AND ki.product_id = p.id;

  UPDATE consignment_kits
    SET status = 'cancelado', updated_at = NOW()
    WHERE id = p_kit_id;
END;
$$;

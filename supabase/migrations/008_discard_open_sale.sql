-- Descarta (apaga) uma venda em aberto. Permitido ao vendedor dono ou admin.
CREATE OR REPLACE FUNCTION discard_open_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_sale.status <> 'aberta' THEN
    RAISE EXCEPTION 'Apenas vendas em aberto podem ser descartadas.';
  END IF;
  IF NOT (v_sale.seller_id = auth.uid() OR is_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para descartar esta venda.';
  END IF;
  DELETE FROM sales WHERE id = p_sale_id; -- itens em cascata
END;
$$;

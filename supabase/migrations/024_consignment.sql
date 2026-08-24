-- ============================================================
-- MÓDULO CONSIGNADO: vendedores, kits e comissão por faixas
-- ============================================================

-- 1) Vendedores (podem ou não ter login no app)
CREATE TABLE IF NOT EXISTS sellers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  cpf_cnpj    TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sellers IS 'Vendedores de consignado (podem ter usuário do app vinculado)';

-- 2) Faixas de comissão. seller_id NULL = faixa padrão (vale para todos)
CREATE TABLE IF NOT EXISTS commission_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID REFERENCES sellers(id) ON DELETE CASCADE,
  min_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_amount  NUMERIC(12,2),           -- NULL = sem teto
  percent     NUMERIC(5,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tiers_seller ON commission_tiers (seller_id);

-- 3) Kits entregues ao vendedor
CREATE TABLE IF NOT EXISTS consignment_kits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_number    SERIAL,
  seller_id     UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'aberto',   -- aberto | acertado | cancelado
  notes         TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at    TIMESTAMPTZ,
  -- Resultado do acerto
  total_sold        NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kits_seller ON consignment_kits (seller_id);
CREATE INDEX IF NOT EXISTS idx_kits_status ON consignment_kits (status);

-- 4) Itens do kit
CREATE TABLE IF NOT EXISTS consignment_kit_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id       UUID NOT NULL REFERENCES consignment_kits(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  quantity     NUMERIC(10,3) NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  cost_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_sold NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kit_items_kit ON consignment_kit_items (kit_id);

-- ---------- RLS ----------
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_kit_items ENABLE ROW LEVEL SECURITY;

-- Vendedores: admin gerencia; o próprio vendedor vê seu cadastro
DROP POLICY IF EXISTS "sellers_select" ON sellers;
CREATE POLICY "sellers_select" ON sellers FOR SELECT TO authenticated
  USING (is_admin() OR profile_id = auth.uid());
DROP POLICY IF EXISTS "sellers_admin_all" ON sellers;
CREATE POLICY "sellers_admin_all" ON sellers FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "tiers_select" ON commission_tiers;
CREATE POLICY "tiers_select" ON commission_tiers FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "tiers_admin_all" ON commission_tiers;
CREATE POLICY "tiers_admin_all" ON commission_tiers FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Kits: admin vê tudo; vendedor vê só os dele
DROP POLICY IF EXISTS "kits_select" ON consignment_kits;
CREATE POLICY "kits_select" ON consignment_kits FOR SELECT TO authenticated
  USING (
    is_admin() OR seller_id IN (SELECT id FROM sellers WHERE profile_id = auth.uid())
  );
DROP POLICY IF EXISTS "kits_admin_all" ON consignment_kits;
CREATE POLICY "kits_admin_all" ON consignment_kits FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "kit_items_select" ON consignment_kit_items;
CREATE POLICY "kit_items_select" ON consignment_kit_items FOR SELECT TO authenticated
  USING (
    is_admin() OR kit_id IN (
      SELECT k.id FROM consignment_kits k
      JOIN sellers s ON s.id = k.seller_id
      WHERE s.profile_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "kit_items_admin_all" ON consignment_kit_items;
CREATE POLICY "kit_items_admin_all" ON consignment_kit_items FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ---------- FUNÇÕES ----------

-- Cria o kit e dá baixa no estoque da loja
CREATE OR REPLACE FUNCTION create_consignment_kit(
  p_seller_id UUID,
  p_items JSONB,          -- [{product_id, quantity, unit_price, cost_price}]
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kit_id UUID;
  v_item RECORD;
  v_stock NUMERIC;
  v_name TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem criar kits.';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um produto no kit.';
  END IF;

  INSERT INTO consignment_kits (seller_id, notes, created_by)
  VALUES (p_seller_id, p_notes, auth.uid())
  RETURNING id INTO v_kit_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(
      product_id UUID, quantity NUMERIC, unit_price NUMERIC, cost_price NUMERIC
    )
  LOOP
    SELECT stock_quantity, name INTO v_stock, v_name FROM products WHERE id = v_item.product_id;
    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Produto não encontrado.';
    END IF;
    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente de % (disponível: %).', v_name, v_stock;
    END IF;

    INSERT INTO consignment_kit_items (kit_id, product_id, quantity, unit_price, cost_price)
    VALUES (v_kit_id, v_item.product_id, v_item.quantity, v_item.unit_price,
            COALESCE(v_item.cost_price, 0));

    UPDATE products SET stock_quantity = stock_quantity - v_item.quantity, updated_at = NOW()
    WHERE id = v_item.product_id;
  END LOOP;

  RETURN v_kit_id;
END;
$$;

-- Calcula o percentual de comissão conforme as faixas do vendedor
CREATE OR REPLACE FUNCTION commission_percent_for(p_seller_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pct NUMERIC;
BEGIN
  -- Faixa específica do vendedor
  SELECT percent INTO v_pct FROM commission_tiers
  WHERE seller_id = p_seller_id
    AND p_amount >= min_amount
    AND (max_amount IS NULL OR p_amount <= max_amount)
  ORDER BY min_amount DESC LIMIT 1;

  -- Faixa padrão (seller_id NULL)
  IF v_pct IS NULL THEN
    SELECT percent INTO v_pct FROM commission_tiers
    WHERE seller_id IS NULL
      AND p_amount >= min_amount
      AND (max_amount IS NULL OR p_amount <= max_amount)
    ORDER BY min_amount DESC LIMIT 1;
  END IF;

  RETURN COALESCE(v_pct, 0);
END;
$$;

-- Faz o acerto: registra o que vendeu, devolve o saldo ao estoque,
-- calcula a comissão e lança a entrada no caixa.
CREATE OR REPLACE FUNCTION settle_consignment_kit(
  p_kit_id UUID,
  p_sold JSONB,             -- [{item_id, quantity_sold}]
  p_method payment_method DEFAULT 'dinheiro',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kit consignment_kits;
  v_row RECORD;
  v_item consignment_kit_items;
  v_total NUMERIC := 0;
  v_pct NUMERIC;
  v_comm NUMERIC;
  v_net NUMERIC;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem fazer o acerto.';
  END IF;

  SELECT * INTO v_kit FROM consignment_kits WHERE id = p_kit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kit não encontrado.'; END IF;
  IF v_kit.status <> 'aberto' THEN RAISE EXCEPTION 'Este kit já foi acertado.'; END IF;

  -- Registra o vendido por item e devolve o restante ao estoque
  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_sold) AS x(item_id UUID, quantity_sold NUMERIC)
  LOOP
    SELECT * INTO v_item FROM consignment_kit_items WHERE id = v_row.item_id AND kit_id = p_kit_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_row.quantity_sold < 0 OR v_row.quantity_sold > v_item.quantity THEN
      RAISE EXCEPTION 'Quantidade vendida inválida (máx: %).', v_item.quantity;
    END IF;

    UPDATE consignment_kit_items SET quantity_sold = v_row.quantity_sold WHERE id = v_item.id;
    v_total := v_total + (v_row.quantity_sold * v_item.unit_price);
  END LOOP;

  -- Devolve ao estoque tudo que não foi vendido
  FOR v_item IN SELECT * FROM consignment_kit_items WHERE kit_id = p_kit_id LOOP
    IF v_item.quantity - v_item.quantity_sold > 0 THEN
      UPDATE products
        SET stock_quantity = stock_quantity + (v_item.quantity - v_item.quantity_sold),
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  v_pct := commission_percent_for(v_kit.seller_id, v_total);
  v_comm := ROUND(v_total * v_pct / 100, 2);
  v_net := v_total - v_comm;

  UPDATE consignment_kits SET
    status = 'acertado',
    settled_at = NOW(),
    total_sold = v_total,
    commission_percent = v_pct,
    commission_amount = v_comm,
    net_amount = v_net,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_kit_id;

  -- Entrada no caixa (valor líquido recebido do vendedor)
  IF v_net > 0 THEN
    INSERT INTO cash_movements (sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by, notes)
    VALUES (NULL, NULL, NULL, v_net, p_method, 'venda', NOW(), auth.uid(),
      'Acerto do kit consignado #' || v_kit.kit_number);
  END IF;

  RETURN jsonb_build_object(
    'total_sold', v_total, 'commission_percent', v_pct,
    'commission_amount', v_comm, 'net_amount', v_net
  );
END;
$$;

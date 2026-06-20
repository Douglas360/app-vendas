-- ============================================================
-- APP VENDAS / PDV — Schema Inicial
-- Supabase (PostgreSQL)
-- ============================================================
-- Convenções:
--   • snake_case para todos os identificadores
--   • UUID como PK (gen_random_uuid())
--   • created_at / updated_at com timestamptz
--   • Soft-delete não utilizado neste MVP (delete físico)
--   • RLS habilitado em todas as tabelas
-- ============================================================

-- 0. Extensões necessárias
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- 1. ENUM Types
-- ============================================================

-- Papel do usuário no sistema
CREATE TYPE user_role AS ENUM ('admin', 'vendedor');

-- Status da venda
CREATE TYPE sale_status AS ENUM ('aberta', 'finalizada', 'cancelada');

-- Formas de pagamento
CREATE TYPE payment_method AS ENUM (
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'fiado'
);

-- Status do pagamento
CREATE TYPE payment_status AS ENUM ('pendente', 'pago', 'parcial', 'cancelado');

-- Status das parcelas do fiado
CREATE TYPE installment_status AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');


-- 2. PROFILES (extensão do auth.users)
-- ============================================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'vendedor',
  avatar_url    TEXT,
  phone         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Perfil estendido dos usuários (vendedores e admins)';


-- 3. CLIENTES
-- ============================================================
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT           NOT NULL,
  email           TEXT,
  phone           TEXT,
  cpf_cnpj        TEXT           UNIQUE,
  
  -- Endereço
  address_street  TEXT,
  address_number  TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city    TEXT,
  address_state   CHAR(2),
  address_zip     TEXT,
  
  -- Crédito / Fiado
  credit_limit    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  current_debt    NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  notes           TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by      UUID          REFERENCES profiles(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Cadastro de clientes com controle de crédito/fiado';

CREATE INDEX idx_customers_name ON customers USING GIN (to_tsvector('portuguese', full_name));
CREATE INDEX idx_customers_cpf  ON customers (cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers (phone) WHERE phone IS NOT NULL;


-- 4. CATEGORIAS DE PRODUTO
-- ============================================================
CREATE TABLE product_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  color       TEXT,            -- cor hex para UI (#FF5733)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_categories IS 'Categorias para organização dos produtos';


-- 5. PRODUTOS
-- ============================================================
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT           NOT NULL,
  description     TEXT,
  sku             TEXT           UNIQUE,
  barcode         TEXT           UNIQUE,
  category_id     UUID           REFERENCES product_categories(id) ON DELETE SET NULL,
  
  -- Preços
  cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  sale_price      NUMERIC(12,2) NOT NULL,
  
  -- Estoque
  stock_quantity  INTEGER       NOT NULL DEFAULT 0,
  min_stock       INTEGER       NOT NULL DEFAULT 0,  -- alerta de estoque baixo
  
  -- Controle
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  image_url       TEXT,
  unit            TEXT          NOT NULL DEFAULT 'un',  -- un, kg, lt, etc.
  
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Cadastro de produtos com controle de estoque e preços';

CREATE INDEX idx_products_name    ON products USING GIN (to_tsvector('portuguese', name));
CREATE INDEX idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_sku     ON products (sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_category ON products (category_id);


-- 6. VENDAS (cabeçalho)
-- ============================================================
CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number     SERIAL,                          -- número sequencial legível
  customer_id     UUID           REFERENCES customers(id) ON DELETE SET NULL,
  seller_id       UUID           NOT NULL REFERENCES profiles(id),
  
  -- Valores
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  
  -- Controle
  status          sale_status    NOT NULL DEFAULT 'aberta',
  notes           TEXT,
  
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finalized_at    TIMESTAMPTZ                      -- quando a venda foi concluída
);

COMMENT ON TABLE sales IS 'Cabeçalho das vendas / pedidos do PDV';

CREATE INDEX idx_sales_customer  ON sales (customer_id);
CREATE INDEX idx_sales_seller    ON sales (seller_id);
CREATE INDEX idx_sales_status    ON sales (status);
CREATE INDEX idx_sales_created   ON sales (created_at DESC);


-- 7. ITENS DA VENDA
-- ============================================================
CREATE TABLE sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID           NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      UUID           NOT NULL REFERENCES products(id),
  
  quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) NOT NULL,           -- preço no momento da venda
  cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0, -- custo no momento (para relatórios)
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total           NUMERIC(12,2) NOT NULL,           -- (quantity * unit_price) - discount
  
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sale_items IS 'Itens individuais de cada venda';

CREATE INDEX idx_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);


-- 8. PAGAMENTOS
-- ============================================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID           NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id     UUID           REFERENCES customers(id),
  
  method          payment_method NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pendente',
  amount          NUMERIC(12,2) NOT NULL,
  
  -- Parcelamento (para cartão crédito)
  installments    INTEGER       NOT NULL DEFAULT 1,
  
  notes           TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Registros de pagamento de cada venda (pode haver múltiplos por venda)';

CREATE INDEX idx_payments_sale     ON payments (sale_id);
CREATE INDEX idx_payments_customer ON payments (customer_id);
CREATE INDEX idx_payments_status   ON payments (status);
CREATE INDEX idx_payments_method   ON payments (method);


-- 9. FIADO / CREDIÁRIO (parcelas)
-- ============================================================
CREATE TABLE credit_installments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID           NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  customer_id     UUID           NOT NULL REFERENCES customers(id),
  sale_id         UUID           NOT NULL REFERENCES sales(id),
  
  installment_number INTEGER    NOT NULL,           -- 1, 2, 3...
  amount          NUMERIC(12,2) NOT NULL,           -- valor da parcela
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0, -- quanto já foi pago
  due_date        DATE          NOT NULL,           -- data de vencimento
  paid_date       DATE,                             -- data do pagamento efetivo
  status          installment_status NOT NULL DEFAULT 'pendente',
  
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE credit_installments IS 'Parcelas do fiado/crediário atreladas ao cliente';

CREATE INDEX idx_credit_inst_customer ON credit_installments (customer_id);
CREATE INDEX idx_credit_inst_payment  ON credit_installments (payment_id);
CREATE INDEX idx_credit_inst_sale     ON credit_installments (sale_id);
CREATE INDEX idx_credit_inst_status   ON credit_installments (status);
CREATE INDEX idx_credit_inst_due      ON credit_installments (due_date);


-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- A) Atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em todas as tabelas com updated_at
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_credit_installments_updated_at
  BEFORE UPDATE ON credit_installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- B) Criar perfil automaticamente ao registrar usuário
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'vendedor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- C) Recalcular total do item da venda
-- ============================================================
CREATE OR REPLACE FUNCTION calc_sale_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total = (NEW.quantity * NEW.unit_price) - NEW.discount_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_sale_item_total
  BEFORE INSERT OR UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION calc_sale_item_total();


-- D) Recalcular subtotal/total da venda ao alterar itens
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_sale_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_id UUID;
  v_subtotal NUMERIC(12,2);
BEGIN
  -- Determinar qual sale_id atualizar
  IF TG_OP = 'DELETE' THEN
    v_sale_id := OLD.sale_id;
  ELSE
    v_sale_id := NEW.sale_id;
  END IF;

  -- Somar todos os itens da venda
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM sale_items
  WHERE sale_id = v_sale_id;

  -- Atualizar a venda
  UPDATE sales
  SET subtotal = v_subtotal,
      total = v_subtotal - discount_amount
  WHERE id = v_sale_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_sale_totals
  AFTER INSERT OR UPDATE OR DELETE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION recalc_sale_totals();


-- E) Atualizar estoque ao finalizar venda
-- ============================================================
CREATE OR REPLACE FUNCTION handle_sale_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando a venda é finalizada, dar baixa no estoque
  IF NEW.status = 'finalizada' AND OLD.status = 'aberta' THEN
    NEW.finalized_at = NOW();
    
    UPDATE products p
    SET stock_quantity = p.stock_quantity - si.quantity
    FROM sale_items si
    WHERE si.sale_id = NEW.id
      AND si.product_id = p.id;
  END IF;
  
  -- Quando a venda é cancelada (e antes era finalizada), devolver estoque
  IF NEW.status = 'cancelada' AND OLD.status = 'finalizada' THEN
    UPDATE products p
    SET stock_quantity = p.stock_quantity + si.quantity
    FROM sale_items si
    WHERE si.sale_id = NEW.id
      AND si.product_id = p.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_sale_status
  BEFORE UPDATE ON sales
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION handle_sale_status_change();


-- F) Atualizar dívida do cliente ao criar/alterar parcelas de fiado
-- ============================================================
CREATE OR REPLACE FUNCTION update_customer_debt()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id UUID;
  v_total_debt NUMERIC(12,2);
BEGIN
  -- Determinar customer_id
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  -- Recalcular dívida total = soma de (amount - amount_paid) das parcelas pendentes/atrasadas
  SELECT COALESCE(SUM(amount - amount_paid), 0) INTO v_total_debt
  FROM credit_installments
  WHERE customer_id = v_customer_id
    AND status IN ('pendente', 'atrasado');

  UPDATE customers
  SET current_debt = v_total_debt
  WHERE id = v_customer_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_customer_debt
  AFTER INSERT OR UPDATE OR DELETE ON credit_installments
  FOR EACH ROW EXECUTE FUNCTION update_customer_debt();


-- G) Validar limite de crédito antes de criar pagamento fiado
-- ============================================================
CREATE OR REPLACE FUNCTION validate_credit_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_credit_limit  NUMERIC(12,2);
  v_current_debt  NUMERIC(12,2);
BEGIN
  -- Só validar para pagamentos do tipo fiado
  IF NEW.method != 'fiado' THEN
    RETURN NEW;
  END IF;
  
  -- Precisa ter cliente associado
  IF NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento fiado requer um cliente associado.';
  END IF;

  SELECT credit_limit, current_debt 
  INTO v_credit_limit, v_current_debt
  FROM customers
  WHERE id = NEW.customer_id;

  -- Verificar se o novo valor não excede o limite
  IF (v_current_debt + NEW.amount) > v_credit_limit AND v_credit_limit > 0 THEN
    RAISE EXCEPTION 'Limite de crédito excedido. Limite: R$ %, Dívida atual: R$ %, Valor solicitado: R$ %',
      v_credit_limit, v_current_debt, NEW.amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_credit_limit
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION validate_credit_limit();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_installments  ENABLE ROW LEVEL SECURITY;

-- Função helper: verificar se o user é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- PROFILES -----------------------------------------------
-- Todos autenticados podem ver perfis
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (TRUE);

-- Usuário pode editar seu próprio perfil
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins podem editar qualquer perfil
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- CUSTOMERS -----------------------------------------------
CREATE POLICY "customers_select" ON customers
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "customers_insert" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "customers_update" ON customers
  FOR UPDATE TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "customers_delete" ON customers
  FOR DELETE TO authenticated
  USING (is_admin());

-- PRODUCT CATEGORIES -----------------------------------------------
CREATE POLICY "categories_select" ON product_categories
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "categories_insert" ON product_categories
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "categories_update" ON product_categories
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "categories_delete" ON product_categories
  FOR DELETE TO authenticated
  USING (is_admin());

-- PRODUCTS -----------------------------------------------
CREATE POLICY "products_select" ON products
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "products_insert" ON products
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "products_update" ON products
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "products_delete" ON products
  FOR DELETE TO authenticated
  USING (is_admin());

-- SALES -----------------------------------------------
CREATE POLICY "sales_select" ON sales
  FOR SELECT TO authenticated
  USING (TRUE);

-- Qualquer autenticado pode criar vendas
CREATE POLICY "sales_insert" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

-- Vendedor pode editar suas vendas abertas; admin pode editar qualquer
CREATE POLICY "sales_update" ON sales
  FOR UPDATE TO authenticated
  USING (
    (seller_id = auth.uid() AND status = 'aberta')
    OR is_admin()
  )
  WITH CHECK (
    (seller_id = auth.uid() AND status = 'aberta')
    OR is_admin()
  );

-- SALE ITEMS -----------------------------------------------
CREATE POLICY "sale_items_select" ON sale_items
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "sale_items_insert" ON sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE id = sale_id
        AND (seller_id = auth.uid() OR is_admin())
        AND status = 'aberta'
    )
  );

CREATE POLICY "sale_items_update" ON sale_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE id = sale_id
        AND (seller_id = auth.uid() OR is_admin())
        AND status = 'aberta'
    )
  );

CREATE POLICY "sale_items_delete" ON sale_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE id = sale_id
        AND (seller_id = auth.uid() OR is_admin())
        AND status = 'aberta'
    )
  );

-- PAYMENTS -----------------------------------------------
CREATE POLICY "payments_select" ON payments
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "payments_insert" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "payments_update" ON payments
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- CREDIT INSTALLMENTS -----------------------------------------------
CREATE POLICY "credit_installments_select" ON credit_installments
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "credit_installments_insert" ON credit_installments
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- Admins e vendedores podem dar baixa em parcelas
CREATE POLICY "credit_installments_update" ON credit_installments
  FOR UPDATE TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);


-- ============================================================
-- FUNÇÕES UTILITÁRIAS (para uso no front-end via RPC)
-- ============================================================

-- Buscar resumo de débitos do cliente
CREATE OR REPLACE FUNCTION get_customer_debt_summary(p_customer_id UUID)
RETURNS TABLE (
  total_debt       NUMERIC,
  total_paid       NUMERIC,
  total_overdue    NUMERIC,
  installments_pending  INTEGER,
  installments_overdue  INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(ci.amount - ci.amount_paid) FILTER (WHERE ci.status IN ('pendente', 'atrasado')), 0) AS total_debt,
    COALESCE(SUM(ci.amount_paid), 0) AS total_paid,
    COALESCE(SUM(ci.amount - ci.amount_paid) FILTER (WHERE ci.status = 'atrasado'), 0) AS total_overdue,
    COUNT(*) FILTER (WHERE ci.status = 'pendente')::INTEGER AS installments_pending,
    COUNT(*) FILTER (WHERE ci.status = 'atrasado')::INTEGER AS installments_overdue
  FROM credit_installments ci
  WHERE ci.customer_id = p_customer_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Dar baixa (parcial ou total) em uma parcela
CREATE OR REPLACE FUNCTION pay_installment(
  p_installment_id UUID,
  p_amount NUMERIC
)
RETURNS credit_installments AS $$
DECLARE
  v_installment credit_installments;
  v_remaining NUMERIC;
BEGIN
  SELECT * INTO v_installment
  FROM credit_installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF v_installment.status IN ('pago', 'cancelado') THEN
    RAISE EXCEPTION 'Parcela já está % e não pode receber pagamento.', v_installment.status;
  END IF;

  v_remaining := v_installment.amount - v_installment.amount_paid;

  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Valor do pagamento (R$ %) excede o saldo restante (R$ %).', p_amount, v_remaining;
  END IF;

  -- Atualizar parcela
  UPDATE credit_installments
  SET
    amount_paid = amount_paid + p_amount,
    status = CASE
      WHEN (amount_paid + p_amount) >= amount THEN 'pago'
      ELSE status
    END,
    paid_date = CASE
      WHEN (amount_paid + p_amount) >= amount THEN CURRENT_DATE
      ELSE paid_date
    END,
    updated_at = NOW()
  WHERE id = p_installment_id
  RETURNING * INTO v_installment;

  RETURN v_installment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Marcar parcelas vencidas como "atrasado" (para uso com pg_cron ou edge function)
CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE credit_installments
  SET status = 'atrasado',
      updated_at = NOW()
  WHERE status = 'pendente'
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

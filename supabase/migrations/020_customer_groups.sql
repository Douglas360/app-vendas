-- ============================================================
-- Grupos de clientes + vínculo no cadastro do cliente
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customer_groups IS 'Grupos para organização dos clientes';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES customer_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_group ON customers (group_id);

ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_groups_select" ON customer_groups;
CREATE POLICY "customer_groups_select" ON customer_groups
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "customer_groups_insert" ON customer_groups;
CREATE POLICY "customer_groups_insert" ON customer_groups
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "customer_groups_update" ON customer_groups;
CREATE POLICY "customer_groups_update" ON customer_groups
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "customer_groups_delete" ON customer_groups;
CREATE POLICY "customer_groups_delete" ON customer_groups
  FOR DELETE TO authenticated USING (is_admin());

DROP TRIGGER IF EXISTS trg_customer_groups_updated_at ON customer_groups;
CREATE TRIGGER trg_customer_groups_updated_at
  BEFORE UPDATE ON customer_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

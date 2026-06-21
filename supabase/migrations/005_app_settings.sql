-- ============================================================
-- Configurações gerais do app (linha única)
-- Guarda a integração WhatsApp / Evolution API
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id                  SMALLINT PRIMARY KEY DEFAULT 1,
  evolution_url       TEXT,
  evolution_api_key   TEXT,
  evolution_instance  TEXT,
  evolution_connected BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (necessário para o PDV enviar o comprovante)
DROP POLICY IF EXISTS "app_settings_select" ON app_settings;
CREATE POLICY "app_settings_select" ON app_settings
  FOR SELECT TO authenticated USING (TRUE);

-- Apenas admin configura
DROP POLICY IF EXISTS "app_settings_insert" ON app_settings;
CREATE POLICY "app_settings_insert" ON app_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "app_settings_update" ON app_settings;
CREATE POLICY "app_settings_update" ON app_settings
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Linha única inicial
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

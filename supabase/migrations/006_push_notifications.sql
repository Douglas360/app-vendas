-- ============================================================
-- Notificações push (Web Push) + central in-app + agendamento
-- ============================================================
-- Lembretes de crediário: véspera, no dia e atrasadas.
-- Enviados às 09:00 (BRT) apenas para administradores.
--
-- Componentes complementares (configurados fora deste arquivo):
--   • Edge Function "lembretes-crediario" (envia o Web Push)
--   • Job pg_cron "lembretes-crediario-diario" (0 12 * * * = 09:00 BRT)
--   • Chaves VAPID e cron_secret gravados em app_secrets
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Inscrições de Web Push (uma por aparelho/navegador)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_select_own" ON push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_subs_insert_own" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_delete_own" ON push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- Central de notificações in-app (sininho)
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT,
  link        TEXT,
  metadata    JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select_own" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id) WHERE is_read = FALSE;

-- Segredos do servidor (VAPID privada + cron secret) — sem policy => só service_role
CREATE TABLE IF NOT EXISTS app_secrets (
  id            SMALLINT PRIMARY KEY DEFAULT 1,
  vapid_public  TEXT,
  vapid_private TEXT,
  cron_secret   TEXT,
  CONSTRAINT app_secrets_singleton CHECK (id = 1)
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO app_secrets (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Chave pública VAPID exposta aos clientes
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS vapid_public_key TEXT;

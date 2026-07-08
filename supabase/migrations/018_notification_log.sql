-- ============================================================
-- Histórico de notificações enviadas (todos os canais)
-- status: em_andamento | enviado | falhou
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        TEXT NOT NULL,                 -- 'whatsapp' | 'push'
  kind           TEXT NOT NULL,                 -- comprovante | confirmacao_pagamento | lembrete | cobranca_manual | alerta_admin
  recipient_type TEXT,                          -- 'cliente' | 'admin'
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  recipient_name TEXT,
  recipient_phone TEXT,
  title          TEXT,
  body           TEXT,
  status         TEXT NOT NULL DEFAULT 'em_andamento',
  error          TEXT,
  sale_id        UUID REFERENCES sales(id) ON DELETE SET NULL,
  installment_id UUID REFERENCES credit_installments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_created ON notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_status  ON notification_log (status);
CREATE INDEX IF NOT EXISTS idx_notif_log_customer ON notification_log (customer_id);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_log_select" ON notification_log;
CREATE POLICY "notif_log_select" ON notification_log
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "notif_log_insert" ON notification_log;
CREATE POLICY "notif_log_insert" ON notification_log
  FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS "notif_log_update" ON notification_log;
CREATE POLICY "notif_log_update" ON notification_log
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

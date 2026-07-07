-- ============================================================
-- Lembretes de crediário via WhatsApp para o CLIENTE
--   - store_name: nome da loja usado na mensagem (assinatura)
--   - wa_reminders_enabled: liga/desliga o envio ao cliente
--   - whatsapp_reminders_log: idempotência (1 envio por parcela/bucket/dia)
-- ============================================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS wa_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS whatsapp_reminders_log (
  installment_id UUID NOT NULL REFERENCES credit_installments(id) ON DELETE CASCADE,
  bucket         TEXT NOT NULL,          -- vespera | hoje | atrasada
  sent_on        DATE NOT NULL,          -- dia do envio (BRT)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (installment_id, bucket, sent_on)
);

-- Somente o service_role (edge function) acessa; sem policies => bloqueado para authenticated
ALTER TABLE whatsapp_reminders_log ENABLE ROW LEVEL SECURITY;

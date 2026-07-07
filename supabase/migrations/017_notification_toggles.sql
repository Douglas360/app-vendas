-- ============================================================
-- Interruptores das notificações automáticas do WhatsApp
--   - wa_receipt_enabled: envia o comprovante ao finalizar a venda
--   - wa_payment_confirm_enabled: envia confirmação ao receber parcela
-- (wa_reminders_enabled já existe na migração 015)
-- ============================================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS wa_receipt_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS wa_payment_confirm_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- Chave PIX para pagamento das parcelas (usada nas mensagens de
-- recibo e nos lembretes/cobranças do WhatsApp)
-- ============================================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pix_key TEXT;

UPDATE app_settings SET pix_key = '(41) 998092304' WHERE id = 1 AND (pix_key IS NULL OR pix_key = '');

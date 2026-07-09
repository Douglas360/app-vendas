-- ============================================================
-- Modelos de mensagem editáveis (WhatsApp)
-- Guardados em JSONB. Quando NULL, o app usa os textos padrão.
-- Chaves: lembrete_vespera, lembrete_hoje, lembrete_atraso, confirmacao_pagamento
-- Variáveis: {primeiro_nome} {cliente} {valor} {vencimento} {pix} {loja}
--            (confirmação: {valor_pago} {parcela} {venda} {status_parcela} {saldo_linha})
-- ============================================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS message_templates JSONB;

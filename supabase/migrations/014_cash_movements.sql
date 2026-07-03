-- ============================================================
-- Livro-caixa (regime de caixa): registra cada ENTRADA de dinheiro
--   - venda à vista (dinheiro/pix/cartão) no momento da venda
--   - recebimento de parcela do crediário no dia do pagamento
-- Isso convive com o faturamento (competência) já usado no dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        UUID REFERENCES sales(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  installment_id UUID REFERENCES credit_installments(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  method         payment_method,
  -- 'venda' = entrada à vista na hora da venda; 'parcela' = recebimento de crediário
  kind           TEXT NOT NULL CHECK (kind IN ('venda', 'parcela')),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cash_movements IS 'Livro-caixa: entradas de dinheiro efetivas (à vista + recebimento de parcelas)';

CREATE INDEX IF NOT EXISTS idx_cash_mov_occurred ON cash_movements (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_mov_customer ON cash_movements (customer_id);
CREATE INDEX IF NOT EXISTS idx_cash_mov_sale     ON cash_movements (sale_id);
CREATE INDEX IF NOT EXISTS idx_cash_mov_kind     ON cash_movements (kind);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_select" ON cash_movements;
CREATE POLICY "cash_movements_select" ON cash_movements
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "cash_movements_insert" ON cash_movements;
CREATE POLICY "cash_movements_insert" ON cash_movements
  FOR INSERT TO authenticated WITH CHECK (TRUE);

-- ------------------------------------------------------------
-- Gatilho: quando um pagamento à vista é criado (método != fiado),
-- registra a entrada no livro-caixa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_avista_cash()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.method <> 'fiado' THEN
    INSERT INTO cash_movements (
      sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by
    ) VALUES (
      NEW.sale_id, NEW.customer_id, NULL, NEW.amount, NEW.method, 'venda',
      COALESCE(NEW.paid_at, NOW()), auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_avista_cash ON payments;
CREATE TRIGGER trg_record_avista_cash
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION record_avista_cash();

-- ------------------------------------------------------------
-- pay_installment: além de abater a parcela, grava a entrada no caixa.
-- (recria a função de 001 com o registro do recebimento)
-- ------------------------------------------------------------
-- Remove a versão antiga de 2 argumentos para evitar sobrecarga ambígua
DROP FUNCTION IF EXISTS pay_installment(uuid, numeric);

CREATE OR REPLACE FUNCTION pay_installment(
  p_installment_id UUID,
  p_amount NUMERIC,
  p_method payment_method DEFAULT 'dinheiro'
)
RETURNS credit_installments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  -- Registra a entrada de dinheiro no livro-caixa
  INSERT INTO cash_movements (
    sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by, notes
  ) VALUES (
    v_installment.sale_id, v_installment.customer_id, v_installment.id, p_amount,
    p_method, 'parcela', NOW(), auth.uid(),
    'Recebimento da ' || v_installment.installment_number || 'ª parcela'
  );

  RETURN v_installment;
END;
$$;

-- ------------------------------------------------------------
-- cancel_sale: ao cancelar a venda, estorna as entradas de caixa dela.
-- (recria a função de 007 com o DELETE das movimentações)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale sales;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar vendas.';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_sale.status = 'cancelada' THEN RETURN; END IF;

  UPDATE credit_installments
    SET status = 'cancelado', updated_at = NOW()
    WHERE sale_id = p_sale_id AND status IN ('pendente', 'atrasado');

  UPDATE payments SET status = 'cancelado', updated_at = NOW() WHERE sale_id = p_sale_id;

  -- Estorna as entradas de caixa desta venda
  DELETE FROM cash_movements WHERE sale_id = p_sale_id;

  UPDATE sales SET status = 'cancelada', updated_at = NOW() WHERE id = p_sale_id;
END;
$$;

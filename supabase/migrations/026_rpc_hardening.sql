-- ============================================================
-- Correção de segurança: funções SECURITY DEFINER expostas ao
-- papel "anon" via PostgREST (/rest/v1/rpc/...).
--
-- A chave anon é pública por natureza num app Supabase (vai no
-- JavaScript do navegador), então tudo que o anon pode executar
-- é, na prática, executável por qualquer pessoa na internet.
--
-- 1) Exige usuário autenticado em pay_installment e
--    pay_customer_amount, que só usavam auth.uid() para REGISTRAR
--    quem recebeu, sem nunca VERIFICAR se podia receber.
-- 2) Revoga EXECUTE do anon em todas as funções SECURITY DEFINER
--    do schema public. Usuários logados seguem iguais.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Guarda de autenticação nas funções de pagamento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount NUMERIC,
  p_method payment_method DEFAULT 'dinheiro'::payment_method
)
RETURNS credit_installments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_installment credit_installments;
  v_remaining NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário estar autenticado para registrar pagamentos.';
  END IF;

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

  INSERT INTO cash_movements (
    sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by, notes
  ) VALUES (
    v_installment.sale_id, v_installment.customer_id, v_installment.id, p_amount,
    p_method, 'parcela', NOW(), auth.uid(),
    'Recebimento da ' || v_installment.installment_number || 'ª parcela'
  );

  RETURN v_installment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pay_customer_amount(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_method payment_method DEFAULT 'dinheiro'::payment_method
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rest NUMERIC := p_amount;
  v_apply NUMERIC;
  v_total_open NUMERIC;
  v_details JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário estar autenticado para registrar pagamentos.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido.';
  END IF;

  SELECT COALESCE(SUM(amount - amount_paid), 0) INTO v_total_open
  FROM credit_installments
  WHERE customer_id = p_customer_id AND status IN ('pendente', 'atrasado');

  IF v_total_open <= 0 THEN
    RAISE EXCEPTION 'O cliente não possui parcelas em aberto.';
  END IF;

  IF p_amount > v_total_open + 0.001 THEN
    RAISE EXCEPTION 'Valor (R$ %) excede o total devido (R$ %).', p_amount, v_total_open;
  END IF;

  FOR r IN
    SELECT * FROM credit_installments
    WHERE customer_id = p_customer_id AND status IN ('pendente', 'atrasado')
    ORDER BY due_date, installment_number
    FOR UPDATE
  LOOP
    EXIT WHEN v_rest <= 0.001;
    v_apply := LEAST(v_rest, r.amount - r.amount_paid);
    CONTINUE WHEN v_apply <= 0;

    UPDATE credit_installments SET
      amount_paid = amount_paid + v_apply,
      status = CASE WHEN amount_paid + v_apply >= amount THEN 'pago' ELSE status END,
      paid_date = CASE WHEN amount_paid + v_apply >= amount THEN CURRENT_DATE ELSE paid_date END,
      updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO cash_movements (
      sale_id, customer_id, installment_id, amount, method, kind, occurred_at, created_by, notes
    ) VALUES (
      r.sale_id, p_customer_id, r.id, v_apply, p_method, 'parcela', NOW(), auth.uid(),
      'Recebimento da ' || r.installment_number || 'ª parcela (pagamento avulso)'
    );

    v_details := v_details || jsonb_build_object(
      'installment_number', r.installment_number,
      'applied', v_apply
    );
    v_rest := v_rest - v_apply;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_amount - v_rest,
    'remaining_debt', GREATEST(0, v_total_open - (p_amount - v_rest)),
    'installments', v_details
  );
END;
$function$;

-- ------------------------------------------------------------
-- 2. Tira o anon de todas as funções SECURITY DEFINER do public
-- ------------------------------------------------------------
-- Atenção: o EXECUTE não vinha de um grant direto ao anon, e sim do grant
-- padrão do Postgres para PUBLIC (que inclui anon). Revogar só do anon não
-- surte efeito nenhum — é preciso tirar de PUBLIC e devolver explicitamente
-- a authenticated e service_role.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
    RAISE NOTICE 'EXECUTE fechado para o anon em %', f.assinatura;
  END LOOP;
END;
$$;

-- Novas funções não nascem liberadas para PUBLIC/anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

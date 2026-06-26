-- ============================================================
-- Geração de código de barras EAN-13 para produtos sem código
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS barcode_seq START 1;

CREATE OR REPLACE FUNCTION generate_missing_barcodes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_base TEXT;
  v_sum INT;
  v_digit INT;
  v_check INT;
  i INT;
  v_count INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar códigos de barras.';
  END IF;

  FOR r IN
    SELECT id FROM products
    WHERE barcode IS NULL OR barcode = ''
    ORDER BY created_at
  LOOP
    v_base := '200' || LPAD(nextval('barcode_seq')::text, 9, '0');  -- 12 dígitos

    v_sum := 0;
    FOR i IN 1..12 LOOP
      v_digit := substr(v_base, i, 1)::int;
      IF i % 2 = 1 THEN
        v_sum := v_sum + v_digit;
      ELSE
        v_sum := v_sum + v_digit * 3;
      END IF;
    END LOOP;
    v_check := (10 - (v_sum % 10)) % 10;

    UPDATE products SET barcode = v_base || v_check::text, updated_at = NOW()
      WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

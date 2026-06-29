-- ============================================================
-- Códigos de barras curtos (6 dígitos, Code 128) para etiqueta pequena
-- Substitui a geração EAN-13 anterior. Adiciona regenerate_barcodes_for.
-- ============================================================

CREATE OR REPLACE FUNCTION next_barcode()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN LPAD(nextval('barcode_seq')::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_missing_barcodes()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Apenas administradores podem gerar códigos de barras.'; END IF;
  FOR r IN SELECT id FROM products WHERE barcode IS NULL OR barcode = '' ORDER BY created_at LOOP
    UPDATE products SET barcode = LPAD(nextval('barcode_seq')::text, 6, '0'), updated_at = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION generate_barcodes_for(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Apenas administradores podem gerar códigos de barras.'; END IF;
  FOR r IN SELECT id FROM products WHERE id = ANY(p_ids) AND (barcode IS NULL OR barcode = '') ORDER BY created_at LOOP
    UPDATE products SET barcode = LPAD(nextval('barcode_seq')::text, 6, '0'), updated_at = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Regera (substitui) códigos. p_ids NULL = todos os produtos.
CREATE OR REPLACE FUNCTION regenerate_barcodes_for(p_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Apenas administradores podem gerar códigos de barras.'; END IF;
  FOR r IN SELECT id FROM products WHERE p_ids IS NULL OR id = ANY(p_ids) ORDER BY created_at LOOP
    UPDATE products SET barcode = LPAD(nextval('barcode_seq')::text, 6, '0'), updated_at = NOW() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

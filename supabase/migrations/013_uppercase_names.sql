-- ============================================================
-- Nomes de clientes e produtos sempre em MAIÚSCULAS (e sem espaços nas pontas)
-- ============================================================

-- Normaliza os registros existentes
UPDATE customers SET full_name = upper(trim(full_name))
  WHERE full_name IS DISTINCT FROM upper(trim(full_name));
UPDATE products SET name = upper(trim(name))
  WHERE name IS DISTINCT FROM upper(trim(name));

-- Gatilhos para manter automático em novos cadastros/edições
CREATE OR REPLACE FUNCTION uppercase_customer_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.full_name IS NOT NULL THEN
    NEW.full_name := upper(trim(NEW.full_name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uppercase_customer_name ON customers;
CREATE TRIGGER trg_uppercase_customer_name
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION uppercase_customer_name();

CREATE OR REPLACE FUNCTION uppercase_product_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := upper(trim(NEW.name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uppercase_product_name ON products;
CREATE TRIGGER trg_uppercase_product_name
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION uppercase_product_name();

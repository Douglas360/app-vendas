-- ============================================================
-- Catálogo público (vitrine): leitura anônima de produtos ativos
-- e dados básicos da loja (sem expor chaves/API).
-- ============================================================

-- Número de WhatsApp da loja exibido no catálogo (botão Comprar)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS store_whatsapp TEXT;
UPDATE app_settings SET store_whatsapp = '41998092304'
  WHERE id = 1 AND (store_whatsapp IS NULL OR store_whatsapp = '');

-- Produtos ativos visíveis para visitantes (somente leitura)
DROP POLICY IF EXISTS "products_select_anon" ON products;
CREATE POLICY "products_select_anon" ON products
  FOR SELECT TO anon USING (is_active = TRUE);

-- Categorias visíveis para visitantes
DROP POLICY IF EXISTS "categories_select_anon" ON product_categories;
CREATE POLICY "categories_select_anon" ON product_categories
  FOR SELECT TO anon USING (TRUE);

-- View segura com apenas os dados públicos da loja
CREATE OR REPLACE VIEW catalog_info AS
  SELECT store_name, store_whatsapp FROM app_settings WHERE id = 1;
GRANT SELECT ON catalog_info TO anon, authenticated;

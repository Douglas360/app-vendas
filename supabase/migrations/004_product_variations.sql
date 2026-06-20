-- Migração: Suporte a Variações de Produtos (Grade de Tamanhos, Cores, etc.)

ALTER TABLE products 
  ADD COLUMN parent_id UUID REFERENCES products(id) ON DELETE CASCADE,
  ADD COLUMN attributes JSONB;

-- Índices para otimização de consultas
CREATE INDEX idx_products_parent ON products(parent_id);
CREATE INDEX idx_products_attributes ON products USING gin(attributes);

COMMENT ON COLUMN products.parent_id IS 'ID do produto pai (agrupador) caso este registro seja uma variação';
COMMENT ON COLUMN products.attributes IS 'Dicionário JSONB contendo os atributos desta variação, ex: {"cor": "Azul", "tamanho": "M"}';

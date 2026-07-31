-- ============================================================
-- Remove o limite de tamanho (5MB) das imagens de produto
-- ============================================================

UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'product-images';

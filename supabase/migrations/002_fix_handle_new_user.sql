-- ============================================================
-- FIX: "Database error saving new user" no cadastro (signUp)
-- ============================================================
-- Causa: a função handle_new_user() é SECURITY DEFINER mas NÃO
-- define search_path. Ela roda no contexto do role
-- `supabase_auth_admin` (dono do schema auth), cujo search_path
-- não inclui `public`. Assim, as referências NÃO qualificadas
-- `profiles` e `user_role` não são resolvidas e o trigger
-- estoura, fazendo o /auth/v1/signup retornar HTTP 500
-- "Database error saving new user".
--
-- Correção: fixar search_path = public e qualificar a tabela e
-- o tipo enum com o schema (public.profiles / public.user_role).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'vendedor')
  );
  RETURN NEW;
END;
$$;

-- Garantir que o role que executa o INSERT em auth.users consiga
-- enxergar o schema public (necessário em alguns projetos).
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- O trigger já existe (on_auth_user_created); como usamos
-- CREATE OR REPLACE FUNCTION, ele passa a usar a versão corrigida
-- automaticamente. Recriado abaixo apenas por segurança/idempotência.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

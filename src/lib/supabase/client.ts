import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  console.log("Supabase Client Init:", {
    url: supabaseUrl,
    keyLength: supabaseKey?.length || 0,
    keyStart: supabaseKey?.substring(0, 10),
  });

  if (
    !supabaseUrl ||
    !supabaseKey ||
    !supabaseUrl.startsWith("http") ||
    supabaseUrl.includes("your_supabase_url")
  ) {
    if (typeof window === "undefined") {
      // Safe mock client for SSR/Build-time rendering when env vars are not set
      const mock = new Proxy({} as any, {
        get(target, prop) {
          if (prop === "auth") {
            return new Proxy({} as any, {
              get(targetAuth, propAuth) {
                if (propAuth === "onAuthStateChange") {
                  return () => ({ data: { subscription: { unsubscribe: () => {} } } });
                }
                return () => Promise.resolve({});
              }
            });
          }
          return () => ({
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: null }),
                order: () => Promise.resolve({ data: [], error: null }),
              }),
              order: () => Promise.resolve({ data: [], error: null }),
            }),
            insert: () => Promise.resolve({ data: null, error: null }),
            update: () => Promise.resolve({ data: null, error: null }),
            delete: () => Promise.resolve({ data: null, error: null }),
          });
        }
      });
      return mock as ReturnType<typeof createBrowserClient>;
    }
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  client = createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}

"use client";

// ============================================================
// Catálogo público (vitrine) — sem login.
// Mostra os produtos ativos; o botão Comprar abre o WhatsApp
// da loja com a mensagem pronta.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  MessageCircle,
  Loader2,
  Package,
  Sparkles,
} from "lucide-react";

interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  sale_price: number;
  stock_quantity: number;
  image_url: string | null;
  category_id: string | null;
  parent_id: string | null;
  attributes: Record<string, string> | null;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CatalogoPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeName, setStoreName] = useState("Catálogo");
  const [storePhone, setStorePhone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes, infoRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, description, sale_price, stock_quantity, image_url, category_id, parent_id, attributes"
          )
          .eq("is_active", true)
          .order("name"),
        supabase.from("product_categories").select("id, name, color").order("name"),
        supabase.from("catalog_info").select("store_name, store_whatsapp").single(),
      ]);
      setProducts((prodRes.data as CatalogProduct[]) || []);
      setCategories((catRes.data as Category[]) || []);
      if (infoRes.data) {
        setStoreName(infoRes.data.store_name || "Catálogo");
        setStorePhone(infoRes.data.store_whatsapp || "");
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Produtos de topo (variações agregadas no pai)
  const items = useMemo(() => {
    const tops = products.filter((p) => !p.parent_id);
    return tops.map((p) => {
      const children = products.filter((c) => c.parent_id === p.id);
      const hasVar = children.length > 0;
      const stock = hasVar
        ? children.reduce((s, c) => s + c.stock_quantity, 0)
        : p.stock_quantity;
      const prices = hasVar ? children.map((c) => c.sale_price) : [p.sale_price];
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return { ...p, stock, minPrice, maxPrice, hasVar };
    });
  }, [products]);

  const shown = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter((p) => {
      const matchCat = catFilter === "all" || p.category_id === catFilter;
      const matchTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.description || "").toLowerCase().includes(term);
      return matchCat && matchTerm;
    });
  }, [items, search, catFilter]);

  function waLink(p: { name: string; minPrice: number }) {
    const digits = storePhone.replace(/\D/g, "");
    const number =
      digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
    const msg = `Olá! Vi no catálogo *${storeName}* e tenho interesse em:\n\n*${p.name}* — ${brl(
      p.minPrice
    )}\n\nAinda está disponível?`;
    return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Hero */}
      <header className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/70">
            <Sparkles className="h-3.5 w-3.5" /> Catálogo online
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {storeName}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            Confira nossos produtos e peça direto pelo WhatsApp.
          </p>
        </div>
      </header>

      {/* Busca + categorias */}
      <div className="sticky top-0 z-20 -mt-8 bg-transparent px-4">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </div>
            {categories.length > 0 && (
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setCatFilter("all")}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    catFilter === "all"
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  Todos
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatFilter(c.id)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      catFilter === c.id
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grade de produtos */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm text-zinc-500">Carregando produtos...</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Package className="h-10 w-10 text-zinc-300" />
            <p className="text-sm text-zinc-500">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {shown.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Link
                  href={`/catalogo/${p.id}`}
                  className="relative block aspect-square w-full overflow-hidden bg-zinc-100"
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-300">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                  {p.stock <= 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      Esgotado
                    </span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-3">
                  <Link
                    href={`/catalogo/${p.id}`}
                    className="line-clamp-2 text-sm font-semibold leading-snug transition-colors hover:text-indigo-600"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-1.5 text-lg font-extrabold text-indigo-600">
                    {p.hasVar && p.minPrice !== p.maxPrice ? (
                      <>
                        <span className="text-[11px] font-medium text-zinc-400">
                          a partir de{" "}
                        </span>
                        {brl(p.minPrice)}
                      </>
                    ) : (
                      brl(p.minPrice)
                    )}
                  </p>
                  <a
                    href={waLink(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Comprar
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-400">
        {storeName} · Catálogo online — peça pelo WhatsApp
      </footer>

    </div>
  );
}

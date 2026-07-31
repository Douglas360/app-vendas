"use client";

// ============================================================
// Página detalhada do produto no catálogo público.
// Mostra foto grande, descrição, variações e o botão Comprar
// (WhatsApp). Sem login.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  MessageCircle,
  Loader2,
  Package,
  Sparkles,
  CheckCircle2,
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

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProdutoCatalogoPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const router = useRouter();
  const supabase = createClient();

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [related, setRelated] = useState<CatalogProduct[]>([]);
  const [categoryName, setCategoryName] = useState<string>("");
  const [storeName, setStoreName] = useState("Catálogo");
  const [storePhone, setStorePhone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setIsLoading(true);
    try {
      const [prodRes, infoRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, description, sale_price, stock_quantity, image_url, category_id, parent_id, attributes"
          )
          .eq("id", productId)
          .eq("is_active", true)
          .single(),
        supabase.from("catalog_info").select("store_name, store_whatsapp").single(),
      ]);

      if (!prodRes.data) {
        setNotFound(true);
        return;
      }
      const prod = prodRes.data as CatalogProduct;
      setProduct(prod);

      if (infoRes.data) {
        setStoreName(infoRes.data.store_name || "Catálogo");
        setStorePhone(infoRes.data.store_whatsapp || "");
      }

      // Variações (filhos)
      const { data: vars } = await supabase
        .from("products")
        .select(
          "id, name, description, sale_price, stock_quantity, image_url, category_id, parent_id, attributes"
        )
        .eq("parent_id", prod.id)
        .eq("is_active", true);
      setVariants((vars as CatalogProduct[]) || []);

      // Categoria + relacionados
      if (prod.category_id) {
        const [catRes, relRes] = await Promise.all([
          supabase
            .from("product_categories")
            .select("name")
            .eq("id", prod.category_id)
            .single(),
          supabase
            .from("products")
            .select(
              "id, name, description, sale_price, stock_quantity, image_url, category_id, parent_id, attributes"
            )
            .eq("category_id", prod.category_id)
            .eq("is_active", true)
            .is("parent_id", null)
            .neq("id", prod.id)
            .limit(4),
        ]);
        setCategoryName((catRes.data as { name: string } | null)?.name || "");
        setRelated((relRes.data as CatalogProduct[]) || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, productId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasVariants = variants.length > 0;

  const variantLabel = (v: CatalogProduct) =>
    v.attributes
      ? Object.values(v.attributes).filter(Boolean).join(" / ")
      : v.name;

  const current = useMemo(() => {
    if (hasVariants && selectedVariant) {
      return variants.find((v) => v.id === selectedVariant) || null;
    }
    return null;
  }, [hasVariants, selectedVariant, variants]);

  const price = current
    ? current.sale_price
    : hasVariants
    ? Math.min(...variants.map((v) => v.sale_price))
    : product?.sale_price || 0;

  const maxPrice = hasVariants ? Math.max(...variants.map((v) => v.sale_price)) : price;

  const stock = current
    ? current.stock_quantity
    : hasVariants
    ? variants.reduce((s, v) => s + v.stock_quantity, 0)
    : product?.stock_quantity || 0;

  const displayImage = current?.image_url || product?.image_url || null;

  function waLink() {
    if (!product) return "#";
    const digits = storePhone.replace(/\D/g, "");
    const number =
      digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
    const variantTxt = current ? ` (${variantLabel(current)})` : "";
    const msg = `Olá! Vi no catálogo *${storeName}* e tenho interesse em:\n\n*${product.name}${variantTxt}* — ${brl(
      price
    )}\n\nAinda está disponível?`;
    return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-zinc-500">Carregando produto...</p>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center">
        <Package className="h-12 w-12 text-zinc-300" />
        <h1 className="text-lg font-bold text-zinc-700">Produto não encontrado</h1>
        <Link
          href="/catalogo"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Voltar ao catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Topo */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push("/catalogo")}
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-600 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Catálogo
          </button>
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <Sparkles className="h-3.5 w-3.5" /> {storeName}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Imagem */}
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            {displayImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayImage}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-300">
                <Package className="h-20 w-20" />
              </div>
            )}
            {stock <= 0 && (
              <span className="absolute left-3 top-3 rounded-full bg-zinc-900/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
                Esgotado
              </span>
            )}
          </div>

          {/* Informações */}
          <div className="flex flex-col">
            {categoryName && (
              <span className="mb-2 w-fit rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                {categoryName}
              </span>
            )}
            <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
              {product.name}
            </h1>

            <p className="mt-3 text-3xl font-extrabold text-indigo-600">
              {hasVariants && !current && price !== maxPrice ? (
                <>
                  <span className="text-sm font-medium text-zinc-400">a partir de </span>
                  {brl(price)}
                </>
              ) : (
                brl(price)
              )}
            </p>

            {stock > 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Disponível
              </p>
            ) : (
              <p className="mt-1.5 text-xs font-medium text-zinc-400">
                Sem estoque no momento — consulte disponibilidade
              </p>
            )}

            {/* Variações */}
            {hasVariants && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Opções
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const active = selectedVariant === v.id;
                    const out = v.stock_quantity <= 0;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(active ? null : v.id)}
                        className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                          active
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : out
                            ? "border-zinc-200 bg-zinc-100 text-zinc-400 line-through"
                            : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400"
                        }`}
                      >
                        {variantLabel(v)}
                      </button>
                    );
                  })}
                </div>
                {current && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {current.stock_quantity > 0
                      ? `${variantLabel(current)} · ${brl(current.sale_price)}`
                      : `${variantLabel(current)} · sem estoque — consulte`}
                  </p>
                )}
              </div>
            )}

            {/* Descrição */}
            {product.description && (
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Descrição
                </p>
                <p className="text-sm leading-relaxed text-zinc-600">
                  {product.description}
                </p>
              </div>
            )}

            {/* Comprar */}
            <a
              href={waLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
            >
              <MessageCircle className="h-5 w-5" />
              Comprar pelo WhatsApp
            </a>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              Você será atendido diretamente pela loja, sem compromisso.
            </p>
          </div>
        </div>

        {/* Relacionados */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Você também pode gostar
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/catalogo/${r.id}`}
                  className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image_url}
                        alt={r.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-xs font-semibold leading-snug">
                      {r.name}
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-indigo-600">
                      {brl(r.sale_price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-400">
        {storeName} · Catálogo online — peça pelo WhatsApp
      </footer>
    </div>
  );
}

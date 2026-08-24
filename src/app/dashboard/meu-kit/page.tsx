"use client";

// ============================================================
// Visão do VENDEDOR: produtos que estão em poder dele (kit aberto).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  PackageOpen,
  Package,
  RefreshCw,
  Search,
  CheckCircle2,
} from "lucide-react";

interface KitItem {
  id: string;
  quantity: number;
  unit_price: number;
  quantity_sold: number;
  product: { name: string; image_url: string | null } | null;
}
interface Kit {
  id: string;
  kit_number: number;
  status: string;
  delivered_at: string;
  settled_at: string | null;
  total_sold: number;
  commission_percent: number;
  commission_amount: number;
  notes: string | null;
  items: KitItem[];
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MeuKitPage() {
  const supabase = createClient();
  const { profile } = useAuth();

  const [kits, setKits] = useState<Kit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // A RLS já restringe aos kits do vendedor logado
      const { data } = await supabase
        .from("consignment_kits")
        .select(
          "*, items:consignment_kit_items(id, quantity, unit_price, quantity_sold, product:products(name, image_url))"
        )
        .order("delivered_at", { ascending: false });
      setKits((data as unknown as Kit[]) || []);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const openKits = kits.filter((k) => k.status === "aberto");
  const closedKits = kits.filter((k) => k.status !== "aberto");

  const term = search.toLowerCase();
  const filterItems = (items: KitItem[]) =>
    term
      ? items.filter((i) => (i.product?.name || "").toLowerCase().includes(term))
      : items;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">Carregando seus produtos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <PackageOpen className="h-7 w-7 text-indigo-600" />
            Meu Kit
          </h1>
          <p className="mt-1 text-muted-foreground">
            {profile?.full_name
              ? `Olá, ${profile.full_name.split(" ")[0]}! `
              : ""}
            Produtos que estão com você para vender.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {openKits.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-semibold">Nenhum kit ativo</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Quando a loja liberar um kit para você, os produtos aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto no seu kit..."
              className="pl-9"
            />
          </div>

          {openKits.map((k) => {
            const items = filterItems(k.items);
            const totalPecas = k.items.reduce((s, i) => s + Number(i.quantity), 0);
            const totalValor = k.items.reduce(
              (s, i) => s + Number(i.quantity) * Number(i.unit_price),
              0
            );
            return (
              <div key={k.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-indigo-500/5 p-3">
                  <div>
                    <p className="text-sm font-bold">Kit #{k.kit_number}</p>
                    <p className="text-xs text-muted-foreground">
                      Recebido em {new Date(k.delivered_at).toLocaleDateString("pt-BR")} ·{" "}
                      {totalPecas} peça(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Valor total</p>
                    <p className="font-bold text-indigo-600">{brl(totalValor)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((i) => (
                    <Card key={i.id} className="overflow-hidden border shadow-sm">
                      <div className="relative aspect-square w-full bg-muted/30">
                        {i.product?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={i.product.image_url}
                            alt={i.product.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                            <Package className="h-10 w-10" />
                          </div>
                        )}
                        <Badge className="absolute left-2 top-2 bg-black/70 text-white">
                          {Number(i.quantity)} un
                        </Badge>
                      </div>
                      <CardContent className="p-2.5">
                        <p className="line-clamp-2 text-xs font-semibold leading-snug">
                          {i.product?.name}
                        </p>
                        <p className="mt-1 text-base font-extrabold text-indigo-600">
                          {brl(Number(i.unit_price))}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {k.notes && (
                  <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    {k.notes}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Histórico */}
      {closedKits.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Kits anteriores
          </h2>
          <Card className="border shadow-sm">
            <CardContent className="divide-y p-0">
              {closedKits.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      Kit #{k.kit_number}
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Acertado em{" "}
                      {k.settled_at
                        ? new Date(k.settled_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      Vendido {brl(Number(k.total_sold))}
                    </p>
                    <p className="text-sm font-bold text-emerald-600">
                      Comissão {brl(Number(k.commission_amount))}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        ({Number(k.commission_percent)}%)
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

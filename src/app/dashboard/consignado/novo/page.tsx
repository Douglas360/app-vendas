"use client";

// ============================================================
// Página dedicada para montar/editar um kit de consignado.
// Aceita ?kit=<id> para edição.
// Adição por busca, por código (SKU/barras) e por câmera.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Search,
  ScanLine,
  Trash2,
  PackageOpen,
  Barcode,
  Plus,
  Package,
} from "lucide-react";
import { BarcodeScanner } from "@/components/pdv/barcode-scanner";
import { toast } from "sonner";

interface Seller {
  id: string;
  full_name: string;
}
interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  image_url: string | null;
  parent_id: string | null;
  attributes: Record<string, string> | null;
}
interface CartLine {
  product_id: string;
  name: string;
  code: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  stock: number;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NovoKitPage() {
  const router = useRouter();
  const params = useSearchParams();
  const kitId = params.get("kit");
  const supabase = createClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [sellerId, setSellerId] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [kitNumber, setKitNumber] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        supabase
          .from("sellers")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("products")
          .select(
            "id, name, sku, barcode, sale_price, cost_price, stock_quantity, image_url, parent_id, attributes"
          )
          .eq("is_active", true)
          .order("name"),
      ]);
      const prods = (pRes.data as Product[]) || [];
      setSellers((sRes.data as Seller[]) || []);
      setProducts(prods);

      // Modo edição
      if (kitId) {
        const { data: k } = await supabase
          .from("consignment_kits")
          .select(
            "id, kit_number, seller_id, status, notes, items:consignment_kit_items(product_id, quantity, unit_price)"
          )
          .eq("id", kitId)
          .single();
        if (k) {
          const kit = k as unknown as {
            kit_number: number;
            seller_id: string;
            status: string;
            notes: string | null;
            items: { product_id: string; quantity: number; unit_price: number }[];
          };
          if (kit.status !== "aberto") {
            toast.error("Este kit já foi acertado e não pode ser editado.");
            router.push("/dashboard/consignado");
            return;
          }
          setKitNumber(kit.kit_number);
          setSellerId(kit.seller_id);
          setNotes(kit.notes || "");
          setCart(
            kit.items.map((i) => {
              const p = prods.find((x) => x.id === i.product_id);
              return {
                product_id: i.product_id,
                name: p?.name || "Produto",
                code: p?.barcode || p?.sku || "—",
                image_url: p?.image_url || null,
                quantity: Number(i.quantity),
                unit_price: Number(i.unit_price),
                cost_price: p ? Number(p.cost_price) : 0,
                // Estoque disponível = atual + o que já está no kit
                stock: (p ? Number(p.stock_quantity) : 0) + Number(i.quantity),
              };
            })
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, kitId, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Produtos vendáveis (folhas — exclui os "pais" com variação)
  const sellable = useMemo(
    () => products.filter((p) => !products.some((c) => c.parent_id === p.id)),
    [products]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return sellable
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.sku || "").toLowerCase().includes(term) ||
          (p.barcode || "").includes(term)
      )
      .slice(0, 20);
  }, [sellable, search]);

  function displayName(p: Product) {
    const variant = p.attributes
      ? Object.values(p.attributes).filter(Boolean).join(" / ")
      : "";
    return variant ? `${p.name} (${variant})` : p.name;
  }

  function addProduct(p: Product, qty = 1) {
    const existing = cart.find((c) => c.product_id === p.id);
    if (existing) {
      // Já está no kit: incrementa respeitando o estoque
      setCart((prev) =>
        prev.map((c) =>
          c.product_id === p.id
            ? { ...c, quantity: Math.min(c.quantity + qty, c.stock) }
            : c
        )
      );
      toast.success(`${p.name} +${qty}`);
      return;
    }
    if (Number(p.stock_quantity) <= 0) {
      toast.error("Sem estoque disponível", { description: p.name });
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        product_id: p.id,
        name: displayName(p),
        code: p.barcode || p.sku || "—",
        image_url: p.image_url,
        quantity: Math.min(qty, Number(p.stock_quantity)),
        unit_price: Number(p.sale_price),
        cost_price: Number(p.cost_price),
        stock: Number(p.stock_quantity),
      },
    ]);
    toast.success(`${p.name} adicionado`);
  }

  // Adiciona pelo código de barras ou SKU
  const addByCode = useCallback(
    (raw: string) => {
      const term = raw.trim();
      if (!term) return;
      const found = sellable.find(
        (p) =>
          (p.barcode && p.barcode === term) ||
          (p.sku && p.sku.toLowerCase() === term.toLowerCase())
      );
      if (!found) {
        toast.error("Produto não encontrado", { description: `Código: ${term}` });
        return;
      }
      addProduct(found);
      setCode("");
      codeRef.current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sellable, cart]
  );

  const total = cart.reduce((s, c) => s + c.quantity * c.unit_price, 0);
  const totalPecas = cart.reduce((s, c) => s + c.quantity, 0);

  async function handleSave() {
    if (!sellerId) {
      toast.error("Selecione o vendedor.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Adicione ao menos um produto.");
      return;
    }
    setIsSaving(true);
    try {
      const items = cart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity,
        unit_price: c.unit_price,
        cost_price: c.cost_price,
      }));
      const { error } = kitId
        ? await supabase.rpc("edit_consignment_kit", {
            p_kit_id: kitId,
            p_items: items,
            p_notes: notes || null,
          })
        : await supabase.rpc("create_consignment_kit", {
            p_seller_id: sellerId,
            p_items: items,
            p_notes: notes || null,
          });
      if (error) throw error;
      toast.success(kitId ? "Kit atualizado!" : "Kit criado!", {
        description: "O estoque da loja foi ajustado.",
      });
      router.push("/dashboard/consignado");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao salvar o kit", { description: msg });
    } finally {
      setIsSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Apenas administradores montam kits.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/consignado")}
          className="-ml-2 w-fit text-muted-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Consignado
        </Button>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
          <PackageOpen className="h-7 w-7 text-indigo-600" />
          {kitId ? `Editar Kit #${kitNumber ?? ""}` : "Novo Kit"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Monte o kit que será entregue ao vendedor. Os produtos saem do estoque da loja.
        </p>
      </div>

      {/* Vendedor + observações */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Vendedor *</Label>
          <Select value={sellerId} onValueChange={setSellerId} disabled={!!kitId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o vendedor" />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="k-notes">Observações</Label>
          <Input
            id="k-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: acerto previsto para 2 meses"
          />
        </div>
      </div>

      {/* Adicionar produtos */}
      <Card className="border shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Por código */}
            <div className="space-y-1.5">
              <Label htmlFor="k-code">Adicionar por código</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="k-code"
                    ref={codeRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addByCode(code);
                      }
                    }}
                    placeholder="Código de barras ou SKU + Enter"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addByCode(code)}
                  title="Adicionar"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsScannerOpen(true)}
                  title="Escanear com a câmera"
                  className="text-indigo-600"
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Por busca */}
            <div className="space-y-1.5">
              <Label htmlFor="k-search">Buscar produto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="k-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, SKU ou código..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {search && (
            <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
              {filtered.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Nenhum produto encontrado.
                </p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addProduct(p);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-3 p-2 text-left hover:bg-muted/40"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded border bg-muted/30">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{displayName(p)}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {p.barcode || p.sku || "sem código"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {brl(Number(p.sale_price))} · {Number(p.stock_quantity)} un
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela do kit */}
      <Card className="overflow-hidden border shadow-sm">
        {cart.length === 0 ? (
          <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <PackageOpen className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum produto no kit ainda. Escaneie ou busque acima.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((c, idx) => (
                  <TableRow key={c.product_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded border bg-muted/30">
                          {c.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.image_url}
                              alt={c.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                              <Package className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {c.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="1"
                        max={c.stock}
                        value={c.quantity}
                        onChange={(e) => {
                          const q = Math.min(
                            Math.max(1, parseInt(e.target.value) || 1),
                            c.stock
                          );
                          setCart((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, quantity: q } : x))
                          );
                        }}
                        className="mx-auto h-9 w-16 text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        máx {c.stock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {brl(c.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {brl(c.quantity * c.unit_price)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setCart((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Observações longas */}
      <div className="space-y-1.5">
        <Label htmlFor="k-notes2">Observações do kit</Label>
        <Textarea
          id="k-notes2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Condições combinadas, prazo de acerto, etc."
          className="h-20"
        />
      </div>

      {/* Barra fixa */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{totalPecas} peça(s) · </span>
            <span className="text-lg font-extrabold text-indigo-600">{brl(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/consignado")}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {kitId ? "Salvar Alterações" : "Criar Kit"}
            </Button>
          </div>
        </div>
      </div>

      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={addByCode}
      />
    </div>
  );
}

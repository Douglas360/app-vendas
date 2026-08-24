"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  RefreshCw,
  PackageOpen,
  Trash2,
  Search,
  CheckCircle2,
  Handshake,
  Edit,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Seller {
  id: string;
  full_name: string;
  is_active: boolean;
}
interface Product {
  id: string;
  name: string;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  parent_id: string | null;
  attributes: Record<string, string> | null;
}
interface KitItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  quantity_sold: number;
  product: { name: string; image_url: string | null } | null;
}
interface Kit {
  id: string;
  kit_number: number;
  seller_id: string;
  status: string;
  delivered_at: string;
  settled_at: string | null;
  total_sold: number;
  commission_percent: number;
  commission_amount: number;
  net_amount: number;
  notes: string | null;
  seller: { full_name: string } | null;
  items: KitItem[];
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ConsignadoPage() {
  const supabase = createClient();
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [editingKit, setEditingKit] = useState<Kit | null>(null);

  const [kits, setKits] = useState<Kit[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("aberto");

  // Novo kit
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newSeller, setNewSeller] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<
    { product_id: string; name: string; quantity: number; unit_price: number; cost_price: number; stock: number }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);


  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [kRes, sRes, pRes] = await Promise.all([
        supabase
          .from("consignment_kits")
          .select(
            "*, seller:sellers(full_name), items:consignment_kit_items(id, product_id, quantity, unit_price, quantity_sold, product:products(name, image_url))"
          )
          .order("delivered_at", { ascending: false }),
        supabase.from("sellers").select("id, full_name, is_active").eq("is_active", true).order("full_name"),
        supabase
          .from("products")
          .select("id, name, sale_price, cost_price, stock_quantity, parent_id, attributes")
          .eq("is_active", true)
          .order("name"),
      ]);
      setKits((kRes.data as unknown as Kit[]) || []);
      setSellers((sRes.data as Seller[]) || []);
      setProducts((pRes.data as Product[]) || []);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Produtos vendáveis (folhas)
  const sellable = useMemo(
    () => products.filter((p) => !products.some((c) => c.parent_id === p.id)),
    [products]
  );
  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return sellable.slice(0, 30);
    return sellable.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 30);
  }, [sellable, search]);

  const shownKits = kits.filter(
    (k) => statusFilter === "all" || k.status === statusFilter
  );

  function addToCart(p: Product) {
    if (cart.some((c) => c.product_id === p.id)) {
      toast.info("Produto já está no kit.");
      return;
    }
    if (p.stock_quantity <= 0) {
      toast.error("Sem estoque disponível.");
      return;
    }
    const variant = p.attributes
      ? Object.values(p.attributes).filter(Boolean).join(" / ")
      : "";
    setCart((prev) => [
      ...prev,
      {
        product_id: p.id,
        name: variant ? `${p.name} (${variant})` : p.name,
        quantity: 1,
        unit_price: Number(p.sale_price),
        cost_price: Number(p.cost_price),
        stock: Number(p.stock_quantity),
      },
    ]);
    setSearch("");
  }

  const cartTotal = cart.reduce((s, c) => s + c.quantity * c.unit_price, 0);

  // Abre o diálogo em modo edição, carregando os itens do kit
  function openEditKit(k: Kit) {
    setEditingKit(k);
    setNewSeller(k.seller_id);
    setNewNotes(k.notes || "");
    setCart(
      k.items.map((i) => {
        const prod = products.find((p) => p.id === i.product_id);
        // Estoque disponível = estoque atual + o que já está neste kit
        const stock = (prod ? Number(prod.stock_quantity) : 0) + Number(i.quantity);
        return {
          product_id: i.product_id,
          name: i.product?.name || "Produto",
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          cost_price: prod ? Number(prod.cost_price) : 0,
          stock,
        };
      })
    );
    setIsNewOpen(true);
  }

  function openNewKit() {
    setEditingKit(null);
    setCart([]);
    setNewSeller("");
    setNewNotes("");
    setIsNewOpen(true);
  }

  async function handleCreateKit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSeller) {
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
      const { error } = editingKit
        ? await supabase.rpc("edit_consignment_kit", {
            p_kit_id: editingKit.id,
            p_items: items,
            p_notes: newNotes || null,
          })
        : await supabase.rpc("create_consignment_kit", {
            p_seller_id: newSeller,
            p_items: items,
            p_notes: newNotes || null,
          });
      if (error) throw error;
      toast.success(editingKit ? "Kit atualizado!" : "Kit criado!", {
        description: "O estoque da loja foi ajustado.",
      });
      setIsNewOpen(false);
      setEditingKit(null);
      setCart([]);
      setNewSeller("");
      setNewNotes("");
      load();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro ao salvar o kit", { description: msg });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelKit(k: Kit) {
    if (
      !confirm(
        `Cancelar o Kit #${k.kit_number}? Todos os produtos voltam para o estoque.`
      )
    )
      return;
    const { error } = await supabase.rpc("cancel_consignment_kit", { p_kit_id: k.id });
    if (error) {
      toast.error("Erro ao cancelar", { description: error.message });
      return;
    }
    toast.success("Kit cancelado. Produtos devolvidos ao estoque.");
    load();
  }


  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Apenas administradores acessam esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <PackageOpen className="h-7 w-7 text-indigo-600" />
            Consignado
          </h1>
          <p className="mt-1 text-muted-foreground">
            Kits entregues aos vendedores e acerto das vendas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={openNewKit}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Kit
          </Button>
        </div>
      </div>

      <div className="w-full sm:w-56">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aberto">Kits em aberto</SelectItem>
            <SelectItem value="acertado">Kits acertados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : shownKits.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-semibold">Nenhum kit por aqui</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Crie um kit para entregar produtos a um vendedor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shownKits.map((k) => {
            const totalItens = k.items.reduce((s, i) => s + Number(i.quantity), 0);
            const valorKit = k.items.reduce(
              (s, i) => s + Number(i.quantity) * Number(i.unit_price),
              0
            );
            return (
              <Card key={k.id} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold">Kit #{k.kit_number}</p>
                        {k.status === "aberto" ? (
                          <Badge className="bg-amber-500 text-white">Em aberto</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Acertado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{k.seller?.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Entregue em{" "}
                        {new Date(k.delivered_at).toLocaleDateString("pt-BR")} ·{" "}
                        {totalItens} peça(s) · {brl(valorKit)}
                      </p>
                      {k.status === "acertado" && (
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground">Vendido </span>
                          <span className="font-bold">{brl(Number(k.total_sold))}</span>
                          <span className="text-muted-foreground"> · comissão </span>
                          <span className="font-bold text-amber-600">
                            {Number(k.commission_percent)}% ({brl(Number(k.commission_amount))})
                          </span>
                          <span className="text-muted-foreground"> · líquido </span>
                          <span className="font-bold text-emerald-600">
                            {brl(Number(k.net_amount))}
                          </span>
                        </p>
                      )}
                    </div>
                    {k.status === "aberto" && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditKit(k)}
                        >
                          <Edit className="mr-1.5 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelKit(k)}
                          className="text-rose-600 hover:bg-rose-500/10"
                        >
                          <XCircle className="mr-1.5 h-4 w-4" />
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(`/dashboard/consignado/${k.id}/acerto`)
                          }
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <Handshake className="mr-1.5 h-4 w-4" />
                          Fazer acerto
                        </Button>
                      </div>
                    )}
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-indigo-600">
                      Ver produtos ({k.items.length})
                    </summary>
                    <div className="mt-2 divide-y rounded-lg border">
                      {k.items.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between gap-2 p-2 text-xs"
                        >
                          <span className="truncate">{i.product?.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {Number(i.quantity)}x {brl(Number(i.unit_price))}
                            {k.status === "acertado" && (
                              <span className="ml-1 font-semibold text-emerald-600">
                                · vendeu {Number(i.quantity_sold)}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Novo kit */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingKit ? `Editar Kit #${editingKit.kit_number}` : "Novo Kit de Consignado"}
            </DialogTitle>
            <DialogDescription>
              {editingKit
                ? "Ajuste os produtos do kit. O estoque da loja é corrigido automaticamente."
                : "Os produtos saem do estoque da loja e ficam em poder do vendedor."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateKit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto py-1 pr-1">
              <div className="space-y-1.5">
                <Label>Vendedor *</Label>
                <Select
                  value={newSeller}
                  onValueChange={setNewSeller}
                  disabled={!!editingKit}
                >
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
                <Label>Adicionar produtos</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto..."
                    className="pl-9"
                  />
                </div>
                {search && (
                  <div className="max-h-40 divide-y overflow-y-auto rounded-lg border">
                    {filteredProducts.length === 0 ? (
                      <p className="p-3 text-center text-xs text-muted-foreground">
                        Nenhum produto encontrado.
                      </p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addToCart(p)}
                          className="flex w-full items-center justify-between gap-2 p-2 text-left text-xs hover:bg-muted/40"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {brl(Number(p.sale_price))} · {Number(p.stock_quantity)} un
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Produtos do kit ({cart.length})</Label>
                  <div className="divide-y rounded-lg border">
                    {cart.map((c, idx) => (
                      <div key={c.product_id} className="flex items-center gap-2 p-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {c.name}
                        </span>
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
                          className="h-8 w-16 text-center text-xs"
                        />
                        <span className="w-20 shrink-0 text-right text-xs font-bold">
                          {brl(c.quantity * c.unit_price)}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setCart((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="h-7 w-7 shrink-0 text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between rounded-lg bg-indigo-500/5 p-2.5 text-sm">
                    <span className="text-muted-foreground">Valor total do kit</span>
                    <span className="font-bold text-indigo-600">{brl(cartTotal)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="k-notes">Observações</Label>
                <Input
                  id="k-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ex: acerto previsto para 2 meses"
                />
              </div>
            </div>
            <DialogFooter className="mt-3 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingKit ? "Salvar Alterações" : "Criar Kit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  CheckCircle2,
  Handshake,
  Edit,
  XCircle,
  Printer,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  printSettlement,
  buildSettlementMessage,
  type SettlementData,
} from "@/lib/settlement-receipt";
import { buildWhatsappLink } from "@/lib/whatsapp";

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
  seller: { full_name: string; phone: string | null } | null;
  items: KitItem[];
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Converte um kit acertado no formato do recibo
function receiptFrom(k: Kit): SettlementData {
  return {
    kitNumber: k.kit_number,
    sellerName: k.seller?.full_name || "Vendedor",
    deliveredAt: k.delivered_at,
    settledAt: k.settled_at || k.delivered_at,
    items: k.items.map((i) => ({
      name: i.product?.name || "Produto",
      quantity: Number(i.quantity),
      sold: Number(i.quantity_sold),
      unitPrice: Number(i.unit_price),
    })),
    totalSold: Number(k.total_sold),
    commissionPercent: Number(k.commission_percent),
    commissionAmount: Number(k.commission_amount),
    netAmount: Number(k.net_amount),
    notes: k.notes,
  };
}

export default function ConsignadoPage() {
  const supabase = createClient();
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [kits, setKits] = useState<Kit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("aberto");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("consignment_kits")
        .select(
          "*, seller:sellers(full_name, phone), items:consignment_kit_items(id, product_id, quantity, unit_price, quantity_sold, product:products(name, image_url))"
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

  const shownKits = kits.filter(
    (k) => statusFilter === "all" || k.status === statusFilter
  );

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
            onClick={() => router.push("/dashboard/consignado/novo")}
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
                          onClick={() =>
                            router.push(`/dashboard/consignado/novo?kit=${k.id}`)
                          }
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
                    {k.status === "acertado" && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => printSettlement(receiptFrom(k))}
                        >
                          <Printer className="mr-1.5 h-4 w-4" />
                          Recibo
                        </Button>
                        {k.seller?.phone && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                buildWhatsappLink(
                                  k.seller!.phone!,
                                  buildSettlementMessage(receiptFrom(k))
                                ),
                                "_blank"
                              )
                            }
                            className="text-emerald-600"
                          >
                            <MessageCircle className="mr-1.5 h-4 w-4" />
                            WhatsApp
                          </Button>
                        )}
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


    </div>
  );
}

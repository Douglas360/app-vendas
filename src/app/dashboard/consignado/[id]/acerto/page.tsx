"use client";

// ============================================================
// Página dedicada ao ACERTO de um kit consignado.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  Package,
  Handshake,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

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
  seller_id: string;
  status: string;
  delivered_at: string;
  notes: string | null;
  seller: { full_name: string } | null;
  items: KitItem[];
}
interface Tier {
  seller_id: string | null;
  min_amount: number;
  max_amount: number | null;
  percent: number;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AcertoKitPage() {
  const params = useParams<{ id: string }>();
  const kitId = params?.id;
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [kit, setKit] = useState<Kit | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soldMap, setSoldMap] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("dinheiro");
  const [notes, setNotes] = useState("");
  const [isSettling, setIsSettling] = useState(false);

  const load = useCallback(async () => {
    if (!kitId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("consignment_kits")
        .select(
          "*, seller:sellers(full_name), items:consignment_kit_items(id, quantity, unit_price, quantity_sold, product:products(name, image_url))"
        )
        .eq("id", kitId)
        .single();
      const k = data as unknown as Kit | null;
      setKit(k);
      if (k) {
        const map: Record<string, string> = {};
        k.items.forEach((i) => (map[i.id] = "0"));
        setSoldMap(map);
        const { data: t } = await supabase
          .from("commission_tiers")
          .select("seller_id, min_amount, max_amount, percent")
          .or(`seller_id.eq.${k.seller_id},seller_id.is.null`);
        setTiers((t as Tier[]) || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, kitId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalSold = useMemo(() => {
    if (!kit) return 0;
    return kit.items.reduce(
      (s, i) => s + (parseFloat(soldMap[i.id] || "0") || 0) * Number(i.unit_price),
      0
    );
  }, [kit, soldMap]);

  // Prevê a comissão usando as mesmas regras do banco
  const percent = useMemo(() => {
    if (!kit) return 0;
    const own = tiers
      .filter((t) => t.seller_id === kit.seller_id)
      .filter(
        (t) =>
          totalSold >= Number(t.min_amount) &&
          (t.max_amount === null || totalSold <= Number(t.max_amount))
      )
      .sort((a, b) => Number(b.min_amount) - Number(a.min_amount))[0];
    if (own) return Number(own.percent);
    const def = tiers
      .filter((t) => t.seller_id === null)
      .filter(
        (t) =>
          totalSold >= Number(t.min_amount) &&
          (t.max_amount === null || totalSold <= Number(t.max_amount))
      )
      .sort((a, b) => Number(b.min_amount) - Number(a.min_amount))[0];
    return def ? Number(def.percent) : 0;
  }, [tiers, kit, totalSold]);

  const commission = Math.round(totalSold * percent) / 100;
  const net = totalSold - commission;

  const totalDevolvido = kit
    ? kit.items.reduce(
        (s, i) =>
          s + (Number(i.quantity) - (parseFloat(soldMap[i.id] || "0") || 0)),
        0
      )
    : 0;

  function setAll(sold: boolean) {
    if (!kit) return;
    const map: Record<string, string> = {};
    kit.items.forEach((i) => (map[i.id] = sold ? String(Number(i.quantity)) : "0"));
    setSoldMap(map);
  }

  async function handleSettle() {
    if (!kit) return;
    if (!confirm("Confirmar o acerto? Esta ação não pode ser desfeita.")) return;
    setIsSettling(true);
    try {
      const { data, error } = await supabase.rpc("settle_consignment_kit", {
        p_kit_id: kit.id,
        p_sold: kit.items.map((i) => ({
          item_id: i.id,
          quantity_sold: parseFloat(soldMap[i.id] || "0") || 0,
        })),
        p_method: method,
        p_notes: notes || null,
      });
      if (error) throw error;
      const r = data as {
        total_sold: number;
        commission_percent: number;
        commission_amount: number;
        net_amount: number;
      };
      toast.success("Acerto concluído!", {
        description: `Vendido ${brl(Number(r.total_sold))} · Comissão ${Number(
          r.commission_percent
        )}% (${brl(Number(r.commission_amount))}) · Líquido ${brl(Number(r.net_amount))}`,
      });
      router.push("/dashboard/consignado");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast.error("Erro no acerto", { description: msg });
    } finally {
      setIsSettling(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <Handshake className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Apenas administradores fazem o acerto.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">Carregando kit...</p>
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold">Kit não encontrado</p>
        <Button onClick={() => router.push("/dashboard/consignado")}>
          Voltar ao consignado
        </Button>
      </div>
    );
  }

  if (kit.status !== "aberto") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="font-semibold">Este kit já foi acertado</p>
        <Button onClick={() => router.push("/dashboard/consignado")}>
          Voltar ao consignado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {/* Cabeçalho */}
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
          <Handshake className="h-7 w-7 text-emerald-600" />
          Acerto do Kit #{kit.kit_number}
        </h1>
        <p className="mt-1 text-muted-foreground">
          <span className="font-semibold text-foreground">{kit.seller?.full_name}</span> ·
          entregue em {new Date(kit.delivered_at).toLocaleDateString("pt-BR")}
        </p>
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAll(true)}>
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Vendeu tudo
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAll(false)}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Limpar
        </Button>
      </div>

      {/* Itens */}
      <Card className="border shadow-sm">
        <CardContent className="divide-y p-0">
          {kit.items.map((i) => {
            const vendido = parseFloat(soldMap[i.id] || "0") || 0;
            const devolve = Number(i.quantity) - vendido;
            return (
              <div key={i.id} className="flex items-center gap-3 p-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                  {i.product?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={i.product.image_url}
                      alt={i.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.product?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Levou {Number(i.quantity)} · {brl(Number(i.unit_price))} cada
                  </p>
                  <p className="mt-0.5 text-xs">
                    <span className="font-semibold text-emerald-600">
                      Vendeu {vendido} = {brl(vendido * Number(i.unit_price))}
                    </span>
                    {devolve > 0 && (
                      <span className="text-muted-foreground"> · devolve {devolve}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max={Number(i.quantity)}
                    value={soldMap[i.id] ?? "0"}
                    onChange={(e) =>
                      setSoldMap((prev) => ({ ...prev, [i.id]: e.target.value }))
                    }
                    className="h-10 w-16 text-center font-bold"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSoldMap((prev) => ({
                        ...prev,
                        [i.id]: String(Number(i.quantity)),
                      }))
                    }
                    className="h-10 px-2 text-[11px]"
                  >
                    Tudo
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border shadow-sm">
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total vendido</span>
              <span className="font-bold text-indigo-600">{brl(totalSold)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Comissão do vendedor
                {percent > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {percent}%
                  </Badge>
                )}
              </span>
              <span className="font-bold text-amber-600">- {brl(commission)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base">
              <span className="font-semibold">Você recebe</span>
              <span className="font-extrabold text-emerald-600">{brl(net)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalDevolvido > 0
                ? `${totalDevolvido} peça(s) voltam para o estoque.`
                : "Nenhuma peça retorna ao estoque."}
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>Forma de pagamento (recebido do vendedor)</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-notes">Observações do acerto</Label>
              <Textarea
                id="a-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: peça danificada, desconto combinado..."
                className="h-20"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra fixa de confirmação */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Você recebe </span>
            <span className="text-lg font-extrabold text-emerald-600">{brl(net)}</span>
          </div>
          <Button
            onClick={handleSettle}
            disabled={isSettling}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSettling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar acerto
          </Button>
        </div>
      </div>
    </div>
  );
}

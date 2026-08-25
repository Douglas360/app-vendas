"use client";

// ============================================================
// Página dedicada ao ACERTO de um kit consignado.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Printer,
  MessageCircle,
  Barcode,
  ScanLine,
  Undo2,
} from "lucide-react";
import { BarcodeScanner } from "@/components/pdv/barcode-scanner";
import { toast } from "sonner";
import {
  printSettlement,
  buildSettlementMessage,
  type SettlementData,
} from "@/lib/settlement-receipt";
import { buildWhatsappLink } from "@/lib/whatsapp";

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão Débito",
  cartao_credito: "Cartão Crédito",
};

interface KitItem {
  id: string;
  quantity: number;
  unit_price: number;
  quantity_sold: number;
  product: {
    name: string;
    image_url: string | null;
    sku: string | null;
    barcode: string | null;
  } | null;
}
interface Kit {
  id: string;
  kit_number: number;
  seller_id: string;
  status: string;
  delivered_at: string;
  notes: string | null;
  seller: { full_name: string; phone: string | null } | null;
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
  const [done, setDone] = useState<SettlementData | null>(null);
  // Modo devolução: bipar o que voltou
  const [code, setCode] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!kitId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("consignment_kits")
        .select(
          "*, seller:sellers(full_name, phone), items:consignment_kit_items(id, quantity, unit_price, quantity_sold, product:products(name, image_url, sku, barcode))"
        )
        .eq("id", kitId)
        .single();
      const k = data as unknown as Kit | null;
      setKit(k);
      if (k) {
        // Começa considerando que vendeu TUDO — você bipa só o que voltou
        const map: Record<string, string> = {};
        k.items.forEach((i) => (map[i.id] = String(Number(i.quantity))));
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

  // Faixas que valem para este vendedor: as próprias, ou o padrão
  const effectiveTiers = useMemo(() => {
    if (!kit) return [];
    const own = tiers.filter((t) => t.seller_id === kit.seller_id);
    return own.length > 0 ? own : tiers.filter((t) => t.seller_id === null);
  }, [tiers, kit]);

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

  // Bipar/digitar o código do produto DEVOLVIDO: dá baixa em 1 peça
  const registerReturn = useCallback(
    (raw: string) => {
      const term = raw.trim();
      if (!term || !kit) return;
      const item = kit.items.find(
        (i) =>
          (i.product?.barcode && i.product.barcode === term) ||
          (i.product?.sku && i.product.sku.toLowerCase() === term.toLowerCase())
      );
      if (!item) {
        toast.error("Produto não está neste kit", { description: `Código: ${term}` });
        setCode("");
        return;
      }
      const vendidoAtual = parseFloat(soldMap[item.id] || "0") || 0;
      if (vendidoAtual <= 0) {
        toast.warning("Todas as peças deste produto já foram devolvidas", {
          description: item.product?.name,
        });
        setCode("");
        return;
      }
      const novoVendido = vendidoAtual - 1;
      setSoldMap((prev) => ({ ...prev, [item.id]: String(novoVendido) }));
      setLastScanned(item.id);
      setTimeout(() => setLastScanned((cur) => (cur === item.id ? null : cur)), 1500);
      const devolvidas = Number(item.quantity) - novoVendido;
      toast.success(`Devolvida: ${item.product?.name}`, {
        description: `${devolvidas} de ${Number(item.quantity)} devolvida(s)`,
      });
      setCode("");
      codeRef.current?.focus();
    },
    [kit, soldMap]
  );

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
      toast.success("Acerto concluído!");

      // Monta o recibo com o resultado final
      const receipt: SettlementData = {
        kitNumber: kit.kit_number,
        sellerName: kit.seller?.full_name || "Vendedor",
        deliveredAt: kit.delivered_at,
        settledAt: new Date().toISOString(),
        items: kit.items.map((i) => ({
          name: i.product?.name || "Produto",
          quantity: Number(i.quantity),
          sold: parseFloat(soldMap[i.id] || "0") || 0,
          unitPrice: Number(i.unit_price),
        })),
        totalSold: Number(r.total_sold),
        commissionPercent: Number(r.commission_percent),
        commissionAmount: Number(r.commission_amount),
        netAmount: Number(r.net_amount),
        paymentLabel: PAYMENT_LABELS[method] || method,
        notes: notes || null,
        tiers: effectiveTiers.map((t) => ({
          minAmount: Number(t.min_amount),
          maxAmount: t.max_amount === null ? null : Number(t.max_amount),
          percent: Number(t.percent),
        })),
      };
      setDone(receipt);
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

  // Acerto concluído — recibo
  if (done) {
    const waPhone = kit?.seller?.phone;
    return (
      <div className="mx-auto max-w-lg space-y-5 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">Acerto concluído!</h1>
          <p className="text-sm text-muted-foreground">
            Kit #{done.kitNumber} · {done.sellerName}
          </p>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total vendido</span>
              <span className="font-bold text-indigo-600">{brl(done.totalSold)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Comissão ({done.commissionPercent}%)
              </span>
              <span className="font-bold text-amber-600">
                - {brl(done.commissionAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base">
              <span className="font-semibold">Você recebeu</span>
              <span className="font-extrabold text-emerald-600">
                {brl(done.netAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button
            onClick={() => printSettlement(done)}
            className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Salvar PDF
          </Button>
          {waPhone && (
            <Button
              onClick={() =>
                window.open(
                  buildWhatsappLink(waPhone, buildSettlementMessage(done)),
                  "_blank"
                )
              }
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Enviar no WhatsApp do vendedor
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/consignado")}
            className="w-full"
          >
            Voltar ao consignado
          </Button>
        </div>
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

      {/* Bipar devoluções */}
      <Card className="border-2 border-indigo-500/30 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div>
            <Label htmlFor="ret-code" className="text-base font-bold">
              Escaneie o que o vendedor DEVOLVEU
            </Label>
            <p className="text-xs text-muted-foreground">
              Começa como &ldquo;vendeu tudo&rdquo;. Cada bipada dá baixa em 1 peça
              devolvida — o restante é considerado vendido.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ret-code"
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    registerReturn(code);
                  }
                }}
                placeholder="Código de barras ou SKU + Enter"
                className="h-12 pl-10 text-base"
                autoFocus
              />
            </div>
            <Button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-12 bg-indigo-600 px-4 text-white hover:bg-indigo-700"
            >
              <ScanLine className="mr-2 h-5 w-5" />
              Câmera
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Button variant="outline" size="sm" onClick={() => setAll(true)}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Vendeu tudo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAll(false)}>
              <Undo2 className="mr-1.5 h-4 w-4" />
              Devolveu tudo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAll(true)}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Recomeçar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Itens */}
      <Card className="border shadow-sm">
        <CardContent className="divide-y p-0">
          {kit.items.map((i) => {
            const vendido = parseFloat(soldMap[i.id] || "0") || 0;
            const devolve = Number(i.quantity) - vendido;
            const isLast = lastScanned === i.id;
            const codigo = i.product?.barcode || i.product?.sku;
            return (
              <div
                key={i.id}
                className={`flex items-center gap-3 p-3 transition-colors ${
                  isLast
                    ? "bg-amber-500/15 ring-2 ring-inset ring-amber-500/50"
                    : devolve > 0
                    ? "bg-amber-500/5"
                    : ""
                }`}
              >
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
                    {codigo && (
                      <span className="font-mono">{codigo} · </span>
                    )}
                    Levou {Number(i.quantity)} · {brl(Number(i.unit_price))} cada
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-600">
                      Vendeu {vendido} = {brl(vendido * Number(i.unit_price))}
                    </span>
                    {devolve > 0 && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-600">
                        Devolveu {devolve}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setSoldMap((prev) => ({
                          ...prev,
                          [i.id]: String(Math.max(0, vendido - 1)),
                        }))
                      }
                      title="Devolveu +1"
                      className="h-9 w-9 text-amber-600"
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      min="0"
                      max={Number(i.quantity)}
                      value={soldMap[i.id] ?? "0"}
                      onChange={(e) =>
                        setSoldMap((prev) => ({ ...prev, [i.id]: e.target.value }))
                      }
                      className="h-9 w-14 text-center font-bold"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setSoldMap((prev) => ({
                          ...prev,
                          [i.id]: String(Math.min(Number(i.quantity), vendido + 1)),
                        }))
                      }
                      title="Vendeu +1"
                      className="h-9 w-9 text-emerald-600"
                    >
                      +
                    </Button>
                  </div>
                  <span className="text-[10px] text-muted-foreground">vendidas</span>
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
            <div className="flex justify-between border-t pt-2 text-xs">
              <span className="text-muted-foreground">Peças devolvidas (bipadas)</span>
              <span className="font-bold text-amber-600">{totalDevolvido}</span>
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

      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={registerReturn}
      />
    </div>
  );
}

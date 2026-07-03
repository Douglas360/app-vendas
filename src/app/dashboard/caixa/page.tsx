"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  Loader2,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  ArrowDownCircle,
} from "lucide-react";
import { toast } from "sonner";

interface CashMovement {
  id: string;
  sale_id: string | null;
  customer_id: string | null;
  amount: number;
  method: string | null;
  kind: "venda" | "parcela";
  occurred_at: string;
  notes: string | null;
  customer: { full_name: string } | null;
  sale: { sale_number: number } | null;
}

const METHOD_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão débito",
  cartao_credito: "Cartão crédito",
  fiado: "Crediário",
};

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "all", label: "Tudo" },
];

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CaixaPage() {
  const supabase = createClient();
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState("30");
  const [kindFilter, setKindFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("cash_movements")
        .select(
          "id, sale_id, customer_id, amount, method, kind, occurred_at, notes, customer:customers(full_name), sale:sales(sale_number)"
        )
        .order("occurred_at", { ascending: false })
        .limit(1000);

      const now = new Date();
      let from: Date | null = null;
      if (period === "today") {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "month") {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === "7" || period === "30") {
        from = new Date(now);
        from.setDate(from.getDate() - parseInt(period));
      }
      if (from) query = query.gte("occurred_at", from.toISOString());

      const { data, error } = await query;
      if (error) throw error;
      setMovements((data as unknown as CashMovement[]) || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error("Erro ao carregar o caixa", { description: message });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(
    () =>
      movements.filter((m) => kindFilter === "all" || m.kind === kindFilter),
    [movements, kindFilter]
  );

  const totals = useMemo(() => {
    const total = filtered.reduce((s, m) => s + Number(m.amount), 0);
    const vendas = filtered
      .filter((m) => m.kind === "venda")
      .reduce((s, m) => s + Number(m.amount), 0);
    const parcelas = filtered
      .filter((m) => m.kind === "parcela")
      .reduce((s, m) => s + Number(m.amount), 0);
    return { total, vendas, parcelas };
  }, [filtered]);

  // Agrupa por dia
  const byDay = useMemo(() => {
    const groups: Record<string, { total: number; items: CashMovement[] }> = {};
    for (const m of filtered) {
      const day = new Date(m.occurred_at).toLocaleDateString("pt-BR");
      if (!groups[day]) groups[day] = { total: 0, items: [] };
      groups[day].total += Number(m.amount);
      groups[day].items.push(m);
    }
    return Object.entries(groups);
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Wallet className="h-7 w-7 text-emerald-600" />
            Caixa
          </h1>
          <p className="mt-1 text-muted-foreground">
            Entradas de dinheiro reais (regime de caixa): vendas à vista e recebimento de parcelas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-52">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-52">
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as entradas</SelectItem>
              <SelectItem value="venda">Só vendas à vista</SelectItem>
              <SelectItem value="parcela">Só recebimento de parcelas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <ArrowDownCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total recebido</p>
              <p className="text-xl font-bold text-emerald-600">{brl(totals.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Vendas à vista</p>
              <p className="text-xl font-bold">{brl(totals.vendas)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Parcelas recebidas</p>
              <p className="text-xl font-bold">{brl(totals.parcelas)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista por dia */}
      {isLoading ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-sm text-muted-foreground">Carregando movimentações...</p>
        </div>
      ) : byDay.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhuma entrada no período selecionado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, group]) => (
            <Card key={day} className="border shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                  <span className="text-sm font-semibold">{day}</span>
                  <span className="text-sm font-bold text-emerald-600">
                    {brl(group.total)}
                  </span>
                </div>
                <div className="divide-y">
                  {group.items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={
                              m.kind === "venda"
                                ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            }
                          >
                            {m.kind === "venda" ? "Venda" : "Parcela"}
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {m.customer?.full_name || "Cliente avulso"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {m.sale?.sale_number ? `Venda #${m.sale.sale_number} · ` : ""}
                          {m.method ? METHOD_LABEL[m.method] || m.method : "—"} ·{" "}
                          {new Date(m.occurred_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-600">
                        {brl(Number(m.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

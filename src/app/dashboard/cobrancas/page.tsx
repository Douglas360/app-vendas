"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  CalendarClock,
  Loader2,
  RefreshCw,
  MessageCircle,
  Copy,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { buildCollectionMessage, buildWhatsappLink } from "@/lib/whatsapp";

interface Row {
  id: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  installment_number: number;
  status: string;
  customer: { id: string; full_name: string; phone: string | null } | null;
  sale: { sale_number: number } | null;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function monthRange(offsetMonths: number): { from: string; to: string } {
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + offsetMonths + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

function monthLabelFromYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Period = "proximos" | "mes_atual" | "mes_seguinte" | "custom" | "todas";
type StatusView = "all" | "receber" | "pago";

export default function CobrancasPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>("proximos");
  const [statusView, setStatusView] = useState<StatusView>("receber");
  const [customMonth, setCustomMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const todayStr = ymd(0);
  const tomorrowStr = ymd(1);

  const range = useMemo(() => {
    if (period === "mes_atual") return monthRange(0);
    if (period === "mes_seguinte") return monthRange(1);
    if (period === "custom") {
      const [y, m] = customMonth.split("-").map(Number);
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      return { from: fmt(first), to: fmt(last) };
    }
    return null; // proximos: usa lte tomorrow
  }, [period, customMonth]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("credit_installments")
        .select(
          "id, amount, amount_paid, due_date, installment_number, status, customer:customers(id, full_name, phone), sale:sales(sale_number)"
        )
        .in("status", ["pendente", "atrasado", "pago"])
        .order("due_date", { ascending: true })
        .limit(2000);
      if (range) {
        query = query.gte("due_date", range.from).lte("due_date", range.to);
      } else if (period === "proximos") {
        query = query.lte("due_date", tomorrowStr);
      }
      // period === "todas": sem filtro de data
      const { data } = await query;
      const list = ((data as unknown as Row[]) || []).filter(
        (r) => Number(r.amount) > 0
      );
      setRows(list);

      // Marca as que já foram enviadas hoje (registradas no histórico)
      const ids = list.map((r) => r.id);
      if (ids.length) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { data: logs } = await supabase
          .from("notification_log")
          .select("installment_id")
          .in("installment_id", ids)
          .eq("kind", "cobranca_manual")
          .gte("created_at", start.toISOString());
        setSentIds(
          new Set(
            (logs || [])
              .map((l: { installment_id: string | null }) => l.installment_id)
              .filter((v: string | null): v is string => !!v)
          )
        );
      } else {
        setSentIds(new Set());
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tomorrowStr, range, period]);

  useEffect(() => {
    load();
  }, [load]);

  const isPaid = (r: Row) => Number(r.amount) - Number(r.amount_paid) <= 0.001;

  // Lista exibida conforme o filtro de status (cards clicáveis)
  const shown = useMemo(() => {
    if (statusView === "receber") return rows.filter((r) => !isPaid(r));
    if (statusView === "pago") return rows.filter((r) => isPaid(r));
    return rows;
  }, [rows, statusView]);

  const groups = useMemo(() => {
    const atrasadas: Row[] = [];
    const hoje: Row[] = [];
    const amanha: Row[] = [];
    for (const r of shown) {
      if (r.due_date < todayStr) atrasadas.push(r);
      else if (r.due_date === todayStr) hoje.push(r);
      else amanha.push(r);
    }
    return { atrasadas, hoje, amanha };
  }, [shown, todayStr]);

  const totals = useMemo(() => {
    let receber = 0;
    let pago = 0;
    let countReceber = 0;
    let countPago = 0;
    for (const r of rows) {
      receber += Number(r.amount) - Number(r.amount_paid);
      pago += Number(r.amount_paid);
      if (isPaid(r)) countPago += 1;
      else countReceber += 1;
    }
    return { count: rows.length, receber, pago, countReceber, countPago };
  }, [rows]);

  function messageFor(r: Row): string {
    return buildCollectionMessage({
      customerName: r.customer?.full_name || "Cliente",
      remaining: Number(r.amount) - Number(r.amount_paid),
      dueDate: r.due_date,
    });
  }

  async function sendWa(r: Row) {
    if (!r.customer?.phone) {
      toast.error("Cliente sem telefone cadastrado.");
      return;
    }
    const msg = messageFor(r);
    // Abre o WhatsApp no gesto do clique
    window.open(buildWhatsappLink(r.customer.phone, msg), "_blank");
    // Marca como enviado (registra no histórico) — envio manual, marcação otimista
    setSentIds((prev) => new Set(prev).add(r.id));
    try {
      await supabase.from("notification_log").insert({
        channel: "whatsapp",
        kind: "cobranca_manual",
        recipient_type: "cliente",
        customer_id: r.customer.id,
        recipient_name: r.customer.full_name,
        recipient_phone: r.customer.phone,
        title: "Cobrança do dia",
        body: msg,
        status: "enviado",
        installment_id: r.id,
      });
    } catch {
      /* não bloqueia o fluxo */
    }
  }

  async function copyMsg(r: Row) {
    try {
      await navigator.clipboard.writeText(messageFor(r));
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const total = rows.length;

  const renderSection = (
    title: string,
    items: Row[],
    tone: "rose" | "amber" | "indigo"
  ) => {
    if (items.length === 0) return null;
    const toneCls =
      tone === "rose"
        ? "text-rose-600"
        : tone === "amber"
        ? "text-amber-600"
        : "text-indigo-600";
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-bold uppercase tracking-wide ${toneCls}`}>
            {title}
          </h2>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <Card className="border shadow-sm">
          <CardContent className="divide-y p-0">
            {items.map((r) => {
              const remaining = Number(r.amount) - Number(r.amount_paid);
              const paid = remaining <= 0.001;
              const noPhone = !r.customer?.phone;
              const sent = sentIds.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${
                    paid ? "bg-emerald-500/5" : sent ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {r.customer?.full_name || "Cliente"}
                      </p>
                      {paid ? (
                        <Badge className="bg-emerald-600 text-white">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Quitada
                        </Badge>
                      ) : sent ? (
                        <Badge className="bg-emerald-600 text-white">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Enviado
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.sale?.sale_number ? `Venda #${r.sale.sale_number} · ` : ""}
                      {r.installment_number}ª parcela · venc.{" "}
                      {new Date(r.due_date + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
                      {paid ? (
                        <span className="font-bold text-emerald-600">
                          Pago {brl(Number(r.amount_paid))}
                        </span>
                      ) : (
                        <span className="font-bold text-foreground">{brl(remaining)}</span>
                      )}
                    </p>
                    {!paid && noPhone && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> Sem telefone cadastrado
                      </p>
                    )}
                  </div>
                  {!paid && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant={sent ? "outline" : "default"}
                        disabled={noPhone}
                        onClick={() => sendWa(r)}
                        className={
                          sent
                            ? "h-8 px-2.5 text-xs"
                            : "h-8 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                        }
                      >
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                        {sent ? "Reenviar" : "WhatsApp"}
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyMsg(r)}
                        title="Copiar mensagem"
                        className="h-8 w-8"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <CalendarClock className="h-7 w-7 text-indigo-600" />
            Cobranças
          </h1>
          <p className="mt-1 text-muted-foreground">
            Veja as parcelas por período e envie a cobrança pronta pelo WhatsApp.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtro de período */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-64">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as parcelas</SelectItem>
              <SelectItem value="proximos">Vencimentos próximos (atrasadas, hoje, amanhã)</SelectItem>
              <SelectItem value="mes_atual">Este mês</SelectItem>
              <SelectItem value="mes_seguinte">Mês que vem</SelectItem>
              <SelectItem value="custom">Escolher mês…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <Input
            type="month"
            value={customMonth}
            onChange={(e) => setCustomMonth(e.target.value)}
            className="w-full sm:w-44"
          />
        )}
      </div>

      {/* Resumo do período — cards clicáveis (filtram a lista) */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setStatusView("all")}
            className={`rounded-xl border bg-card p-3 text-left shadow-sm transition-all ${
              statusView === "all" ? "ring-2 ring-indigo-500" : "hover:bg-muted/40"
            }`}
          >
            <p className="text-xs text-muted-foreground">Parcelas</p>
            <p className="text-lg font-bold">{totals.count}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusView("receber")}
            className={`rounded-xl border bg-card p-3 text-left shadow-sm transition-all ${
              statusView === "receber" ? "ring-2 ring-rose-500" : "hover:bg-muted/40"
            }`}
          >
            <p className="text-xs text-muted-foreground">
              A receber ({totals.countReceber})
            </p>
            <p className="text-lg font-bold text-rose-600">{brl(totals.receber)}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusView("pago")}
            className={`rounded-xl border bg-card p-3 text-left shadow-sm transition-all ${
              statusView === "pago" ? "ring-2 ring-emerald-500" : "hover:bg-muted/40"
            }`}
          >
            <p className="text-xs text-muted-foreground">
              Já pago ({totals.countPago})
            </p>
            <p className="text-lg font-bold text-emerald-600">{brl(totals.pago)}</p>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-muted-foreground">Carregando cobranças...</p>
        </div>
      ) : shown.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h3 className="font-semibold">Nada por aqui</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {statusView === "pago"
                ? "Nenhuma parcela quitada neste período."
                : statusView === "receber"
                ? "Nenhuma parcela a receber neste período."
                : "Nenhuma parcela neste período."}
            </p>
          </CardContent>
        </Card>
      ) : period === "proximos" && statusView !== "pago" ? (
        <>
          {renderSection("Atrasadas", groups.atrasadas, "rose")}
          {renderSection("Vencem hoje", groups.hoje, "amber")}
          {renderSection("Vencem amanhã", groups.amanha, "indigo")}
        </>
      ) : (
        renderSection(
          statusView === "pago"
            ? "Parcelas quitadas"
            : period === "todas"
            ? "Todas as parcelas"
            : range
            ? monthLabelFromYm(range.from.slice(0, 7))
            : "Parcelas",
          shown,
          "indigo"
        )
      )}
    </div>
  );
}

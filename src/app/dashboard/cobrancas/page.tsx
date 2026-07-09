"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function CobrancasPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const todayStr = ymd(0);
  const tomorrowStr = ymd(1);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("credit_installments")
        .select(
          "id, amount, amount_paid, due_date, installment_number, customer:customers(id, full_name, phone), sale:sales(sale_number)"
        )
        .in("status", ["pendente", "atrasado"])
        .lte("due_date", tomorrowStr)
        .order("due_date", { ascending: true });
      const list = ((data as unknown as Row[]) || []).filter(
        (r) => Number(r.amount) - Number(r.amount_paid) > 0.001
      );
      setRows(list);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tomorrowStr]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const atrasadas: Row[] = [];
    const hoje: Row[] = [];
    const amanha: Row[] = [];
    for (const r of rows) {
      if (r.due_date < todayStr) atrasadas.push(r);
      else if (r.due_date === todayStr) hoje.push(r);
      else amanha.push(r);
    }
    return { atrasadas, hoje, amanha };
  }, [rows, todayStr]);

  function messageFor(r: Row): string {
    return buildCollectionMessage({
      customerName: r.customer?.full_name || "Cliente",
      remaining: Number(r.amount) - Number(r.amount_paid),
      dueDate: r.due_date,
    });
  }

  function sendWa(r: Row) {
    if (!r.customer?.phone) {
      toast.error("Cliente sem telefone cadastrado.");
      return;
    }
    window.open(buildWhatsappLink(r.customer.phone, messageFor(r)), "_blank");
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
              const noPhone = !r.customer?.phone;
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.customer?.full_name || "Cliente"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.sale?.sale_number ? `Venda #${r.sale.sale_number} · ` : ""}
                      {r.installment_number}ª parcela · venc.{" "}
                      {new Date(r.due_date + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
                      <span className="font-bold text-foreground">{brl(remaining)}</span>
                    </p>
                    {noPhone && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> Sem telefone cadastrado
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={noPhone}
                      onClick={() => sendWa(r)}
                      className="h-8 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                      WhatsApp
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
            Cobranças do dia
          </h1>
          <p className="mt-1 text-muted-foreground">
            Parcelas que vencem amanhã, vencem hoje ou estão atrasadas. Toque em WhatsApp para enviar a cobrança pronta.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-muted-foreground">Carregando cobranças...</p>
        </div>
      ) : total === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h3 className="font-semibold">Tudo em dia!</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Nenhuma parcela vencendo amanhã, hoje ou em atraso no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {renderSection("Atrasadas", groups.atrasadas, "rose")}
          {renderSection("Vencem hoje", groups.hoje, "amber")}
          {renderSection("Vencem amanhã", groups.amanha, "indigo")}
        </>
      )}
    </div>
  );
}

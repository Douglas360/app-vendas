"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck, CreditCard, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { buildCollectionMessage, buildWhatsappLink } from "@/lib/whatsapp";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string | null;
  metadata: {
    installment_id?: string;
    customer_id?: string;
    bucket?: string;
  } | null;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return d.toLocaleDateString("pt-BR");
}

export function NotificationBell() {
  const supabase = createClient();
  const { user } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const unread = items.filter((n) => !n.is_read).length;

  const fetchItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, is_read, created_at, type, metadata")
      .order("created_at", { ascending: false })
      .limit(30);
    const list = (data as NotificationRow[]) || [];
    setItems(list);

    // Sincroniza com o histórico: marca como "enviado" quem já foi cobrado hoje
    // (por qualquer tela — Cobranças ou o próprio sininho).
    const instIds = list
      .map((n) => n.metadata?.installment_id)
      .filter((v): v is string => !!v);
    if (instIds.length) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: logs } = await supabase
        .from("notification_log")
        .select("installment_id")
        .in("installment_id", instIds)
        .eq("kind", "cobranca_manual")
        .gte("created_at", start.toISOString());
      const sentInst = new Set(
        (logs || [])
          .map((l: { installment_id: string | null }) => l.installment_id)
          .filter((v: string | null): v is string => !!v)
      );
      setSentIds(
        new Set(
          list
            .filter(
              (n) =>
                n.metadata?.installment_id &&
                sentInst.has(n.metadata.installment_id)
            )
            .map((n) => n.id)
        )
      );
    }
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    fetchItems();
    const id = setInterval(fetchItems, 60000);
    return () => clearInterval(id);
  }, [user, fetchItems]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) fetchItems();
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);
  }

  async function handleClick(n: NotificationRow) {
    if (!n.is_read) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  // Abre o WhatsApp do cliente com a mesma mensagem do lembrete, direto da notificação
  async function handleWhatsappFromNotif(
    e: React.MouseEvent,
    n: NotificationRow
  ) {
    e.stopPropagation();
    const instId = n.metadata?.installment_id;
    if (!instId) return;
    // Abre a aba já no gesto do clique (evita bloqueio de pop-up) e ajusta a URL depois
    const win = window.open("", "_blank");
    try {
      const { data: inst } = await supabase
        .from("credit_installments")
        .select("amount, amount_paid, due_date, customer:customers(full_name, phone)")
        .eq("id", instId)
        .single();
      const cust = (inst as { customer?: { full_name: string; phone: string | null } } | null)
        ?.customer;
      if (!inst || !cust?.phone) {
        win?.close();
        toast.error("Cliente sem telefone cadastrado.");
        return;
      }
      const remaining = Number(inst.amount) - Number(inst.amount_paid);
      const msg = buildCollectionMessage({
        customerName: cust.full_name,
        remaining,
        dueDate: inst.due_date as string,
      });
      const url = buildWhatsappLink(cust.phone, msg);
      if (win) win.location.href = url;
      else window.open(url, "_blank");

      // Marca como enviado (histórico) e sinaliza na notificação
      setSentIds((prev) => new Set(prev).add(n.id));
      supabase
        .from("notification_log")
        .insert({
          channel: "whatsapp",
          kind: "cobranca_manual",
          recipient_type: "cliente",
          customer_id: n.metadata?.customer_id ?? null,
          recipient_name: cust.full_name,
          recipient_phone: cust.phone,
          title: "Cobrança (via sininho)",
          body: msg,
          status: "enviado",
          installment_id: instId,
        })
        .then(() => {});

      if (!n.is_read) {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
        supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      }
    } catch {
      win?.close();
      toast.error("Não foi possível abrir o WhatsApp.");
    }
  }

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 rounded-xl bg-background/80 shadow-lg backdrop-blur-sm"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="text-sm font-bold">Notificações</h4>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Marcar lidas
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificação por aqui.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="divide-y">
              {items.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/40 ${
                    n.is_read ? "" : "bg-indigo-500/5"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.is_read
                        ? "bg-muted text-muted-foreground"
                        : "bg-indigo-500/10 text-indigo-500"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{n.title}</p>
                      {!n.is_read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {timeAgo(n.created_at)}
                    </p>
                    {n.type === "crediario" && n.metadata?.installment_id && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={sentIds.has(n.id) ? "outline" : "default"}
                          onClick={(e) => handleWhatsappFromNotif(e, n)}
                          className={
                            sentIds.has(n.id)
                              ? "h-7 px-2.5 text-xs"
                              : "h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                          }
                        >
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                          {sentIds.has(n.id) ? "Reenviar" : "Enviar no WhatsApp"}
                        </Button>
                        {sentIds.has(n.id) && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                            <CheckCheck className="h-3.5 w-3.5" /> Enviado
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

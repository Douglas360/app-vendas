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
import { Bell, CheckCheck, CreditCard } from "lucide-react";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string | null;
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

  const unread = items.filter((n) => !n.is_read).length;

  const fetchItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, is_read, created_at, type")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as NotificationRow[]) || []);
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
                <button
                  key={n.id}
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
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

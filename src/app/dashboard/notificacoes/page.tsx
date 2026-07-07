"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Loader2,
  MessageCircle,
  Printer,
  Smartphone,
  Clock,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { isAutoPrintReceiptEnabled, setAutoPrintReceipt } from "@/lib/receipt";

type Channel = "whatsapp" | "push" | "impressora";

function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === "whatsapp")
    return (
      <Badge variant="secondary" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
        <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
      </Badge>
    );
  if (channel === "push")
    return (
      <Badge variant="secondary" className="border-indigo-500/20 bg-indigo-500/10 text-indigo-600">
        <Smartphone className="mr-1 h-3 w-3" /> Push / Sininho
      </Badge>
    );
  return (
    <Badge variant="secondary" className="border-slate-500/20 bg-slate-500/10 text-slate-600">
      <Printer className="mr-1 h-3 w-3" /> Impressora
    </Badge>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-600" : "bg-muted-foreground/30"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface NotifCardProps {
  title: string;
  description: string;
  channel: Channel;
  audience: string;
  trigger: string;
  active: boolean;
  toggle?: { value: boolean; onChange: (v: boolean) => void; saving?: boolean };
  note?: string;
}

function NotifCard({
  title,
  description,
  channel,
  audience,
  trigger,
  active,
  toggle,
  note,
}: NotifCardProps) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{title}</h3>
              {active ? (
                <Badge className="bg-emerald-600 text-white">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Ativa
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">
                  <XCircle className="mr-1 h-3 w-3" /> Desativada
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {toggle &&
            (toggle.saving ? (
              <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Toggle checked={toggle.value} onChange={toggle.onChange} />
            ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <ChannelBadge channel={channel} />
          <span className="text-muted-foreground">Para: {audience}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {trigger}
        </div>
        {note && (
          <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            {note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NotificacoesPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [waConnected, setWaConnected] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [receipt, setReceipt] = useState(true);
  const [paymentConfirm, setPaymentConfirm] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);
  const [pushPermission, setPushPermission] = useState<string>("default");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("app_settings")
        .select(
          "evolution_connected, wa_reminders_enabled, wa_receipt_enabled, wa_payment_confirm_enabled"
        )
        .eq("id", 1)
        .single();
      if (data) {
        setWaConnected(!!data.evolution_connected);
        setReminders(data.wa_reminders_enabled !== false);
        setReceipt(data.wa_receipt_enabled !== false);
        setPaymentConfirm(data.wa_payment_confirm_enabled !== false);
      }
    } finally {
      setAutoPrint(isAutoPrintReceiptEnabled());
      if (typeof Notification !== "undefined") setPushPermission(Notification.permission);
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateFlag(
    column: string,
    value: boolean,
    setter: (v: boolean) => void
  ) {
    setter(value);
    setSaving(column);
    const { error } = await supabase
      .from("app_settings")
      .update({ [column]: value })
      .eq("id", 1);
    setSaving(null);
    if (error) {
      setter(!value);
      toast.error("Não foi possível salvar", { description: error.message });
    } else {
      toast.success(value ? "Notificação ativada." : "Notificação desativada.");
    }
  }

  function handleAutoPrint(value: boolean) {
    setAutoPrint(value);
    setAutoPrintReceipt(value);
    toast.success(value ? "Recibo automático ativado." : "Recibo automático desativado.");
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">Carregando notificações...</p>
      </div>
    );
  }

  const waNote = !waConnected
    ? "O WhatsApp não está conectado. Conecte em Configurações para esta notificação funcionar."
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Bell className="h-7 w-7 text-indigo-600" />
          Notificações
        </h1>
        <p className="mt-1 text-muted-foreground">
          Tudo o que o sistema envia automaticamente, num só lugar. Ligue ou desligue cada uma.
        </p>
      </div>

      {/* Dependências / status geral */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              {waConnected ? (
                <Wifi className="h-6 w-6 text-emerald-600" />
              ) : (
                <WifiOff className="h-6 w-6 text-rose-500" />
              )}
              <div>
                <p className="text-sm font-semibold">WhatsApp (Evolution)</p>
                <p className="text-xs text-muted-foreground">
                  {waConnected ? "Conectado" : "Desconectado"}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/configuracoes">Configurar</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Smartphone
              className={`h-6 w-6 ${
                pushPermission === "granted" ? "text-emerald-600" : "text-amber-500"
              }`}
            />
            <div>
              <p className="text-sm font-semibold">Push neste dispositivo</p>
              <p className="text-xs text-muted-foreground">
                {pushPermission === "granted"
                  ? "Ativado"
                  : pushPermission === "denied"
                  ? "Bloqueado no navegador"
                  : "Não ativado — use o sino no topo para ativar"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notificações ao CLIENTE (WhatsApp) */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Para o cliente (WhatsApp)
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NotifCard
            title="Comprovante de venda"
            description="Envia o comprovante da compra assim que a venda é finalizada, com itens, total e (no crediário) as parcelas e a chave PIX."
            channel="whatsapp"
            audience="Cliente com telefone"
            trigger="Ao finalizar uma venda"
            active={receipt && waConnected}
            toggle={{
              value: receipt,
              onChange: (v) => updateFlag("wa_receipt_enabled", v, setReceipt),
              saving: saving === "wa_receipt_enabled",
            }}
            note={waNote}
          />
          <NotifCard
            title="Confirmação de pagamento"
            description="Ao receber uma parcela do crediário, envia a confirmação com o valor pago e o saldo restante."
            channel="whatsapp"
            audience="Cliente com telefone"
            trigger="Ao registrar o recebimento de uma parcela"
            active={paymentConfirm && waConnected}
            toggle={{
              value: paymentConfirm,
              onChange: (v) =>
                updateFlag("wa_payment_confirm_enabled", v, setPaymentConfirm),
              saving: saving === "wa_payment_confirm_enabled",
            }}
            note={waNote}
          />
          <NotifCard
            title="Lembrete de crediário"
            description="Mensagem profissional avisando o cliente sobre parcelas que vencem amanhã, vencem hoje ou estão atrasadas, com a chave PIX."
            channel="whatsapp"
            audience="Cliente com telefone"
            trigger="Todo dia às 9h (automático)"
            active={reminders && waConnected}
            toggle={{
              value: reminders,
              onChange: (v) => updateFlag("wa_reminders_enabled", v, setReminders),
              saving: saving === "wa_reminders_enabled",
            }}
            note={waNote}
          />
          <NotifCard
            title="Cobrança manual"
            description="Botão de WhatsApp em cada parcela na ficha do cliente para enviar a cobrança na hora, quando você quiser."
            channel="whatsapp"
            audience="Cliente com telefone"
            trigger="Manual — você aciona pela ficha do cliente"
            active={waConnected}
            note={waNote}
          />
        </div>
      </div>

      {/* Notificações para VOCÊ / loja */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Para você (loja)
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NotifCard
            title="Alertas de crediário"
            description="Aviso no celular/computador (push) e no sininho sobre parcelas que vencem amanhã, hoje ou estão atrasadas, com o nome do cliente e o valor."
            channel="push"
            audience="Administradores"
            trigger="Todo dia às 9h (automático)"
            active={pushPermission === "granted"}
            note={
              pushPermission !== "granted"
                ? "Ative as notificações pelo sino no topo da tela para receber neste dispositivo."
                : undefined
            }
          />
          <NotifCard
            title="Recibo impresso automático"
            description="Abre a impressão do cupom automaticamente ao finalizar a venda. Desligado, você ainda pode imprimir manualmente."
            channel="impressora"
            audience="Loja / caixa"
            trigger="Ao finalizar uma venda"
            active={autoPrint}
            toggle={{ value: autoPrint, onChange: handleAutoPrint }}
          />
        </div>
      </div>
    </div>
  );
}

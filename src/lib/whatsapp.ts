// ============================================================
// Integração WhatsApp via Evolution API (v2)
// Docs: https://docs.evolutionfoundation.com.br
// As credenciais ficam salvas localmente no navegador.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoreInfo, type ReceiptData } from "@/lib/receipt";

export interface EvolutionConfig {
  baseUrl: string; // ex: https://evolution.suaempresa.com
  apiKey: string; // API key global da Evolution
  instance: string; // nome da instância
}

export interface EvolutionSettings extends EvolutionConfig {
  connected: boolean;
  receiptEnabled: boolean;
  paymentConfirmEnabled: boolean;
  remindersEnabled: boolean;
}

// ---- Persistência no banco (tabela app_settings, linha única id=1) ----
export async function fetchEvolutionSettings(
  supabase: SupabaseClient
): Promise<EvolutionSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "evolution_url, evolution_api_key, evolution_instance, evolution_connected, wa_receipt_enabled, wa_payment_confirm_enabled, wa_reminders_enabled"
    )
    .eq("id", 1)
    .single();

  return {
    baseUrl: data?.evolution_url || "",
    apiKey: data?.evolution_api_key || "",
    instance: data?.evolution_instance || "",
    connected: !!data?.evolution_connected,
    receiptEnabled: data?.wa_receipt_enabled !== false,
    paymentConfirmEnabled: data?.wa_payment_confirm_enabled !== false,
    remindersEnabled: data?.wa_reminders_enabled !== false,
  };
}

export async function saveEvolutionConfig(
  supabase: SupabaseClient,
  cfg: EvolutionConfig
): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({
      evolution_url: cfg.baseUrl.trim().replace(/\/+$/, ""),
      evolution_api_key: cfg.apiKey.trim(),
      evolution_instance: cfg.instance.trim(),
    })
    .eq("id", 1);
  if (error) throw error;
}

export async function setWhatsappConnected(
  supabase: SupabaseClient,
  value: boolean
): Promise<void> {
  await supabase
    .from("app_settings")
    .update({ evolution_connected: value })
    .eq("id", 1);
}

function isConfigured(cfg: EvolutionConfig): boolean {
  return !!cfg.baseUrl && !!cfg.apiKey && !!cfg.instance;
}

// Chamada genérica à Evolution API
async function evoFetch(
  cfg: EvolutionConfig,
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: unknown,
  timeoutMs?: number
): Promise<Record<string, unknown>> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}${path}`;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = timeoutMs
    ? setTimeout(() => controller!.abort(), timeoutMs)
    : undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") throw new Error("__timeout__");
    throw err;
  }
  if (timer) clearTimeout(timer);

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      (data?.message as string) ||
      (data?.error as string) ||
      (typeof data?.response === "object"
        ? JSON.stringify(data.response)
        : "") ||
      `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Cria a instância (ignora se já existir) e retorna o QR (base64) para conectar
export async function connectWhatsapp(cfg: EvolutionConfig): Promise<string | null> {
  if (!isConfigured(cfg)) {
    throw new Error("Preencha URL, API Key e nome da instância.");
  }

  // 1. Tenta criar a instância (pode já existir — ok)
  try {
    const created = await evoFetch(cfg, "/instance/create", "POST", {
      instanceName: cfg.instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });
    const qr = extractQr(created);
    if (qr) return qr;
  } catch {
    // Provavelmente a instância já existe — segue para o connect
  }

  // 2. Busca o QR pelo endpoint de conexão
  const data = await evoFetch(cfg, `/instance/connect/${encodeURIComponent(cfg.instance)}`);
  return extractQr(data);
}

function extractQr(data: Record<string, unknown>): string | null {
  // v2 pode retornar { qrcode: { base64 } } ou { base64 }
  const qrObj = data?.qrcode as Record<string, unknown> | undefined;
  const base64 =
    (qrObj?.base64 as string) || (data?.base64 as string) || null;
  if (!base64) return null;
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

// Estado da conexão: "open" (conectado), "connecting", "close"
export async function getConnectionState(cfg: EvolutionConfig): Promise<string> {
  const data = await evoFetch(
    cfg,
    `/instance/connectionState/${encodeURIComponent(cfg.instance)}`
  );
  const instance = data?.instance as Record<string, unknown> | undefined;
  return (instance?.state as string) || (data?.state as string) || "close";
}

// Desconecta (logout) a instância
export async function disconnectWhatsapp(cfg: EvolutionConfig): Promise<void> {
  await evoFetch(cfg, `/instance/logout/${encodeURIComponent(cfg.instance)}`, "DELETE");
}

// Gera um link "clique para enviar" (wa.me) com a mensagem pré-preenchida.
// Abre a conversa do cliente no WhatsApp para envio manual (sem depender da API).
export function buildWhatsappLink(phone: string, text: string): string {
  const number = normalizePhone(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// Normaliza o telefone para o formato do WhatsApp (DDI + DDD + número)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // Se não começar com o DDI 55 (Brasil) e tiver 10-11 dígitos, adiciona
  if (digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

// Envia uma mensagem de texto
export async function sendWhatsappText(
  cfg: EvolutionConfig,
  phone: string,
  text: string
): Promise<void> {
  const number = normalizePhone(phone);
  if (!number) throw new Error("Telefone inválido.");
  await evoFetch(
    cfg,
    `/message/sendText/${encodeURIComponent(cfg.instance)}`,
    "POST",
    { number, text }
  );
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Monta o comprovante em texto (usa o modelo editável comprovante_venda)
export function buildWhatsappReceipt(data: ReceiptData): string {
  const t = getTemplates();

  const contatoLines: string[] = [];
  if (data.store.cnpj) contatoLines.push(`CNPJ: ${data.store.cnpj}`);
  if (data.store.phone) contatoLines.push(`Tel: ${data.store.phone}`);
  const contato = contatoLines.length ? contatoLines.join("\n") + "\n" : "";

  const clienteLinha = data.customer ? `👤 ${data.customer}\n` : "";

  const itens = data.items
    .map(
      (item) =>
        `• ${item.name}\n   ${item.quantity} ${item.unit} x ${brl(item.unitPrice)} = ${brl(item.total)}`
    )
    .join("\n");

  const resumoLines: string[] = [];
  resumoLines.push(`Subtotal: ${brl(data.subtotal)}`);
  if (data.discount > 0) resumoLines.push(`Desconto: -${brl(data.discount)}`);
  resumoLines.push(`*TOTAL: ${brl(data.total)}*`);
  resumoLines.push(`Pagamento: ${data.paymentMethodLabel}`);
  if (data.cashReceived !== undefined) {
    resumoLines.push(`Recebido: ${brl(data.cashReceived)}`);
    resumoLines.push(`Troco: ${brl(data.change ?? 0)}`);
  }
  const resumo = resumoLines.join("\n");

  let parcelas = "";
  if (data.installments && data.installments.length > 0) {
    const pl: string[] = ["", "*Parcelas (crediário):*"];
    data.installments.forEach((inst) => {
      const due = new Date(inst.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
      pl.push(`   ${inst.number}ª · venc. ${due} · ${brl(inst.amount)}`);
    });
    if (data.store.pixKey) {
      pl.push("");
      pl.push(`💳 *Pague as parcelas via PIX:* ${data.store.pixKey}`);
      pl.push("Após o pagamento, envie o comprovante por aqui.");
    }
    parcelas = pl.join("\n") + "\n";
  }

  const rodape = data.store.footer ? `${data.store.footer}\n` : "";

  return applyTemplate(t.comprovante_venda, {
    loja: data.store.name.toUpperCase(),
    contato,
    numero: String(data.saleNumber),
    data: new Date(data.date).toLocaleString("pt-BR"),
    cliente: data.customer || "",
    cliente_linha: clienteLinha,
    itens,
    resumo,
    parcelas,
    rodape,
    pix: data.store.pixKey || "",
  });
}

// Posta uma imagem no Status (Stories) do WhatsApp conectado.
// imageUrl: URL pública da imagem (a Evolution baixa a imagem desse link).
// Retorna true se enviou; false se não está configurado/conectado.
export async function postStatusToWhatsapp(
  supabase: SupabaseClient,
  imageUrl: string,
  caption: string
): Promise<boolean> {
  const settings = await fetchEvolutionSettings(supabase);
  if (!isConfigured(settings) || !settings.connected) return false;
  // Sem timeout/abort: a Evolution precisa da conexão aberta para baixar a
  // imagem e publicar. Abortar cancela a postagem. Quem controla o tempo do
  // botão na interface é a tela (libera o botão sem cortar a requisição).
  await evoFetch(
    settings,
    `/message/sendStatus/${encodeURIComponent(settings.instance)}`,
    "POST",
    {
      type: "image",
      content: imageUrl,
      caption: caption || "",
      allContacts: true,
    }
  );
  return true;
}

// ---- Envio de mensagens via Edge Function (servidor → Evolution) ----
// Evita bloqueios de CORS/rede do navegador e registra tudo no histórico.
export interface SendLogMeta {
  kind: string; // comprovante | confirmacao_pagamento | cobranca_manual | lembrete
  recipientType?: "cliente" | "admin";
  customerId?: string | null;
  recipientName?: string | null;
  saleId?: string | null;
  installmentId?: string | null;
  title?: string | null;
  requireFlag?: "receipt" | "paymentConfirm";
}

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

async function invokeSend(
  supabase: SupabaseClient,
  phone: string,
  text: string,
  meta: SendLogMeta
): Promise<SendResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone,
        text,
        kind: meta.kind,
        requireFlag: meta.requireFlag ?? null,
        customerId: meta.customerId ?? null,
        recipientName: meta.recipientName ?? null,
        saleId: meta.saleId ?? null,
        installmentId: meta.installmentId ?? null,
        title: meta.title ?? null,
      },
    });
    if (error) return { ok: false, error: error.message };
    return (data as SendResult) ?? { ok: false, error: "sem resposta" };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

// Envia uma mensagem de texto ao cliente pelo servidor.
// Retorna true se enviou; false se não está conectado/desativado/falhou.
export async function sendCustomerMessage(
  supabase: SupabaseClient,
  phone: string,
  text: string,
  meta?: SendLogMeta
): Promise<boolean> {
  const res = await invokeSend(supabase, phone, text, {
    kind: meta?.kind ?? "mensagem",
    ...(meta || {}),
  });
  return res.ok;
}

export interface PaymentMessageInput {
  customerName: string;
  amountPaid: number;
  installmentNumber: number;
  saleNumber: number | string;
  remainingInInstallment: number;
  installmentPaid: boolean;
  totalDebt: number;
}

// ============================================================
// Modelos de mensagem editáveis (salvos no navegador + no banco)
// ============================================================
export interface MessageTemplates {
  lembrete_3dias: string;
  lembrete_vespera: string;
  lembrete_hoje: string;
  lembrete_atraso: string;
  confirmacao_pagamento: string;
  comprovante_venda: string;
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  lembrete_3dias:
    "Olá, {primeiro_nome}.\n\n" +
    "Lembrete: a parcela de *{valor}* referente à sua compra vence em *{vencimento}* (daqui a 3 dias).\n\n" +
    "Você pode efetuar o pagamento via PIX na chave *{pix}*. Após o pagamento, envie o comprovante por aqui.\n\n" +
    "Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\n{loja}",
  lembrete_vespera:
    "Olá, {primeiro_nome}.\n\n" +
    "Lembrete: a parcela de *{valor}* referente à sua compra vence *amanhã ({vencimento})*.\n\n" +
    "Você pode efetuar o pagamento via PIX na chave *{pix}*. Após o pagamento, envie o comprovante por aqui.\n\n" +
    "Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\n{loja}",
  lembrete_hoje:
    "Olá, {primeiro_nome}.\n\n" +
    "A parcela de *{valor}* referente à sua compra vence *hoje ({vencimento})*.\n\n" +
    "Você pode efetuar o pagamento via PIX na chave *{pix}*. Após o pagamento, envie o comprovante por aqui.\n\n" +
    "Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\n{loja}",
  lembrete_atraso:
    "Olá, {primeiro_nome}.\n\n" +
    "Consta em aberto a parcela de *{valor}*, vencida em *{vencimento}*.\n\n" +
    "Para regularizar, efetue o pagamento via PIX na chave *{pix}* e envie o comprovante por aqui.\n\n" +
    "Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.\n\n{loja}",
  confirmacao_pagamento:
    "*{loja}*\n✅ *Pagamento recebido!*\n\n" +
    "Olá {primeiro_nome}, confirmamos o recebimento de *{valor_pago}*.\n" +
    "Parcela {parcela}ª · venda #{venda}\n" +
    "{status_parcela}\n\n{saldo_linha}",
  comprovante_venda:
    "*{loja}*\n{contato}──────────────\n" +
    "🧾 *Comprovante de Venda* #{numero}\n📅 {data}\n{cliente_linha}──────────────\n" +
    "{itens}\n──────────────\n{resumo}\n{parcelas}──────────────\n" +
    "{rodape}_Documento sem valor fiscal_",
};

const TEMPLATES_KEY = "app_vendas_msg_templates";

export function getTemplates(): MessageTemplates {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    return { ...DEFAULT_TEMPLATES, ...(JSON.parse(raw) as Partial<MessageTemplates>) };
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(t: MessageTemplates) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
}

// Substitui {variavel} pelos valores; mantém {x} se não houver valor.
export function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? vars[k] : `{${k}}`))
    .trim();
}

// Monta a mensagem de confirmação de pagamento de parcela (usa o modelo)
export function buildPaymentMessage(input: PaymentMessageInput): string {
  const store = getStoreInfo();
  const t = getTemplates();
  const firstName = input.customerName.split(" ")[0] || input.customerName;
  const statusParcela = input.installmentPaid
    ? "Parcela quitada! ✔️"
    : `Resta nesta parcela: ${brl(input.remainingInInstallment)}`;
  const saldoLinha =
    input.totalDebt > 0
      ? `Saldo total em aberto: *${brl(input.totalDebt)}*`
      : "Você está com tudo em dia. Obrigado! 🙏";
  return applyTemplate(t.confirmacao_pagamento, {
    loja: store.name || "",
    primeiro_nome: firstName,
    cliente: input.customerName,
    valor_pago: brl(input.amountPaid),
    parcela: String(input.installmentNumber),
    venda: String(input.saleNumber),
    status_parcela: statusParcela,
    saldo_linha: saldoLinha,
  });
}

// Monta a mensagem de cobrança de parcela — IDÊNTICA ao lembrete automático
// enviado às 9h (mesma redação, com PIX e assinatura da loja).
export function buildCollectionMessage(input: {
  customerName: string;
  remaining: number;
  dueDate: string; // YYYY-MM-DD
}): string {
  const store = getStoreInfo();
  const t = getTemplates();
  const firstName = input.customerName.split(" ")[0] || input.customerName;
  const due = new Date(input.dueDate + "T00:00:00");
  const dueStr = due.toLocaleDateString("pt-BR");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const tpl =
    diffDays < 0
      ? t.lembrete_atraso
      : diffDays === 0
      ? t.lembrete_hoje
      : diffDays === 1
      ? t.lembrete_vespera
      : t.lembrete_3dias;

  return applyTemplate(tpl, {
    primeiro_nome: firstName,
    cliente: input.customerName,
    valor: brl(input.remaining),
    vencimento: dueStr,
    pix: store.pixKey || "",
    loja: store.name || "",
  });
}

// Envia o comprovante para o WhatsApp do cliente.
// Retorna true se enviou; false se não está configurado/conectado.
export async function sendReceiptToWhatsapp(
  supabase: SupabaseClient,
  data: ReceiptData,
  phone: string
): Promise<boolean> {
  const text = buildWhatsappReceipt(data);
  const res = await invokeSend(supabase, phone, text, {
    kind: "comprovante",
    requireFlag: "receipt",
    recipientName: data.customer ?? null,
    title: `Comprovante da venda #${data.saleNumber}`,
  });
  return res.ok;
}

// Envia a confirmação de pagamento de parcela (respeita o interruptor no servidor).
export async function sendPaymentConfirmation(
  supabase: SupabaseClient,
  phone: string,
  text: string,
  meta?: SendLogMeta
): Promise<boolean> {
  const res = await invokeSend(supabase, phone, text, {
    kind: "confirmacao_pagamento",
    requireFlag: "paymentConfirm",
    ...(meta || {}),
  });
  return res.ok;
}

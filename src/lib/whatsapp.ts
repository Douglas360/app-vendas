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
}

// ---- Persistência no banco (tabela app_settings, linha única id=1) ----
export async function fetchEvolutionSettings(
  supabase: SupabaseClient
): Promise<EvolutionSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "evolution_url, evolution_api_key, evolution_instance, evolution_connected"
    )
    .eq("id", 1)
    .single();

  return {
    baseUrl: data?.evolution_url || "",
    apiKey: data?.evolution_api_key || "",
    instance: data?.evolution_instance || "",
    connected: !!data?.evolution_connected,
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

// Monta o comprovante em texto (formatado para WhatsApp)
export function buildWhatsappReceipt(data: ReceiptData): string {
  const lines: string[] = [];
  lines.push(`*${data.store.name.toUpperCase()}*`);
  if (data.store.cnpj) lines.push(`CNPJ: ${data.store.cnpj}`);
  if (data.store.phone) lines.push(`Tel: ${data.store.phone}`);
  lines.push("──────────────");
  lines.push(`🧾 *Comprovante de Venda* #${data.saleNumber}`);
  lines.push(`📅 ${new Date(data.date).toLocaleString("pt-BR")}`);
  if (data.customer) lines.push(`👤 ${data.customer}`);
  lines.push("──────────────");

  data.items.forEach((item) => {
    lines.push(`• ${item.name}`);
    lines.push(
      `   ${item.quantity} ${item.unit} x ${brl(item.unitPrice)} = ${brl(item.total)}`
    );
  });

  lines.push("──────────────");
  lines.push(`Subtotal: ${brl(data.subtotal)}`);
  if (data.discount > 0) lines.push(`Desconto: -${brl(data.discount)}`);
  lines.push(`*TOTAL: ${brl(data.total)}*`);
  lines.push(`Pagamento: ${data.paymentMethodLabel}`);

  if (data.cashReceived !== undefined) {
    lines.push(`Recebido: ${brl(data.cashReceived)}`);
    lines.push(`Troco: ${brl(data.change ?? 0)}`);
  }

  if (data.installments && data.installments.length > 0) {
    lines.push("");
    lines.push("*Parcelas (crediário):*");
    data.installments.forEach((inst) => {
      const due = new Date(inst.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
      lines.push(`   ${inst.number}ª · venc. ${due} · ${brl(inst.amount)}`);
    });
  }

  lines.push("──────────────");
  if (data.store.footer) lines.push(data.store.footer);
  lines.push("_Documento sem valor fiscal_");

  return lines.join("\n");
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
  try {
    await evoFetch(
      settings,
      `/message/sendStatus/${encodeURIComponent(settings.instance)}`,
      "POST",
      {
        type: "image",
        content: imageUrl,
        caption: caption || "",
        allContacts: true,
      },
      15000
    );
  } catch (err) {
    // A Evolution costuma demorar (ou não responder) ao postar em todos os
    // contatos, mesmo tendo publicado. Nesse caso tratamos como enviado.
    if ((err as Error).message === "__timeout__") return true;
    throw err;
  }
  return true;
}

// Envia uma mensagem de texto ao cliente, se o WhatsApp estiver conectado.
// Retorna true se enviou; false se não está configurado/conectado.
export async function sendCustomerMessage(
  supabase: SupabaseClient,
  phone: string,
  text: string
): Promise<boolean> {
  const settings = await fetchEvolutionSettings(supabase);
  if (!isConfigured(settings) || !settings.connected) return false;
  await sendWhatsappText(settings, phone, text);
  return true;
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

// Monta a mensagem de confirmação de pagamento de parcela
export function buildPaymentMessage(input: PaymentMessageInput): string {
  const store = getStoreInfo();
  const firstName = input.customerName.split(" ")[0] || input.customerName;
  const lines: string[] = [];
  lines.push(`*${store.name}*`);
  lines.push("✅ *Pagamento recebido!*");
  lines.push("");
  lines.push(`Olá ${firstName}, confirmamos o recebimento de *${brl(input.amountPaid)}*.`);
  lines.push(`Parcela ${input.installmentNumber}ª · venda #${input.saleNumber}`);
  if (input.installmentPaid) {
    lines.push("Parcela quitada! ✔️");
  } else {
    lines.push(`Resta nesta parcela: ${brl(input.remainingInInstallment)}`);
  }
  lines.push("");
  if (input.totalDebt > 0) {
    lines.push(`Saldo total em aberto: *${brl(input.totalDebt)}*`);
  } else {
    lines.push("Você está com tudo em dia. Obrigado! 🙏");
  }
  return lines.join("\n");
}

// Envia o comprovante para o WhatsApp do cliente.
// Retorna true se enviou; false se não está configurado/conectado.
export async function sendReceiptToWhatsapp(
  supabase: SupabaseClient,
  data: ReceiptData,
  phone: string
): Promise<boolean> {
  const settings = await fetchEvolutionSettings(supabase);
  if (!isConfigured(settings) || !settings.connected) return false;
  const text = buildWhatsappReceipt(data);
  await sendWhatsappText(settings, phone, text);
  return true;
}

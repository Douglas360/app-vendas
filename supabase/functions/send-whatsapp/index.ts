import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11 && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const {
      phone,
      text,
      kind,
      requireFlag,
      customerId,
      recipientName,
      saleId,
      installmentId,
      title,
    } = body ?? {};

    if (!phone || !text) return json({ ok: false, error: "phone/text ausentes" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: s } = await supabase
      .from("app_settings")
      .select(
        "evolution_url, evolution_api_key, evolution_instance, evolution_connected, wa_receipt_enabled, wa_payment_confirm_enabled"
      )
      .eq("id", 1)
      .single();

    const configured = !!(s?.evolution_url && s?.evolution_api_key && s?.evolution_instance);
    if (!configured || !s?.evolution_connected) {
      return json({ ok: false, skipped: true, reason: "nao_conectado" });
    }
    if (requireFlag === "receipt" && s.wa_receipt_enabled === false) {
      return json({ ok: false, skipped: true, reason: "desativado" });
    }
    if (requireFlag === "paymentConfirm" && s.wa_payment_confirm_enabled === false) {
      return json({ ok: false, skipped: true, reason: "desativado" });
    }

    const number = normalizePhone(phone);

    const { data: nlog } = await supabase
      .from("notification_log")
      .insert({
        channel: "whatsapp",
        kind: kind || "mensagem",
        recipient_type: "cliente",
        customer_id: customerId ?? null,
        recipient_name: recipientName ?? null,
        recipient_phone: number,
        title: title ?? null,
        body: text,
        status: "em_andamento",
        sale_id: saleId ?? null,
        installment_id: installmentId ?? null,
      })
      .select("id")
      .single();

    try {
      const base = String(s.evolution_url).replace(/\/+$/, "");
      const res = await fetch(
        `${base}/message/sendText/${encodeURIComponent(String(s.evolution_instance))}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: String(s.evolution_api_key),
          },
          body: JSON.stringify({ number, text }),
        }
      );
      if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text()}`);
      if (nlog?.id)
        await supabase
          .from("notification_log")
          .update({ status: "enviado" })
          .eq("id", nlog.id);
      return json({ ok: true });
    } catch (e) {
      const err = String((e as Error)?.message || e);
      if (nlog?.id)
        await supabase
          .from("notification_log")
          .update({ status: "falhou", error: err })
          .eq("id", nlog.id);
      return json({ ok: false, error: err });
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

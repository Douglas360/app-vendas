import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function ymdInTZ(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Normaliza telefone para o formato do WhatsApp (DDI 55 + DDD + número)
function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11 && !digits.startsWith("55")) return `55${digits}`;
  return digits;
}

// Modelos padrão (iguais aos do app). Sobrescritos por app_settings.message_templates.
const DEFAULT_TEMPLATES: Record<string, string> = {
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
};

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? vars[k] : `{${k}}`))
    .trim();
}

// Intervalo entre envios de WhatsApp (evita rajada e reduz risco de bloqueio)
const WA_DELAY_MS = 10000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mensagem para o cliente conforme o vencimento (usa os modelos editáveis)
function buildCustomerMessage(
  bucket: string,
  firstName: string,
  fullName: string,
  remaining: number,
  dueDate: string,
  storeName: string,
  pixKey: string,
  templates: Record<string, string>
): string {
  const key =
    bucket === "atrasada"
      ? "lembrete_atraso"
      : bucket === "hoje"
      ? "lembrete_hoje"
      : bucket === "tres_dias"
      ? "lembrete_3dias"
      : "lembrete_vespera";
  const tpl = templates[key] || DEFAULT_TEMPLATES[key];
  return applyTemplate(tpl, {
    primeiro_nome: firstName,
    cliente: fullName,
    valor: brl(remaining),
    vencimento: fmtDate(dueDate),
    pix: pixKey || "",
    loja: storeName || "",
  });
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: secrets } = await supabase
      .from("app_secrets")
      .select("vapid_public, vapid_private, cron_secret")
      .eq("id", 1)
      .single();

    const provided = req.headers.get("x-cron-secret");
    if (!secrets?.cron_secret || provided !== secrets.cron_secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!secrets.vapid_public || !secrets.vapid_private) {
      return new Response(JSON.stringify({ error: "vapid keys missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(
      "mailto:admin@vendafacil.app",
      secrets.vapid_public,
      secrets.vapid_private
    );

    // Configuração do WhatsApp (Evolution) + nome da loja + liga/desliga
    const { data: settings } = await supabase
      .from("app_settings")
      .select(
        "evolution_url, evolution_api_key, evolution_instance, evolution_connected, store_name, wa_reminders_enabled, pix_key, message_templates"
      )
      .eq("id", 1)
      .single();

    const waEnabled = !!settings?.wa_reminders_enabled;
    const pixKey: string = settings?.pix_key || "";
    const templates: Record<string, string> = {
      ...DEFAULT_TEMPLATES,
      ...((settings?.message_templates as Record<string, string> | null) || {}),
    };
    const evoOk = !!(
      settings?.evolution_url &&
      settings?.evolution_api_key &&
      settings?.evolution_instance &&
      settings?.evolution_connected
    );
    const storeName: string = settings?.store_name || "";

    async function sendWhatsAppText(number: string, text: string) {
      const base = String(settings!.evolution_url).replace(/\/+$/, "");
      const res = await fetch(
        `${base}/message/sendText/${encodeURIComponent(String(settings!.evolution_instance))}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: String(settings!.evolution_api_key),
          },
          body: JSON.stringify({ number, text }),
        }
      );
      if (!res.ok) throw new Error(`Evolution ${res.status}`);
    }

    const todayStr = ymdInTZ(0);
    const tomorrowStr = ymdInTZ(1);
    const threeDaysStr = ymdInTZ(3);

    // Parcelas em aberto: 3 dias antes, véspera, no dia e atrasadas
    const { data: insts, error: instErr } = await supabase
      .from("credit_installments")
      .select(
        "id, installment_number, amount, amount_paid, due_date, status, sale_id, customer:customers(id, full_name, current_debt, phone), sale:sales(sale_number)"
      )
      .in("status", ["pendente", "atrasado"])
      .or(
        `due_date.eq.${todayStr},due_date.eq.${tomorrowStr},due_date.eq.${threeDaysStr},due_date.lt.${todayStr}`
      )
      .order("due_date", { ascending: true });

    if (instErr) throw instErr;

    // Admins ativos
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);
    const adminIds = (admins || []).map((a: { id: string }) => a.id);

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", adminIds.length ? adminIds : ["00000000-0000-0000-0000-000000000000"]);

    // Dedupe: notificações de crediário criadas nas últimas 20h
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("user_id, metadata")
      .eq("type", "crediario")
      .gte("created_at", since);
    const existingSet = new Set(
      (existingNotifs || []).map(
        (n: { user_id: string; metadata: { dedupe?: string } }) =>
          `${n.user_id}:${n.metadata?.dedupe}`
      )
    );

    const results = {
      installments: (insts || []).length,
      created: 0,
      pushed: 0,
      removed: 0,
      waSent: 0,
      errors: [] as string[],
    };

    for (const inst of insts || []) {
      const remaining = Number(inst.amount) - Number(inst.amount_paid);
      if (remaining <= 0.001) continue;

      const cust = inst.customer as {
        id: string;
        full_name: string;
        current_debt: number;
        phone: string | null;
      } | null;
      if (!cust) continue;
      const saleNo = (inst.sale as { sale_number: number } | null)?.sale_number ?? "?";

      let bucket: string;
      if (inst.due_date === threeDaysStr) bucket = "tres_dias";
      else if (inst.due_date === tomorrowStr) bucket = "vespera";
      else if (inst.due_date === todayStr) bucket = "hoje";
      else bucket = "atrasada";

      // ---- WhatsApp para o CLIENTE (profissional) ----
      if (waEnabled && evoOk && cust.phone) {
        const number = normalizePhone(cust.phone);
        if (number) {
          // idempotência: 1 envio por parcela/bucket/dia
          const { data: logIns } = await supabase
            .from("whatsapp_reminders_log")
            .upsert(
              { installment_id: inst.id, bucket, sent_on: todayStr },
              { onConflict: "installment_id,bucket,sent_on", ignoreDuplicates: true }
            )
            .select();

          if (logIns && logIns.length > 0) {
            const firstName = cust.full_name.split(" ")[0] || cust.full_name;
            const msg = buildCustomerMessage(
              bucket,
              firstName,
              cust.full_name,
              remaining,
              inst.due_date,
              storeName,
              pixKey,
              templates
            );
            const logTitle =
              bucket === "tres_dias"
                ? "Lembrete: vence em 3 dias"
                : bucket === "vespera"
                ? "Lembrete: vence amanhã"
                : bucket === "hoje"
                ? "Lembrete: vence hoje"
                : "Lembrete: parcela atrasada";
            const { data: nlog } = await supabase
              .from("notification_log")
              .insert({
                channel: "whatsapp",
                kind: "lembrete",
                recipient_type: "cliente",
                customer_id: cust.id,
                recipient_name: cust.full_name,
                recipient_phone: number,
                title: logTitle,
                body: msg,
                status: "em_andamento",
                installment_id: inst.id,
                sale_id: inst.sale_id ?? null,
              })
              .select("id")
              .single();
            try {
              // Espaça os envios (menos o primeiro) para não disparar em rajada
              if (results.waSent > 0) await sleep(WA_DELAY_MS);
              await sendWhatsAppText(number, msg);
              results.waSent++;
              if (nlog?.id)
                await supabase
                  .from("notification_log")
                  .update({ status: "enviado" })
                  .eq("id", nlog.id);
            } catch (e) {
              // libera o log para nova tentativa numa próxima execução do dia
              await supabase
                .from("whatsapp_reminders_log")
                .delete()
                .eq("installment_id", inst.id)
                .eq("bucket", bucket)
                .eq("sent_on", todayStr);
              if (nlog?.id)
                await supabase
                  .from("notification_log")
                  .update({
                    status: "falhou",
                    error: String((e as Error)?.message || e),
                  })
                  .eq("id", nlog.id);
              results.errors.push("wa:" + String((e as Error)?.message || e));
            }
          }
        }
      }

      // ---- Push + sininho para os ADMINS ----
      let title: string;
      let body: string;
      if (bucket === "tres_dias") {
        title = `📅 Vence em 3 dias — ${cust.full_name}`;
        body = `${brl(remaining)} · parcela ${inst.installment_number} (venda #${saleNo}). Saldo do cliente: ${brl(Number(cust.current_debt))}.`;
      } else if (bucket === "vespera") {
        title = `💰 Vence amanhã — ${cust.full_name}`;
        body = `${brl(remaining)} · parcela ${inst.installment_number} (venda #${saleNo}). Saldo do cliente: ${brl(Number(cust.current_debt))}.`;
      } else if (bucket === "hoje") {
        title = `📌 Vence hoje — ${cust.full_name}`;
        body = `${brl(remaining)} · parcela ${inst.installment_number} (venda #${saleNo}). Saldo do cliente: ${brl(Number(cust.current_debt))}.`;
      } else {
        title = `⚠️ Em atraso — ${cust.full_name}`;
        body = `Venceu ${fmtDate(inst.due_date)} · ${brl(remaining)} · parcela ${inst.installment_number} (venda #${saleNo}).`;
      }

      const link = `/dashboard/clientes/${cust.id}`;
      const dedupe = `${inst.id}:${bucket}:${todayStr}`;

      for (const adminId of adminIds) {
        if (existingSet.has(`${adminId}:${dedupe}`)) continue;

        await supabase.from("notifications").insert({
          user_id: adminId,
          title,
          body,
          type: "crediario",
          link,
          metadata: { dedupe, installment_id: inst.id, bucket, customer_id: cust.id },
        });
        results.created++;

        const payload = JSON.stringify({ title, body, url: link });
        for (const sub of (subs || []).filter((s) => s.user_id === adminId)) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            results.pushed++;
          } catch (e) {
            const code = (e as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) {
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
              results.removed++;
            } else {
              results.errors.push(String((e as Error)?.message || e));
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const {
      imageBase64,
      mimeType,
      apiKey,
      prompt,
      quality,
    }: {
      imageBase64?: string;
      mimeType?: string;
      apiKey?: string;
      prompt?: string;
      quality?: string;
    } = body ?? {};

    if (!apiKey) return json({ ok: false, error: "Chave da OpenAI ausente." }, 400);
    if (!imageBase64) return json({ ok: false, error: "Imagem ausente." }, 400);

    const bytes = b64ToBytes(imageBase64);
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append(
      "image",
      new Blob([bytes], { type: mimeType || "image/png" }),
      "produto.png"
    );
    form.append(
      "prompt",
      prompt ||
        "Recrie ESTE MESMO produto como uma foto premium de catálogo, em fundo de estúdio limpo e neutro, iluminação difusa, sombra sutil. Mantenha exatamente o produto (forma, cor, estampa, logos, textura). Sem texto, sem pessoas."
    );
    form.append("size", "1024x1024");
    form.append("quality", quality || "high");
    form.append("input_fidelity", "high");
    form.append("n", "1");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({
        ok: false,
        error: data?.error?.message || `OpenAI ${res.status}`,
      });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return json({ ok: false, error: "A OpenAI não retornou imagem." });
    return json({ ok: true, b64 });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

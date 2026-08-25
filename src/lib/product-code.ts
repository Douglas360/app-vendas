/**
 * Normalização de códigos de produto (código de barras / SKU) para busca.
 *
 * Regras:
 * - ignora espaços em volta e diferença de maiúsculas/minúsculas;
 * - quando o código é puramente numérico, ignora os zeros à esquerda.
 *   Assim "93", "093" e "00093" encontram o produto de código "00093".
 */
export function normalizeCode(value: string | null | undefined): string {
  if (!value) return "";
  const v = String(value).trim().toLowerCase();
  if (!v) return "";
  if (/^\d+$/.test(v)) return v.replace(/^0+/, "") || "0";
  return v;
}

/** Diz se o termo digitado/bipado corresponde a algum dos códigos do produto. */
export function codeMatches(
  term: string,
  ...candidates: (string | null | undefined)[]
): boolean {
  const t = normalizeCode(term);
  if (!t) return false;
  return candidates.some((c) => {
    const n = normalizeCode(c);
    return n !== "" && n === t;
  });
}

// ============================================================
// Recibo de acerto de consignado (A4 — imprimir ou salvar em PDF)
// e versão em texto para enviar no WhatsApp do vendedor.
// ============================================================

import { getStoreInfo } from "@/lib/receipt";

export interface SettlementItem {
  name: string;
  quantity: number; // levou
  sold: number; // vendeu
  unitPrice: number;
}

export interface SettlementData {
  kitNumber: number | string;
  sellerName: string;
  deliveredAt: string; // ISO
  settledAt: string; // ISO
  items: SettlementItem[];
  totalSold: number;
  commissionPercent: number;
  commissionAmount: number;
  netAmount: number;
  paymentLabel?: string;
  notes?: string | null;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildSettlementHtml(d: SettlementData): string {
  const store = getStoreInfo();
  const rows = d.items
    .map((i) => {
      const devolveu = i.quantity - i.sold;
      const total = i.sold * i.unitPrice;
      return `<tr>
        <td>${esc(i.name)}</td>
        <td class="c">${i.quantity}</td>
        <td class="c b">${i.sold}</td>
        <td class="c">${devolveu}</td>
        <td class="r">${brl(i.unitPrice)}</td>
        <td class="r b">${brl(total)}</td>
      </tr>`;
    })
    .join("");

  const totalPecas = d.items.reduce((s, i) => s + i.quantity, 0);
  const totalVendidas = d.items.reduce((s, i) => s + i.sold, 0);

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Acerto Consignado #${d.kitNumber}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color: #666; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
  .store { font-size: 18px; font-weight: 800; text-transform: uppercase; }
  .small { font-size: 11px; }
  .box { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
  .grid { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #f4f4f5; padding: 7px 8px; border-bottom: 1px solid #ddd;
       font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
  td { padding: 7px 8px; border-bottom: 1px solid #eee; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
  .totals { margin-top: 16px; margin-left: auto; width: 280px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .line { border-top: 1px solid #ddd; }
  .totals .final { border-top: 2px solid #111; font-size: 16px; font-weight: 800; padding-top: 8px; }
  .sign { margin-top: 48px; display: flex; gap: 40px; font-size: 12px; text-align: center; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; }
  .foot { margin-top: 26px; font-size: 10px; color: #888; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="store">${esc(store.name)}</div>
      ${store.cnpj ? `<div class="small muted">CNPJ: ${esc(store.cnpj)}</div>` : ""}
      ${store.phone ? `<div class="small muted">Tel: ${esc(store.phone)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <h1>Acerto de Consignado</h1>
      <div class="small muted">Kit #${d.kitNumber}</div>
      <div class="small muted">Emitido em ${dt(d.settledAt)}</div>
    </div>
  </div>

  <div class="box">
    <div class="grid">
      <div><strong>Vendedor:</strong> ${esc(d.sellerName)}</div>
      <div><strong>Entrega do kit:</strong> ${dt(d.deliveredAt)}</div>
      <div><strong>Data do acerto:</strong> ${dt(d.settledAt)}</div>
      ${d.paymentLabel ? `<div><strong>Pagamento:</strong> ${esc(d.paymentLabel)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Produto</th><th class="c">Levou</th><th class="c">Vendeu</th>
      <th class="c">Devolveu</th><th class="r">Preço</th><th class="r">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="small muted" style="margin-top:8px">
    ${totalPecas} peça(s) entregues · ${totalVendidas} vendida(s) · ${totalPecas - totalVendidas} devolvida(s)
  </div>

  <div class="totals">
    <div><span>Total vendido</span><span class="b">${brl(d.totalSold)}</span></div>
    <div class="line"><span>Comissão (${d.commissionPercent}%)</span><span class="b">- ${brl(
      d.commissionAmount
    )}</span></div>
    <div class="final"><span>Valor à loja</span><span>${brl(d.netAmount)}</span></div>
  </div>

  ${d.notes ? `<div class="box small" style="margin-top:16px"><strong>Observações:</strong> ${esc(d.notes)}</div>` : ""}

  <div class="sign">
    <div>${esc(d.sellerName)}<br /><span class="muted small">Vendedor(a)</span></div>
    <div>${esc(store.name)}<br /><span class="muted small">Responsável</span></div>
  </div>

  <div class="foot">Documento sem valor fiscal · Gerado pelo sistema em ${new Date().toLocaleString(
    "pt-BR"
  )}</div>
</body></html>`;
}

// Abre a janela de impressão (permite salvar como PDF)
export function printSettlement(d: SettlementData) {
  if (typeof window === "undefined") return;
  const html = buildSettlementHtml(d);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }
  };
  if (iframe.contentWindow) iframe.contentWindow.onload = triggerPrint;
  setTimeout(triggerPrint, 400);
}

// Versão em texto para o WhatsApp do vendedor
export function buildSettlementMessage(d: SettlementData): string {
  const store = getStoreInfo();
  const lines: string[] = [];
  lines.push(`*${store.name.toUpperCase()}*`);
  lines.push("──────────────");
  lines.push(`🤝 *Acerto de Consignado* · Kit #${d.kitNumber}`);
  lines.push(`👤 ${d.sellerName}`);
  lines.push(`📅 ${dt(d.settledAt)}`);
  lines.push("──────────────");

  d.items
    .filter((i) => i.sold > 0)
    .forEach((i) => {
      lines.push(`• ${i.name}`);
      lines.push(
        `   ${i.sold} x ${brl(i.unitPrice)} = ${brl(i.sold * i.unitPrice)}`
      );
    });

  const devolvidas = d.items.reduce((s, i) => s + (i.quantity - i.sold), 0);
  lines.push("──────────────");
  lines.push(`Total vendido: *${brl(d.totalSold)}*`);
  lines.push(`Sua comissão (${d.commissionPercent}%): *${brl(d.commissionAmount)}*`);
  lines.push(`Valor à loja: ${brl(d.netAmount)}`);
  if (devolvidas > 0) lines.push(`Peças devolvidas: ${devolvidas}`);
  if (d.notes) {
    lines.push("");
    lines.push(d.notes);
  }
  lines.push("──────────────");
  lines.push("Obrigado pela parceria! 🙌");
  return lines.join("\n");
}

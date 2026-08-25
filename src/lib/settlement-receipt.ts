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

export interface CommissionTier {
  minAmount: number;
  maxAmount: number | null; // null = sem teto
  percent: number;
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
  /** Faixas de comissão vigentes do vendedor (para constar no recibo) */
  tiers?: CommissionTier[];
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

// Ordena por nome do produto (PT-BR, ignorando acentos/maiúsculas)
function byName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
}

export function buildSettlementHtml(d: SettlementData): string {
  const store = getStoreInfo();
  const rows = byName(d.items)
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

  // Tabela de faixas de comissão (destaca a faixa aplicada)
  const tiers = (d.tiers || [])
    .slice()
    .sort((a, b) => a.minAmount - b.minAmount);
  const tiersBlock = tiers.length
    ? `<div class="tiers">
        <div class="tiers-title">Tabela de comissão do vendedor</div>
        <table class="tiers-table">
          <thead><tr><th>Faixa de venda</th><th class="r">Comissão</th></tr></thead>
          <tbody>
            ${tiers
              .map((t) => {
                const aplicada =
                  d.totalSold >= t.minAmount &&
                  (t.maxAmount === null || d.totalSold <= t.maxAmount);
                return `<tr class="${aplicada ? "on" : ""}">
                  <td>${brl(t.minAmount)} ${
                    t.maxAmount === null ? "ou mais" : `a ${brl(t.maxAmount)}`
                  }${aplicada ? " &nbsp;←&nbsp; <strong>aplicada</strong>" : ""}</td>
                  <td class="r b">${t.percent}%</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`
    : "";

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
  .tiers { margin-top: 18px; width: 320px; }
  .tiers-title { font-size: 11px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .3px; color: #555; margin-bottom: 4px; }
  .tiers-table { font-size: 11px; border: 1px solid #ddd; border-radius: 6px; }
  .tiers-table th { padding: 5px 8px; font-size: 10px; }
  .tiers-table td { padding: 5px 8px; }
  .tiers-table tr.on { background: #eef2ff; }
  .sign { margin-top: 40px; display: flex; gap: 40px; font-size: 12px; text-align: center; }
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

  ${tiersBlock}

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
  printHtml(buildSettlementHtml(d));
}

// Imprime um HTML usando iframe oculto (evita bloqueio de popup)
function printHtml(html: string) {
  if (typeof window === "undefined") return;

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

// ============================================================
// Romaneio do KIT (lista de entrega ao vendedor)
// ============================================================
export interface KitDocItem {
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
}

export interface KitDocData {
  kitNumber: number | string;
  sellerName: string;
  sellerPhone?: string | null;
  deliveredAt: string; // ISO
  items: KitDocItem[];
  notes?: string | null;
  /** Faixas de comissão vigentes do vendedor */
  tiers?: CommissionTier[];
}

export function buildKitHtml(d: KitDocData): string {
  const store = getStoreInfo();
  const rows = byName(d.items)
    .map(
      (i) => `<tr>
        <td>${esc(i.name)}</td>
        <td class="mono">${esc(i.code)}</td>
        <td class="c b">${i.quantity}</td>
        <td class="r">${brl(i.unitPrice)}</td>
        <td class="r b">${brl(i.quantity * i.unitPrice)}</td>
      </tr>`
    )
    .join("");

  const totalPecas = d.items.reduce((s, i) => s + i.quantity, 0);
  const totalValor = d.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // Tabela de comissão (referência para o vendedor)
  const tiers = (d.tiers || []).slice().sort((a, b) => a.minAmount - b.minAmount);
  const tiersBlock = tiers.length
    ? `<div class="tiers">
        <div class="tiers-title">Tabela de comissão do vendedor</div>
        <table class="tiers-table">
          <thead><tr><th>Faixa de venda</th><th class="r">Comissão</th></tr></thead>
          <tbody>
            ${tiers
              .map(
                (t) => `<tr>
                  <td>${brl(t.minAmount)} ${
                    t.maxAmount === null ? "ou mais" : `a ${brl(t.maxAmount)}`
                  }</td>
                  <td class="r b">${t.percent}%</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <div class="tiers-note">
          A comissão é calculada sobre o total efetivamente vendido, apurado no acerto.
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Kit Consignado #${d.kitNumber}</title>
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
  .mono { font-family: ui-monospace, "Courier New", monospace; font-size: 11px; }
  .totals { margin-top: 16px; margin-left: auto; width: 280px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .final { border-top: 2px solid #111; font-size: 16px; font-weight: 800; padding-top: 8px; }
  .tiers { margin-top: 18px; width: 320px; }
  .tiers-title { font-size: 11px; font-weight: 700; text-transform: uppercase;
                 letter-spacing: .3px; color: #555; margin-bottom: 4px; }
  .tiers-table { font-size: 11px; border: 1px solid #ddd; border-radius: 6px; }
  .tiers-table th { padding: 5px 8px; font-size: 10px; }
  .tiers-table td { padding: 5px 8px; }
  .tiers-note { font-size: 9px; color: #888; margin-top: 4px; }
  .terms { margin-top: 18px; font-size: 10px; color: #555; line-height: 1.5; }
  .sign { margin-top: 44px; display: flex; gap: 40px; font-size: 12px; text-align: center; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; }
  .foot { margin-top: 24px; font-size: 10px; color: #888; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="store">${esc(store.name)}</div>
      ${store.cnpj ? `<div class="small muted">CNPJ: ${esc(store.cnpj)}</div>` : ""}
      ${store.phone ? `<div class="small muted">Tel: ${esc(store.phone)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <h1>Kit Consignado</h1>
      <div class="small muted">Kit #${d.kitNumber}</div>
      <div class="small muted">Entrega: ${dt(d.deliveredAt)}</div>
    </div>
  </div>

  <div class="box">
    <div class="grid">
      <div><strong>Vendedor:</strong> ${esc(d.sellerName)}</div>
      ${d.sellerPhone ? `<div><strong>Telefone:</strong> ${esc(d.sellerPhone)}</div>` : ""}
      <div><strong>Data de entrega:</strong> ${dt(d.deliveredAt)}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Produto</th><th>Código</th><th class="c">Qtd</th>
      <th class="r">Preço</th><th class="r">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Total de peças</span><span class="b">${totalPecas}</span></div>
    <div class="final"><span>Valor total do kit</span><span>${brl(totalValor)}</span></div>
  </div>

  ${tiersBlock}

  ${d.notes ? `<div class="box small" style="margin-top:16px"><strong>Observações:</strong> ${esc(d.notes)}</div>` : ""}

  <div class="terms">
    Declaro ter recebido as mercadorias listadas acima em regime de consignação, comprometendo-me
    a devolvê-las nas mesmas condições ou efetuar o pagamento das peças vendidas na data do acerto.
  </div>

  <div class="sign">
    <div>${esc(d.sellerName)}<br /><span class="muted small">Recebi as mercadorias</span></div>
    <div>${esc(store.name)}<br /><span class="muted small">Responsável pela entrega</span></div>
  </div>

  <div class="foot">Documento sem valor fiscal · Gerado em ${new Date().toLocaleString(
    "pt-BR"
  )}</div>
</body></html>`;
}

// Imprime o romaneio do kit (permite salvar em PDF)
export function printKit(d: KitDocData) {
  printHtml(buildKitHtml(d));
}

// Versão em texto do kit para o WhatsApp do vendedor
export function buildKitMessage(d: KitDocData): string {
  const store = getStoreInfo();
  const lines: string[] = [];
  lines.push(`*${store.name.toUpperCase()}*`);
  lines.push("──────────────");
  lines.push(`📦 *Kit Consignado* #${d.kitNumber}`);
  lines.push(`👤 ${d.sellerName}`);
  lines.push(`📅 Entrega: ${dt(d.deliveredAt)}`);
  lines.push("──────────────");
  byName(d.items).forEach((i) => {
    lines.push(`• ${i.name}`);
    lines.push(`   ${i.quantity} x ${brl(i.unitPrice)} = ${brl(i.quantity * i.unitPrice)}`);
  });
  const totalPecas = d.items.reduce((s, i) => s + i.quantity, 0);
  const totalValor = d.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  lines.push("──────────────");
  lines.push(`Total: ${totalPecas} peça(s) · *${brl(totalValor)}*`);
  if (d.notes) {
    lines.push("");
    lines.push(d.notes);
  }
  lines.push("──────────────");
  lines.push("Boas vendas! 🙌");
  return lines.join("\n");
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

  byName(d.items)
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

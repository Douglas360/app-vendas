// ============================================================
// Geração de recibo / cupom de venda (estilo 80mm)
// Imprime via iframe oculto — evita bloqueio de popup e
// permite ao usuário imprimir ou "Salvar como PDF".
// ============================================================

export interface StoreInfo {
  name: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  footer?: string;
  paperWidth?: string; // largura do cupom em mm: "58" ou "80"
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface ReceiptInstallment {
  number: number;
  amount: number;
  dueDate: string; // YYYY-MM-DD
}

export interface ReceiptData {
  store: StoreInfo;
  saleNumber: number;
  date: string; // ISO
  seller: string;
  customer: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethodLabel: string;
  cashReceived?: number;
  change?: number;
  installments?: ReceiptInstallment[];
}

const STORE_KEYS = {
  name: "app_vendas_store_name",
  cnpj: "app_vendas_store_cnpj",
  phone: "app_vendas_store_phone",
  address: "app_vendas_store_address",
  footer: "app_vendas_store_footer",
  paperWidth: "app_vendas_store_paper_width",
};

// Lê os dados da loja salvos no navegador (com padrões)
export function getStoreInfo(): StoreInfo {
  if (typeof window === "undefined") {
    return { name: "VendaFácil" };
  }
  return {
    name: localStorage.getItem(STORE_KEYS.name) || "VendaFácil",
    cnpj: localStorage.getItem(STORE_KEYS.cnpj) || "",
    phone: localStorage.getItem(STORE_KEYS.phone) || "",
    address: localStorage.getItem(STORE_KEYS.address) || "",
    footer:
      localStorage.getItem(STORE_KEYS.footer) ||
      "Obrigado pela preferência! Volte sempre.",
    paperWidth: localStorage.getItem(STORE_KEYS.paperWidth) || "80",
  };
}

export function saveStoreInfo(info: StoreInfo) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEYS.name, info.name || "");
  localStorage.setItem(STORE_KEYS.cnpj, info.cnpj || "");
  localStorage.setItem(STORE_KEYS.phone, info.phone || "");
  localStorage.setItem(STORE_KEYS.address, info.address || "");
  localStorage.setItem(STORE_KEYS.footer, info.footer || "");
  localStorage.setItem(STORE_KEYS.paperWidth, info.paperWidth || "80");
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("pt-BR");
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate + "T00:00:00");
  if (isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString("pt-BR");
}

// Monta o HTML completo do cupom
export function buildReceiptHtml(data: ReceiptData): string {
  const { store } = data;

  const itemsRows = data.items
    .map((item) => {
      const lineName = escapeHtml(item.name);
      const qtyLine = `${item.quantity} ${escapeHtml(item.unit)} x ${brl(
        item.unitPrice
      )}`;
      return `
        <div class="item">
          <div class="item-name">${lineName}</div>
          <div class="item-line">
            <span>${qtyLine}</span>
            <span>${brl(item.total)}</span>
          </div>
        </div>`;
    })
    .join("");

  const installmentsBlock =
    data.installments && data.installments.length > 0
      ? `
        <div class="divider"></div>
        <div class="section-title">PARCELAS (FIADO)</div>
        ${data.installments
          .map(
            (inst) => `
          <div class="row">
            <span>${inst.number}ª · venc. ${formatDueDate(inst.dueDate)}</span>
            <span>${brl(inst.amount)}</span>
          </div>`
          )
          .join("")}`
      : "";

  const cashBlock =
    data.cashReceived !== undefined
      ? `
        <div class="row"><span>Valor recebido</span><span>${brl(
          data.cashReceived
        )}</span></div>
        <div class="row"><span>Troco</span><span>${brl(
          data.change ?? 0
        )}</span></div>`
      : "";

  const storeMeta = [
    store.cnpj ? `CNPJ: ${escapeHtml(store.cnpj)}` : "",
    store.address ? escapeHtml(store.address) : "",
    store.phone ? `Tel: ${escapeHtml(store.phone)}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<div class="store-meta">${line}</div>`)
    .join("");

  const paperWidth = store.paperWidth === "58" ? 58 : 80;
  const contentPad = paperWidth === 58 ? 2 : 4;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo #${data.saleNumber}</title>
<style>
  @page { size: ${paperWidth}mm auto; margin: 0; }
  html, body { width: ${paperWidth}mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", Courier, monospace;
    width: ${paperWidth}mm;
    margin: 0;
    padding: 4mm ${contentPad}mm;
    color: #000;
    font-size: ${paperWidth === 58 ? 11 : 12}px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .store-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
  .store-meta { font-size: 11px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  .meta-row { display: flex; justify-content: space-between; }
  .section-title { font-weight: bold; font-size: 11px; margin: 4px 0 2px; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: bold; }
  .item-line { display: flex; justify-content: space-between; }
  .row { display: flex; justify-content: space-between; }
  .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin-top: 4px; }
  .footer { text-align: center; font-size: 11px; margin-top: 8px; }
  .muted { color: #333; }
</style>
</head>
<body>
  <div class="center">
    <div class="store-name">${escapeHtml(store.name)}</div>
    ${storeMeta}
  </div>

  <div class="divider"></div>

  <div class="meta">
    <div class="meta-row"><span>Cupom</span><span>#${data.saleNumber}</span></div>
    <div class="meta-row"><span>Data</span><span>${formatDateBR(
      data.date
    )}</span></div>
    <div class="meta-row"><span>Vendedor</span><span>${escapeHtml(
      data.seller
    )}</span></div>
    <div class="meta-row"><span>Cliente</span><span>${escapeHtml(
      data.customer || "Consumidor"
    )}</span></div>
  </div>

  <div class="divider"></div>
  <div class="section-title">ITENS</div>
  ${itemsRows}

  <div class="divider"></div>

  <div class="row"><span>Subtotal</span><span>${brl(data.subtotal)}</span></div>
  ${
    data.discount > 0
      ? `<div class="row"><span>Desconto</span><span>- ${brl(
          data.discount
        )}</span></div>`
      : ""
  }
  <div class="total-row"><span>TOTAL</span><span>${brl(data.total)}</span></div>

  <div class="divider"></div>
  <div class="row"><span>Pagamento</span><span>${escapeHtml(
    data.paymentMethodLabel
  )}</span></div>
  ${cashBlock}
  ${installmentsBlock}

  <div class="divider"></div>
  <div class="footer">${escapeHtml(store.footer || "")}</div>
  <div class="footer muted">Documento sem valor fiscal</div>
</body>
</html>`;
}

// Imprime o recibo usando um iframe oculto
export function printReceipt(data: ReceiptData) {
  if (typeof window === "undefined") return;
  const html = buildReceiptHtml(data);

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
      // Remove o iframe após a janela de impressão
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }
  };

  // Aguarda o conteúdo renderizar antes de imprimir
  if (iframe.contentWindow) {
    iframe.contentWindow.onload = triggerPrint;
  }
  // Fallback caso onload não dispare
  setTimeout(triggerPrint, 400);
}

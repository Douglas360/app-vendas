// ============================================================
// Gera uma "arte" de divulgação no formato Story (1080x1920)
// com a foto do produto, nome, preço e identidade da loja.
// ============================================================

export interface StoryOptions {
  storeName: string;
  phone?: string;
  productName: string;
  priceText: string; // ex: "R$ 59,90"
  imageUrl?: string | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Desenha a imagem cobrindo a área (object-fit: cover)
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
  } else {
    sw = img.width;
    sh = sw / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  // reticências na última linha se cortou
  return lines;
}

export async function generateStoryBlob(opts: StoryOptions): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fundo gradiente
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#4f46e5");
  bg.addColorStop(0.55, "#6d28d9");
  bg.addColorStop(1, "#7c3aed");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Círculos decorativos suaves
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(W - 80, 220, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(120, H - 200, 200, 0, Math.PI * 2);
  ctx.fill();

  // Nome da loja
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 54px Arial, sans-serif";
  ctx.fillText(opts.storeName.toUpperCase(), W / 2, 145, W - 120);

  // Pílula "OFERTA"
  ctx.font = "bold 30px Arial, sans-serif";
  const pillText = "✨ CONFIRA";
  const pillW = ctx.measureText(pillText).width + 56;
  const pillX = (W - pillW) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, pillX, 175, pillW, 56, 28);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(pillText, W / 2, 213);

  // Card branco
  const cardX = 70;
  const cardY = 280;
  const cardW = W - 140;
  const cardH = 1320;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fill();
  ctx.restore();

  // Área da imagem (quadrada)
  const pad = 48;
  const imgX = cardX + pad;
  const imgY = cardY + pad;
  const imgW = cardW - pad * 2;
  const imgH = imgW;

  ctx.save();
  roundRect(ctx, imgX, imgY, imgW, imgH, 32);
  ctx.clip();
  let drew = false;
  if (opts.imageUrl) {
    try {
      const img = await loadImage(opts.imageUrl);
      drawCover(ctx, img, imgX, imgY, imgW, imgH);
      drew = true;
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    const ph = ctx.createLinearGradient(imgX, imgY, imgX, imgY + imgH);
    ph.addColorStop(0, "#eef2ff");
    ph.addColorStop(1, "#e0e7ff");
    ctx.fillStyle = ph;
    ctx.fillRect(imgX, imgY, imgW, imgH);
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "bold 200px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.productName.charAt(0).toUpperCase(), imgX + imgW / 2, imgY + imgH / 2 + 70);
  }
  ctx.restore();

  // Nome do produto
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.font = "bold 58px Arial, sans-serif";
  const nameLines = wrapText(ctx, opts.productName, cardW - pad * 2, 2);
  let textY = imgY + imgH + 90;
  for (const ln of nameLines) {
    ctx.fillText(ln, W / 2, textY);
    textY += 70;
  }

  // Preço
  ctx.fillStyle = "#4f46e5";
  ctx.font = "bold 128px Arial, sans-serif";
  const priceY = nameLines.length > 1 ? textY + 110 : textY + 130;
  ctx.fillText(opts.priceText, W / 2, priceY);

  // Rodapé / CTA
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px Arial, sans-serif";
  ctx.fillText("📲 PEÇA PELO WHATSAPP", W / 2, cardY + cardH + 110);
  if (opts.phone) {
    ctx.font = "40px Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(opts.phone, W / 2, cardY + cardH + 168);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))),
      "image/jpeg",
      0.92
    );
  });
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    // remove acentos (faixa de marcas diacríticas combinantes)
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

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

export async function generateStoryBlob(opts: StoryOptions): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Imagem do produto cobrindo a tela toda
  let drew = false;
  if (opts.imageUrl) {
    try {
      const img = await loadImage(opts.imageUrl);
      drawCover(ctx, img, 0, 0, W, H);
      drew = true;
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    const ph = ctx.createLinearGradient(0, 0, 0, H);
    ph.addColorStop(0, "#1f2937");
    ph.addColorStop(1, "#111827");
    ctx.fillStyle = ph;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#4b5563";
    ctx.font = "bold 360px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.productName.charAt(0).toUpperCase(), W / 2, H / 2);
    ctx.textBaseline = "alphabetic";
  }

  // Degradê escuro no rodapé para dar legibilidade ao preço
  const scrim = ctx.createLinearGradient(0, H - 620, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - 620, W, 620);

  // Preço em destaque
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 180px Arial, sans-serif";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillText(opts.priceText, W / 2, H - 150, W - 100);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

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

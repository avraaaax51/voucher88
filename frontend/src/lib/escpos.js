import { DEFAULT_SETTINGS } from "../hooks/useStoreSettings";

// 203 dpi thermal: 8 px per mm. Printable width of TM-T82 = 72mm = 576 px.
const PX_PER_MM = 8;
const FONT = "Arial, Helvetica, sans-serif";

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const text = (ctx, str, x, y, size, weight = 700, color = "#000", align = "center", spacing = 0) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (spacing && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  ctx.restore();
};

export const formatExpiry = (iso) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();

// Draws one voucher onto a canvas of the given printable width (px). Returns the canvas.
export const renderVoucherCanvas = async (voucher, settings = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const W = Math.round(Number(s.print_width_mm) * PX_PER_MM);
  const scale = (Number(s.print_scale) || 100) / 100;
  const feed = Math.round(Number(s.print_feed_mm) * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 2400;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  const CW = W / scale; // content width in scaled units
  const pad = 26;
  const inner = CW - pad * 2;
  const cx = CW / 2;
  let y = 16;
  const cardTop = y;
  y += 40;

  text(ctx, s.store_prefix, cx, y, 40);
  y += 46;
  const m = s.store_name.trim().match(/^(.*?)\s*(\d+)$/);
  const nameText = m ? m[1] : s.store_name;
  const nameNum = m ? m[2] : "";
  ctx.font = `900 92px ${FONT}`;
  const w1 = ctx.measureText(nameText).width;
  ctx.font = `900 78px ${FONT}`;
  const w2 = nameNum ? ctx.measureText(nameNum).width + 8 : 0;
  const startX = cx - (w1 + w2) / 2;
  text(ctx, nameText, startX, y, 92, 900, "#000", "left");
  if (nameNum) text(ctx, nameNum, startX + w1 + 8, y + 12, 78, 900, "#000", "left");
  y += 104;

  // branch with side lines
  ctx.font = `900 28px ${FONT}`;
  const bw = ctx.measureText(s.store_branch).width + 40;
  ctx.fillStyle = "#000";
  ctx.fillRect(pad, y + 14, (inner - bw) / 2 - 12, 4);
  ctx.fillRect(cx + bw / 2 + 12, y + 14, (inner - bw) / 2 - 12, 4);
  text(ctx, s.store_branch, cx, y, 28, 900, "#000", "center", 4);
  y += 52;

  // ribbon banner with notched ends
  const bh = 72;
  const notch = 28;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(CW - pad, y);
  ctx.lineTo(CW - pad - notch * 0.6, y + bh / 2);
  ctx.lineTo(CW - pad, y + bh);
  ctx.lineTo(pad, y + bh);
  ctx.lineTo(pad + notch * 0.6, y + bh / 2);
  ctx.closePath();
  ctx.fill();
  text(ctx, "VOUCHER BELANJA", cx, y + 17, 40, 900, "#fff");
  y += bh + 24;

  ctx.fillStyle = "#000";
  ctx.fillRect(pad, y, inner, 4);
  y += 28;

  text(ctx, "NILAI VOUCHER", cx, y, 30, 700, "#000", "center", 2);
  y += 44;
  text(ctx, `Rp.${voucher.nominal.toLocaleString("id-ID")}`, cx, y, 100, 900);
  y += 130;

  // QR
  const qrSize = 320;
  if (voucher.qr_code) {
    try {
      const img = await loadImage(`data:image/png;base64,${voucher.qr_code}`);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cx - qrSize / 2, y, qrSize, qrSize);
    } catch {}
  }
  y += qrSize + 36;

  // promo banner
  const lines = (voucher.terms || `${s.promo_line1}\n${s.promo_line2}`).split("\n").filter(Boolean);
  const ph = 40 + lines.length * 38;
  ctx.fillStyle = "#000";
  roundRect(ctx, pad, y, inner, ph, 24);
  ctx.fill();
  let ty = y + 22;
  lines.forEach((ln, i) => {
    text(ctx, ln, cx, ty, i === 0 ? 34 : 26, 900, "#fff");
    ty += i === 0 ? 42 : 34;
  });
  y += ph + 24;

  // expiry box
  const eh = 96;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  roundRect(ctx, pad, y, inner, eh, 20);
  ctx.stroke();
  const iconW = 110;
  ctx.beginPath();
  ctx.moveTo(pad + iconW, y);
  ctx.lineTo(pad + iconW, y + eh);
  ctx.stroke();
  // calendar icon
  const ix = pad + iconW / 2 - 28, iy = y + eh / 2 - 26;
  ctx.lineWidth = 5;
  roundRect(ctx, ix, iy + 8, 56, 48, 6);
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.fillRect(ix, iy + 20, 56, 5);
  ctx.fillRect(ix + 12, iy, 5, 16);
  ctx.fillRect(ix + 39, iy, 5, 16);
  [0, 1, 2].forEach((i) => ctx.fillRect(ix + 10 + i * 16, iy + 32, 7, 7));
  [0, 1].forEach((i) => ctx.fillRect(ix + 10 + i * 16, iy + 44, 7, 7));
  text(ctx, "BERLAKU SAMPAI", pad + iconW + 22, y + 18, 24, 700, "#000", "left");
  text(ctx, formatExpiry(voucher.expires_at), pad + iconW + 22, y + 48, 34, 900, "#000", "left");
  y += eh + 30;

  // card border
  ctx.lineWidth = 3;
  roundRect(ctx, 8, cardTop, CW - 16, y - cardTop, 20);
  ctx.stroke();
  y += 10;

  // crop to used height
  const usedH = Math.ceil(y * scale) + feed;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = usedH;
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, W, usedH);
  octx.drawImage(canvas, 0, 0);
  return out;
};

// Converts canvas to ESC/POS raster (GS v 0) chunks, 1-bit threshold.
export const canvasToRaster = (canvas) => {
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const chunks = [];
  const CHUNK = 240;
  for (let y0 = 0; y0 < height; y0 += CHUNK) {
    const rows = Math.min(CHUNK, height - y0);
    const buf = new Uint8Array(8 + bytesPerRow * rows);
    buf.set([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8]);
    let p = 8;
    for (let y = y0; y < y0 + rows; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width) {
            const i = (y * width + x) * 4;
            const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            if (data[i + 3] > 128 && lum < 140) b |= 0x80 >> bit;
          }
        }
        buf[p++] = b;
      }
    }
    chunks.push(buf);
  }
  return chunks;
};

const concat = (arrays) => {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  arrays.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
};

const INIT = new Uint8Array([0x1b, 0x40]);
const ALIGN_CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
const ALIGN_LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
const FEED_CUT = new Uint8Array([0x1b, 0x64, 0x02, 0x1d, 0x56, 0x42, 0x00]); // feed 2 lines + partial cut

// Builds a full ESC/POS job: each voucher is rasterised and followed by a paper cut.
export const buildEscPosJob = async (vouchers, settings = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const paperPx = Math.round(Number(s.print_paper_mm) * PX_PER_MM);
  const parts = [INIT];
  for (const v of vouchers) {
    const canvas = await renderVoucherCanvas(v, s);
    // horizontal position: (paper - width)/2 + offset, relative to 72mm printable start
    const printableStart = Math.round(((Number(s.print_paper_mm) - 72) / 2) * PX_PER_MM);
    const leftPx = Math.max(0, Math.round(((Number(s.print_paper_mm) - Number(s.print_width_mm)) / 2 + Number(s.print_offset_mm || 0)) * PX_PER_MM) - printableStart);
    const printableW = Math.min(576, paperPx);
    const composed = document.createElement("canvas");
    composed.width = printableW;
    composed.height = canvas.height;
    const c = composed.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, composed.width, composed.height);
    c.drawImage(canvas, Math.min(leftPx, Math.max(0, printableW - canvas.width)), 0);
    parts.push(ALIGN_LEFT, ...canvasToRaster(composed), FEED_CUT);
  }
  parts.push(ALIGN_CENTER);
  return concat(parts);
};

const toBase64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const agentStatus = async (url) => {
  const res = await fetch(`${url.replace(/\/$/, "")}/status`, { method: "GET", targetAddressSpace: "loopback" });
  if (!res.ok) throw new Error("Agen tidak merespons");
  return res.json();
};

export const sendToAgent = async (url, bytes, printerName = "") => {
  const res = await fetch(`${url.replace(/\/$/, "")}/print`, {
    method: "POST",
    targetAddressSpace: "loopback",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: toBase64(bytes), printer: printerName || undefined }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || "Agen cetak gagal mencetak");
  return body;
};

export const printVouchersDirect = async (vouchers, settings) => {
  const bytes = await buildEscPosJob(vouchers, settings);
  return sendToAgent(settings.print_agent_url || DEFAULT_SETTINGS.print_agent_url, bytes, settings.print_printer_name);
};

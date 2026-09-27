// توليد صورة البطاقة (PNG) للتحميل والمشاركة
import { qrDataUrl } from './qr.js';

const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
  });
  return imgCache[src];
}

// يحوّل محتوى البطاقة (HTML) إلى مقاطع مصنّفة: n نص، v آية، r مرجع، br فاصل فقرات
export function segmentsFromHtml(html) {
  const box = document.createElement('div'); box.innerHTML = html;
  const ps = Array.from(box.querySelectorAll('p'));
  const segs = [];
  ps.forEach((p, i) => {
    if (i) segs.push({ t: 'br', s: '' });
    p.childNodes.forEach(ch => {
      const s = ch.textContent; if (!s || !s.trim()) return;
      const t = ch.nodeType === 1 && ch.classList.contains('q') ? 'v' : (ch.nodeType === 1 && ch.classList.contains('ref') ? 'r' : 'n');
      segs.push({ t, s });
    });
  });
  const text = ps.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
  return { segs, text };
}

export async function renderCard({ title, segs, url, logoSrc }) {
  try { await document.fonts.ready; } catch (e) {}
  const W = 1080, pad = 120, maxW = W - pad * 2;
  const meas = document.createElement('canvas').getContext('2d');
  const titleFont = '700 64px "Thmanyah Serif Display", Amiri, serif';
  const styles = {
    n: { font: '400 38px "Thmanyah Sans", sans-serif', color: '#2b3240' },
    v: { font: '400 42px Amiri, serif', color: '#3f7257' },
    r: { font: '400 30px "Thmanyah Sans", sans-serif', color: '#8c93a1' },
  };
  const wrap = (str, font) => {
    meas.font = font; const out = []; let line = '';
    for (const w of str.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (meas.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line); return out;
  };
  const tLines = wrap(title, titleFont);
  const words = [];
  segs.forEach(g => {
    if (g.t === 'br') { words.push({ w: '', t: 'br' }); return; }
    g.s.split(/\s+/).filter(Boolean).forEach(w => words.push({ w, t: g.t }));
  });
  const bLines = []; let line = [], lw = 0;
  for (const it of words) {
    if (it.t === 'br') { if (line.length) bLines.push(line); bLines.push([]); line = []; lw = 0; continue; }
    meas.font = styles[it.t].font;
    const ww = meas.measureText(it.w).width, sw = line.length ? meas.measureText(' ').width : 0;
    if (lw + sw + ww > maxW && line.length) { bLines.push(line); line = [{ ...it, ww }]; lw = ww; }
    else { line.push({ ...it, ww, sw }); lw += sw + ww; }
  }
  if (line.length) bLines.push(line);

  const tLH = 96, bLH = 84, gaps = bLines.filter(l => !l.length).length;
  const contentH = tLines.length * tLH + 86 + (bLines.length - gaps) * bLH + gaps * bLH * .35;
  const footH = 240, H = Math.max(1080, contentH + 130 + footH);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6efe1'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#b99d59'; ctx.lineWidth = 2; ctx.strokeRect(52, 52, W - 104, H - 104);
  ctx.strokeStyle = 'rgba(185,157,89,.4)'; ctx.strokeRect(68, 68, W - 136, H - 136);
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let y = 110 + (H - footH - 110 - contentH) / 2 + tLH / 2;
  ctx.fillStyle = '#1d2531'; ctx.font = titleFont;
  for (const l of tLines) { ctx.fillText(l, W / 2, y); y += tLH; }
  y += 8; ctx.fillStyle = '#b99d59'; ctx.beginPath(); ctx.roundRect(W / 2 - 120, y - 2, 240, 4, 2); ctx.fill(); y += 78;
  for (const ln of bLines) {
    if (!ln.length) { y += bLH * .35; continue; }
    const total = ln.reduce((a, it) => a + it.ww + (it.sw || 0), 0);
    let x = W / 2 + total / 2; ctx.textAlign = 'right';
    for (const it of ln) {
      ctx.font = styles[it.t].font; ctx.fillStyle = styles[it.t].color;
      ctx.fillText(it.w, x, y);
      meas.font = styles[it.t].font; x -= it.ww + meas.measureText(' ').width;
    }
    y += bLH;
  }
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(185,157,89,.35)'; ctx.beginPath(); ctx.moveTo(112, H - 212); ctx.lineTo(W - 112, H - 212); ctx.stroke();
  const [logo, qr] = await Promise.all([loadImg(logoSrc), loadImg(qrDataUrl(url, 8, 2))]);
  if (logo) { const lh = 84, lw2 = logo.width * lh / logo.height; ctx.drawImage(logo, W - 112 - lw2, H - 198 + (100 - lh) / 2, lw2, lh); }
  if (qr) { const q = 104, qy = H - 198 + (100 - q) / 2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(112, qy, q, q, 8); ctx.fill(); ctx.drawImage(qr, 118, qy + 6, q - 12, q - 12); }
  const dataUrl = c.toDataURL('image/png');
  const file = await new Promise(res => c.toBlob(b => res(b ? new File([b], (title || 'رسالة') + '.png', { type: 'image/png' }) : null), 'image/png'));
  return { dataUrl, file };
}

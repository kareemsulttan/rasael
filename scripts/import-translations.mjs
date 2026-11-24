// استيراد ترجمات الرسائل من ملفات Excel (تصدير «بطاقات») إلى js/i18n/<code>.js
//
//   node scripts/import-translations.mjs "<مجلد ملفات xlsx>" <code>
//   مثال: node scripts/import-translations.mjs "D:/ترجمات الرسائل" fr
//
// كل ملف لفئة واحدة (يُعرف من اسمه) وفيه أعمدة: card_name، phrase (العربي)، trans_<code>.
// اسم البطاقة يحدد الحجم والرقم: «1.» مختصرة، «01.» متوسطة، «001.» مطولة.
// يبني الأداة HTML الرسالة بنفس بنية العربية: <p> للفقرات، <span class="q"> للآية، <span class="ref"> للمرجع،
// ويصلح تلقائيًا: أرقام العناوين، أقواس الآيات {…}، وتوحيد شكل المراجع [السورة، رقمها : الآيات].
// لا يُعدَّل نص الترجمة نفسه.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [dirArg, code] = process.argv.slice(2);
if (!dirArg || !code) { console.error('الاستخدام: node scripts/import-translations.mjs <مجلد> <رمز اللغة>'); process.exit(1); }

const { MESSAGES } = await import(pathToFileURL(path.join(ROOT, 'js/data.js')).href);
const SETS = { 'الأديان الأخرى': 'general', 'الملحدين': 'atheist', 'اللادينيين': 'deist', 'النصارى': 'christian', 'الهندوس': 'hindu' };
const SIZES = ['short', 'medium', 'long'];
const LANG_NAMES = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', ru: 'Русский' };

/* ---------- قراءة xlsx بلا مكتبات: zip + XML ---------- */
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22; while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('ليس ملف zip');
  let p = buf.readUInt32LE(eocd + 16); const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const data0 = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(data0, data0 + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
const xmlText = s => s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
function readSheet(file) {
  const z = unzip(fs.readFileSync(file));
  const shared = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText(m[1])) : [];
  const sheetName = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const rows = [];
  for (const r of z[sheetName].toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1]; const t = (c[1].match(/t="(\w+)"/) || [])[1];
      const col = [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const inner = c[2] || ''; const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      row[col] = t === 's' ? shared[+v] : t === 'inlineStr' ? xmlText(inner) : v != null ? xmlText(v) : '';
    }
    rows.push(row.map(x => x ?? ''));
  }
  return rows;
}

/* ---------- أدوات النص ---------- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = s => String(s).replace(/\s+/g, ' ').trim();
const isRef = ar => /^\s*\[[^\]]*\d[^\]]*\]\s*\.?\s*$/.test(ar);
// كلمات النثر العربي للمطابقة بفقرات ملفنا (بلا تشكيل ولا آيات ولا مراجع)
const words = s => s.normalize('NFC').replace(/﴿[^﴾]*﴾/g, ' ').replace(/\[[^\]]*\d[^\]]*\]/g, ' ')
  .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u061C]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
// المرجع بشكل واحد: [السورة، رقمها : الآيات] أو [السورة : الآيات]
function normRef(tr) {
  let s = clean(tr).replace(/\.\s*$/, '').replace(/^[[(]\s*/, '').replace(/\s*[\])]$/, '').trim()
    .replace(/^Sourate\s*:?\s*/i, '').replace(/\[([^\]]*)\]/g, '($1)').replace(/(\d)\s+à\s+(\d)/g, '$1-$2');
  const slash = s.match(/^(.*?)\s*:\s*(\d+)\s*\/\s*(\d+(?:\s*[-–]\s*\d+)?)$/);   // «السورة : 9/34»
  if (slash) s = `${slash[1]}, ${slash[2]} : ${slash[3]}`;
  const m = s.match(/^(.*?)[,،]?\s+(\d+)\s*:\s*(\d+(?:\s*[-–]\s*\d+)?)$/) || s.match(/^(.*?)\s*:\s*(\d+(?:\s*[-–]\s*\d+)?)$/);
  if (!m) return { text: `[${s}]`, ok: false };
  const ayat = (m[3] ?? m[2]).replace(/\s*[-–]\s*/, '-');
  const name = m[1].replace(/[,،:\s]+$/, '').trim();
  return { text: m[3] ? `[${name}, ${m[2]} : ${ayat}]` : `[${name} : ${ayat}]`, ok: true };
}

/* ---------- بناء الرسالة ---------- */
const warnings = [];
function buildMessage(rows, ourHtml, label) {
  // فقرات ملفنا: كلمات كل فقرة لنعرف أين تبدأ فقرة جديدة في الترجمة
  const paras = [...ourHtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<span class="(q|ref)">[\s\S]*?<\/span>/g, ' ').replace(/<[^>]+>/g, ' '));
  const stream = []; paras.forEach((p, i) => words(p).forEach(w => stream.push({ w, i })));
  // فقرة كل آية في ملفنا بالترتيب، فالآية التي تبدأ فقرة في العربي تبدأ فقرة في الترجمة
  const versePara = [];
  [...ourHtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].forEach((m, i) => (m[1].match(/<span class="q">/g) || []).forEach(() => versePara.push(i)));
  let ptr = 0, curPara = 0, verseNo = 0;
  const locate = ar => {
    const ws = words(ar); if (!ws.length) return curPara;
    for (let k = Math.min(3, ws.length); k >= 1; k--) {
      for (let j = ptr; j <= stream.length - k && j < ptr + 60; j++) {
        if (ws.slice(0, k).every((w, x) => stream[j + x].w === w)) { ptr = j + Math.max(1, ws.length - 2); return stream[j].i; }
      }
    }
    return curPara;
  };
  const out = []; let html = [];
  const push = s => html.push(s);
  const flush = () => { if (html.length) out.push(`<p>${html.join(' ').replace(/\s+([.,;:!?])(?=\s|$)/g, (m, c) => (/[;:!?]/.test(c) ? ' ' : '') + c)}</p>`); html = []; };
  let verse = null;
  for (const r of rows) {
    const ar = clean(r.ar), tr = clean(r.tr);
    if (verse || ar.startsWith('﴿')) {          // الآية قد تمتد على أكثر من صف
      if (!verse) {
        const p = versePara[verseNo++] ?? curPara;
        if (p > curPara && html.length) flush();
        curPara = Math.max(curPara, p);
      }
      verse = verse || [];
      verse.push(tr.replace(/[{}]/g, '').trim());
      if (ar.includes('﴾')) { push(`<span class="q">{${esc(verse.join(' ').replace(/\s+/g, ' ').trim())}}</span>`); verse = null; }
      continue;
    }
    if (isRef(ar)) {
      const { text, ok } = normRef(tr);
      if (!ok) warnings.push(`${label}: مرجع بشكل غير معتاد «${tr}»`);
      push(`<span class="ref">${esc(text)}</span>${/\.\s*$/.test(tr) ? '.' : ''}`);
      continue;
    }
    if (ar.includes('﴿')) warnings.push(`${label}: صف يجمع نثرًا وآية «${ar.slice(0, 40)}…»`);
    const p = locate(ar);
    if (p > curPara && html.length) flush();
    curPara = Math.max(curPara, p);
    push(esc(tr));
  }
  if (verse) { warnings.push(`${label}: آية بلا قوس إغلاق في العربي`); push(`<span class="q">{${esc(verse.join(' '))}}</span>`); }
  flush();
  return out.join('');
}

/* ---------- التشغيل ---------- */
const result = {}; const filesUsed = [];
for (const f of fs.readdirSync(dirArg).filter(f => f.endsWith(`- ${code}.xlsx`)).sort()) {
  const set = Object.entries(SETS).find(([k]) => f.includes(k))?.[1];
  if (!set) { warnings.push(`ملف لم تُعرف فئته: ${f}`); continue; }
  const rows = readSheet(path.join(dirArg, f)); const hdr = rows[0];
  const ci = n => hdr.indexOf(n), name = ci('card_name'), ar = ci('phrase'), tr = ci(`trans_${code}`);
  if (name < 0 || ar < 0 || tr < 0) { warnings.push(`أعمدة ناقصة في ${f}`); continue; }
  filesUsed.push(f);
  const cards = new Map();
  for (const r of rows.slice(1)) { if (!r[name]) continue; const k = clean(r[name]); if (!cards.has(k)) cards.set(k, []); cards.get(k).push({ ar: r[ar], tr: r[tr] }); }
  result[set] = MESSAGES[set].map(() => ({}));
  for (const [cardName, rs] of cards) {
    const m = cardName.match(/^(0*)(\d+)\.\s*(.*)$/);
    if (!m) { warnings.push(`${f}: اسم بطاقة غير مفهوم «${cardName}»`); continue; }
    const size = SIZES[m[1].length], idx = +m[2] - 1, ours = MESSAGES[set][idx];
    if (!size || !ours) { warnings.push(`${f}: بطاقة لا تقابل رسالة عندنا «${cardName}»`); continue; }
    const label = `${set} ${idx + 1} [${size}]`;
    const title = clean(rs[0].tr).replace(/^\d+\s*[.\-–]\s*/, '').replace(/(?<![.])\.$/, '').trim();
    // قد يختلف العنوان قليلًا بين بطاقات الأحجام؛ يُعتمد عنوان المتوسطة، وإلا أول ما يوجد
    if (!result[set][idx].title || size === 'medium') result[set][idx].title = title;
    result[set][idx][size] = buildMessage(rs.slice(1), ours[size], label);
  }
}

// التحقق: كل رسالة لها عنوان وثلاثة أحجام، وعدد الآيات والمراجع كالعربية
const report = [];
for (const [set, list] of Object.entries(result)) {
  list.forEach((m, i) => {
    const miss = ['title', ...SIZES].filter(k => !m[k]);
    if (miss.length) report.push(`${set} ${i + 1}: ناقص ${miss.join('، ')}`);
    for (const s of SIZES) {
      if (!m[s]) continue;
      const cnt = (h, c) => (h.match(new RegExp(`class="${c}"`, 'g')) || []).length;
      const a = MESSAGES[set][i][s];
      if (cnt(a, 'ref') !== cnt(m[s], 'ref')) report.push(`${set} ${i + 1} [${s}]: المراجع ${cnt(m[s], 'ref')} مقابل ${cnt(a, 'ref')} في العربي`);
    }
  });
}
const missingSets = Object.values(SETS).filter(s => !result[s]);

const out = path.join(ROOT, 'js/i18n', `${code}.js`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
  `// ترجمة الرسائل (${LANG_NAMES[code] || code}) — مولَّد بالأداة scripts/import-translations.mjs، لا تعدّله يدويًا.\n` +
  `// المصدر: ${filesUsed.join(' · ')}\n` +
  `export default ${JSON.stringify({ code, dir: 'ltr', messages: result }, null, 2)};\n`);

console.log(`كُتب ${path.relative(ROOT, out)}`);
for (const [set, list] of Object.entries(result)) console.log(`  ${set}: ${list.filter(m => SIZES.every(s => m[s])).length}/${list.length} رسالة كاملة`);
if (missingSets.length) console.log(`  فئات بلا ملف (تظهر بالعربية): ${missingSets.join('، ')}`);
console.log(`\nتنبيهات (${warnings.length}):`); warnings.forEach(w => console.log('  - ' + w));
console.log(`\nالتحقق (${report.length}):`); report.forEach(w => console.log('  - ' + w));

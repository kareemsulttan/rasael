// صفحة الإحصاءات للمشرفين: تقرأ الأرقام المجمّعة من Supabase (admin_stats / admin_users / admin_feedback).
// الحماية الفعلية في قاعدة البيانات: الدوال ترفض أي حساب ليس مشرفًا.
import { RELIGIONS, MESSAGES, SIZES, LANGS, COUNTRIES } from './data.js';
import * as auth from './auth.js';

/* ---------- أدوات صغيرة ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
// إنشاء عنصر؛ النصوص تُضاف كنصوص لا كـ HTML (أسماء المشتركين مدخلات خارجية)
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? n.className = v : n.setAttribute(k, v);
  n.append(...kids.filter(k => k != null && k !== false));
  return n;
}
const fmt = n => Number(n || 0).toLocaleString('en-US');
const LOCALE = 'ar-u-nu-latn-ca-gregory';
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = s => s ? dateFmt.format(new Date(s)) : '—';
let regionNames; try { regionNames = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch {}
const countryName = c => !c || c === '—' ? 'غير محددة' : COUNTRIES.NAMES[c] || regionNames?.of(c) || c;

const LABELS = {
  rel: k => RELIGIONS.find(r => r.key === k)?.name || k,
  size: k => SIZES.find(s => s.key === k)?.label || k,
  device: k => ({ mobile: 'جوال', desktop: 'حاسوب' })[k] || k,
  channel: k => ({ wa: 'واتساب', tw: 'إكس', tg: 'تيليجرام', fb: 'فيسبوك', copy: 'نسخ النص', download: 'تحميل البطاقة' })[k] || k,
  lang: k => LANGS.find(l => l[1] === k)?.[0] || k,
  countries: countryName,
};

/* ---------- الحالة ---------- */
let days = 30, stats = null, users = [], feedback = [], relTab = RELIGIONS[0].key;
try { if (localStorage.getItem('om-pref-dark') === '1') document.body.dataset.theme = 'dark'; } catch {}

function gate(text, linkText) {
  $('#adm-body').hidden = true;
  $('#adm-gate').hidden = false;
  $('#adm-gate').replaceChildren(text, ...(linkText ? [h('br'), h('a', { href: './' }, linkText)] : []));
}

/* ---------- الأرقام الرئيسية ---------- */
function renderKpis() {
  const t = stats.totals, u = stats.users;
  const tiles = [
    ['الزوار', t.visitors, 'أشخاص مختلفون', true],
    ['الزيارات', t.visits, 'مرات فتح الموقع'],
    ['بدء الرسائل', t.starts, 'ضغطات «ابدأ»'],
    ['الرسائل المقروءة', t.views, 'مرات ظهور رسالة'],
    ['المشاركة والنسخ والتحميل', t.shares, `ملاحظات مرسلة: ${fmt(t.feedback)}`],
    ['المشتركون', u.total, `جدد في المدة: ${fmt(u.new)}`],
  ];
  $('#adm-kpis').replaceChildren(...tiles.map(([label, value, note, hero]) =>
    h('div', { class: 'adm-kpi' + (hero ? ' adm-kpi--hero' : '') },
      h('div', { class: 'adm-kpi__label' }, label), h('div', { class: 'adm-kpi__value' }, fmt(value)), h('div', { class: 'adm-kpi__note' }, note))));
}

/* ---------- الرسم اليومي ---------- */
const isoDay = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const todayRiyadh = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());

// يملأ الأيام الخالية بأصفار؛ المدد الأطول من 92 يومًا تُجمع شهريًا
function series() {
  const map = new Map(stats.daily.map(d => [d.day, d]));
  const end = todayRiyadh(), first = days ? addDays(end, -days) : (stats.daily[0]?.day || end);
  const pts = [];
  for (let d = first; d <= end; d = addDays(d, 1)) {
    const v = map.get(d); pts.push({ key: d, visitors: v?.visitors || 0, views: v?.views || 0 });
  }
  if (pts.length <= 92) return pts.map(p => ({ ...p, label: dayFmt.format(new Date(p.key + 'T00:00:00Z')) }));
  const months = new Map();
  for (const p of pts) {
    const k = p.key.slice(0, 7), m = months.get(k) || { key: k, visitors: 0, views: 0, label: monthFmt.format(new Date(k + '-01T00:00:00Z')) };
    m.visitors += p.visitors; m.views += p.views; months.set(k, m);   // مجموع زوار الأيام
  }
  return [...months.values()];
}
function niceTicks(max) {
  const raw = Math.max(1, max) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw));
  const top = Math.ceil(Math.max(1, max) / step) * step;
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

let chart = null;
function renderDaily() {
  const box = $('#adm-daily'), pts = series();
  renderDailyTable(pts);
  if (!pts.some(p => p.visitors)) { chart = null; box.removeAttribute('tabindex'); return box.replaceChildren(h('p', { class: 'adm-empty' }, 'لا توجد زيارات في هذه المدة.')); }
  const W = Math.max(300, box.clientWidth), H = 220, padL = 40, padR = 6, padT = 10, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  const slot = plotW / pts.length, bw = Math.max(2, Math.min(24, slot - 2));
  const { top, ticks } = niceTicks(Math.max(...pts.map(p => p.visitors)));
  const y = v => base - v / top * plotH;
  const every = Math.ceil(pts.length / Math.max(1, Math.floor(plotW / 64)));

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="الزوار في كل يوم">`;
  for (const t of ticks) svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
  pts.forEach((p, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    if (p.visitors) {
      const yt = y(p.visitors), r = Math.min(4, bw / 2, base - yt);   // طرف علوي مستدير، وقاعدة مستقيمة
      svg += `<path class="col" data-i="${i}" d="M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z"/>`;
    }
    if (i % every === 0) svg += `<text class="tick" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${p.label}</text>`;
  });
  svg += '</svg>';
  box.innerHTML = svg;   // أرقام وتواريخ فقط
  box.tabIndex = 0;
  box.setAttribute('aria-label', 'الزوار يوميًا. استخدم الأسهم للتنقل بين الأيام');
  chart = { pts, padL, slot, W, H, padT, plotH, base, y, bw, idx: -1 };
}
function showPoint(i) {
  const tip = $('#adm-tip'), svg = $('#adm-daily svg');
  if (!chart || !svg || i < 0 || i >= chart.pts.length) { tip.hidden = true; $$('#adm-daily .col.is-on').forEach(c => c.classList.remove('is-on')); return; }
  chart.idx = i;
  const p = chart.pts[i];
  $$('#adm-daily .col').forEach(c => c.classList.toggle('is-on', +c.dataset.i === i));
  tip.replaceChildren(h('strong', {}, `${fmt(p.visitors)} زائر`), `${fmt(p.views)} قراءة · ${p.label}`);
  tip.hidden = false;
  const r = svg.getBoundingClientRect(), k = r.width / chart.W;
  const cx = r.left + (chart.padL + i * chart.slot + chart.slot / 2) * k, cy = r.top + chart.y(p.visitors) * k;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - tw - 8, Math.max(8, cx - tw / 2)) + 'px';
  tip.style.top = Math.max(8, cy - th - 10) + 'px';
}
const daily = $('#adm-daily');
daily.addEventListener('pointermove', e => {
  if (!chart) return;
  const r = daily.querySelector('svg').getBoundingClientRect(), x = (e.clientX - r.left) * chart.W / r.width;
  showPoint(Math.floor((x - chart.padL) / chart.slot));
});
daily.addEventListener('pointerleave', () => showPoint(-1));
daily.addEventListener('blur', () => showPoint(-1));
daily.addEventListener('keydown', e => {
  if (!chart) return;
  const d = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[e.key];
  if (e.key === 'Escape') return showPoint(-1);
  if (d === undefined) return;
  e.preventDefault();
  showPoint(Math.max(0, Math.min(chart.pts.length - 1, (chart.idx < 0 ? (d > 0 ? -1 : chart.pts.length) : chart.idx) + d)));
});
function renderDailyTable(pts) {
  const rows = pts.filter(p => p.visitors || p.views).reverse();
  $('#adm-daily-table').replaceChildren(rows.length ? h('table', { class: 'adm-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'التاريخ'), h('th', {}, 'الزوار'), h('th', {}, 'القراءات'))),
    h('tbody', {}, ...rows.map(p => h('tr', {}, h('td', {}, p.label), h('td', { class: 'num' }, fmt(p.visitors)), h('td', { class: 'num' }, fmt(p.views)))))) : '');
}

/* ---------- التوزيعات ---------- */
function renderBars(id, obj, label) {
  let rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return $('#' + id).replaceChildren(h('p', { class: 'adm-empty' }, 'لا توجد بيانات في هذه المدة.'));
  if (rows.length > 8) rows = [...rows.slice(0, 7), ['', rows.slice(7).reduce((s, r) => s + r[1], 0)]];   // الباقي في «أخرى»
  const max = Math.max(...rows.map(r => r[1])), total = rows.reduce((s, r) => s + r[1], 0);
  $('#' + id).replaceChildren(h('div', { class: 'adm-bars' }, ...rows.flatMap(([k, n]) => {
    const name = k === '' ? 'أخرى' : label(k);
    return [
      h('div', { class: 'adm-bars__label', title: name }, name),
      h('div', { class: 'adm-bars__row' },
        h('div', { class: 'adm-bars__fill', style: `width:${(n / max) * 72}%` }),
        h('div', { class: 'adm-bars__val' }, fmt(n), h('span', {}, ` · ${Math.round(n / total * 100)}%`))),
    ];
  })));
}

/* ---------- الرسائل ---------- */
function renderMessages() {
  $('#adm-rel-tabs').replaceChildren(...RELIGIONS.map(r =>
    h('button', { class: 'adm-tab', role: 'tab', 'aria-selected': r.key === relTab, 'data-rel': r.key }, r.name)));
  const list = MESSAGES[RELIGIONS.find(r => r.key === relTab).set] || [];
  const byMsg = new Map(stats.messages.filter(m => m.rel === relTab).map(m => [m.msg, m]));
  const n = Math.max(list.length, 0, ...byMsg.keys());
  const rows = Array.from({ length: n }, (_, i) => {
    const m = byMsg.get(i + 1) || {};
    return { num: i + 1, title: list[i]?.title || m.title || '—', readers: m.readers || 0, views: m.views || 0, shares: m.shares || 0 };
  });
  const max = Math.max(1, ...rows.map(r => r.readers));
  $('#adm-messages').replaceChildren(
    h('thead', {}, h('tr', {}, ...['#', 'الرسالة', 'القرّاء', 'المشاهدات', 'المشاركات'].map(t => h('th', {}, t)))),
    h('tbody', {}, ...rows.map(r => h('tr', {},
      h('td', { class: 'num muted' }, r.num),
      h('td', {}, r.title),
      h('td', {}, h('div', { class: 'adm-reach' }, h('div', { class: 'adm-bars__fill', style: `width:${r.readers / max * 100}%` }), h('span', { class: 'num' }, fmt(r.readers)))),
      h('td', { class: 'num' }, fmt(r.views)),
      h('td', { class: 'num' }, fmt(r.shares))))));
}
$('#adm-rel-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-rel]'); if (!b) return;
  relTab = b.dataset.rel; renderMessages();
});

/* ---------- المشتركون ---------- */
function renderUsers() {
  const q = $('#adm-search').value.trim().toLowerCase();
  const rows = users.filter(u => !q || [u.full_name, u.email, countryName(u.country)].some(v => (v || '').toLowerCase().includes(q)));
  $('#adm-users-count').textContent = `(${fmt(users.length)})`;
  $('#adm-users').replaceChildren(
    h('thead', {}, h('tr', {}, ...['الاسم', 'البريد', 'الدولة', 'تاريخ الاشتراك', 'آخر دخول', 'النشاط'].map(t => h('th', {}, t)))),
    h('tbody', {}, ...(rows.length ? rows.map(u => h('tr', {},
      h('td', {}, u.full_name || '—', u.is_admin && h('span', { class: 'adm-tag adm-tag--gold' }, 'مشرف'), !u.confirmed && h('span', { class: 'adm-tag' }, 'غير مؤكَّد')),
      h('td', { class: 'ltr' }, u.email),
      h('td', {}, countryName(u.country)),
      h('td', { class: 'num' }, fmtDate(u.created_at)),
      h('td', { class: 'num muted' }, fmtDate(u.last_sign_in_at)),
      h('td', { class: 'num' }, fmt(u.activity))))
    : [h('tr', {}, h('td', { colspan: 6, class: 'muted' }, users.length ? 'لا نتائج مطابقة.' : 'لا يوجد مشتركون بعد.'))])));
}
$('#adm-search').addEventListener('input', renderUsers);

// ملف CSV يفتح بالعربية في Excel؛ وتُعطَّل الصيغ في الخانات التي يكتبها المستخدمون
function exportCsv(name, cols, rows) {
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = '\ufeff' + [cols.map(c => cell(c[0])), ...rows.map(u => cols.map(c => cell(c[1](u))))].map(r => r.join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `${name}-${todayRiyadh()}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#adm-csv').addEventListener('click', () => exportCsv('المشتركون', [
  ['الاسم', u => u.full_name], ['البريد', u => u.email], ['الدولة', u => countryName(u.country)],
  ['تاريخ الاشتراك', u => u.created_at?.slice(0, 10)], ['آخر دخول', u => u.last_sign_in_at?.slice(0, 10)],
  ['البريد مؤكَّد', u => u.confirmed ? 'نعم' : 'لا'], ['النشاط', u => u.activity], ['مشرف', u => u.is_admin ? 'نعم' : 'لا'],
], users));

/* ---------- الملاحظات ---------- */
const fbAbout = f => f.msg ? `${LABELS.rel(f.rel)} · ${f.msg}. ${f.title || ''}` : '—';
function renderFeedback() {
  const q = $('#adm-fb-search').value.trim().toLowerCase();
  const rows = feedback.filter(f => !q || [f.body, f.name, f.email, f.title].some(v => (v || '').toLowerCase().includes(q)));
  $('#adm-fb-count').textContent = `(${fmt(feedback.length)})`;
  $('#adm-feedback').replaceChildren(
    h('thead', {}, h('tr', {}, ...['التاريخ', 'الملاحظة', 'المرسل', 'حول رسالة', ''].map(t => h('th', {}, t)))),
    h('tbody', {}, ...(rows.length ? rows.map(f => h('tr', {},
      h('td', { class: 'num muted' }, fmtDate(f.created_at)),
      h('td', { class: 'adm-fb__body' }, f.body),
      h('td', {}, f.name || '—', f.is_user && h('span', { class: 'adm-tag adm-tag--gold' }, 'مشترك'),
        f.email && h('div', { class: 'ltr muted' }, h('a', { href: 'mailto:' + f.email }, f.email))),
      h('td', { class: 'muted' }, fbAbout(f)),
      h('td', {}, h('button', { class: 'adm-del', 'data-del': f.id, 'aria-label': 'حذف الملاحظة', title: 'حذف' }, '×'))))
    : [h('tr', {}, h('td', { colspan: 5, class: 'muted' }, feedback.length ? 'لا نتائج مطابقة.' : 'لا توجد ملاحظات بعد.'))])));
}
$('#adm-fb-search').addEventListener('input', renderFeedback);
$('#adm-feedback').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  if (!confirm('حذف هذه الملاحظة نهائيًا؟')) return;
  b.disabled = true;
  try {
    await auth.rpc('admin_delete_feedback', { feedback_id: +b.dataset.del });
    feedback = feedback.filter(f => f.id !== +b.dataset.del); renderFeedback();
  } catch (err) { b.disabled = false; alert(auth.errorText(err)); }
});
$('#adm-fb-csv').addEventListener('click', () => exportCsv('الملاحظات', [
  ['التاريخ', f => f.created_at?.slice(0, 10)], ['الملاحظة', f => f.body], ['الاسم', f => f.name],
  ['البريد', f => f.email], ['مشترك', f => f.is_user ? 'نعم' : 'لا'], ['حول رسالة', fbAbout],
], feedback));

/* ---------- التحميل ---------- */
function renderStats() {
  renderKpis(); renderDaily(); renderMessages();
  for (const k of ['rel', 'size', 'channel', 'device', 'lang', 'countries']) renderBars('adm-' + k, stats[k], LABELS[k]);
}
function fail(e) {
  if (e?.code === '42501') gate('هذا الحساب ليس مشرفًا. اطلب من مسؤول الموقع منحك الصلاحية.', 'العودة إلى الموقع');
  else gate(auth.errorText(e));
}

$$('.adm-chip').forEach(b => b.addEventListener('click', async () => {
  if (+b.dataset.days === days) return;
  days = +b.dataset.days;
  $$('.adm-chip').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#adm-content').classList.add('is-busy');   // يبقى العرض السابق باهتًا حتى تصل الأرقام
  try { stats = await auth.rpc('admin_stats', { days }); renderStats(); }
  catch (e) { fail(e); }
  finally { $('#adm-content').classList.remove('is-busy'); }
}));
if ('ResizeObserver' in window) {
  let w = 0;
  new ResizeObserver(([e]) => { if (stats && Math.abs(e.contentRect.width - w) > 1) { w = e.contentRect.width; renderDaily(); } }).observe(daily);
}

async function boot() {
  if (!auth.authEnabled) return gate('الحسابات غير مفعّلة بعد: اضبط إعدادات Supabase في js/config.js.');
  try {
    await auth.init();
    const user = await auth.getUser();
    if (!user) return gate('هذه الصفحة للمشرفين. سجّل الدخول بحساب مشرف من الموقع ثم عُد إليها.', 'الذهاب إلى الموقع');
    $('#adm-who').textContent = user.email;
    [stats, users, feedback] = await Promise.all([auth.rpc('admin_stats', { days }), auth.rpc('admin_users'), auth.rpc('admin_feedback')]);
    $('#adm-gate').hidden = true; $('#adm-body').hidden = false;
    renderStats(); renderUsers(); renderFeedback();
  } catch (e) { fail(e); }
}
auth.onUser((user, event) => { if (event === 'SIGNED_OUT') gate('سُجّل الخروج من هذا الحساب.', 'الذهاب إلى الموقع'); });
boot();

// منطق الصفحة: الحالة، التنقّل بين الرسائل، القوائم، المشاركة، والتفضيلات.
import { MESSAGES, RELIGIONS, LANGS, GUIDE, SIZES, COUNTRIES } from './data.js';
import { qrDataUrl } from './qr.js';
import { renderCard, segmentsFromHtml } from './card.js';
import * as auth from './auth.js';
import { track, insertRow } from './track.js';

/* ---------- أدوات صغيرة ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const SIZE_KEYS = SIZES.map(s => s.key);
const SITE_URL = location.origin + location.pathname;

/* ---------- الحالة ---------- */
const savedLen = SIZE_KEYS.includes(store.get('om-pref-len')) ? store.get('om-pref-len') : 'S';
const state = {
  rel: 0, cur: 0,
  defLen: savedLen, len: savedLen,
  dark: store.get('om-pref-dark') === '1',
  introDark: store.get('om-pref-idark') !== '0',
  lang: 0, step: 1,
  intro: true,
  user: null, admin: false,
};
const msgs = () => MESSAGES[RELIGIONS[state.rel].set];
const current = () => msgs()[state.cur];
const msgUrl = () => `${SITE_URL}#r=${state.rel}&m=${state.cur + 1}&l=${state.len}`;
const cardText = () => {
  const m = current(); const { text } = segmentsFromHtml(m[sizeField(state.len)]);
  return { title: m.title, text };
};
const sizeField = k => ({ S: 'short', M: 'medium', L: 'long' })[k];

/* ---------- العناصر ---------- */
const el = {
  body: document.body, intro: $('#intro'), stage: $('#stage'), card: $('#card'),
  title: $('#card-title'), cbody: $('#card-body'), scroll: $('#card-scroll'), cqr: $('#card-qr'),
  track: $('#card-track'), thumb: $('#card-thumb'),
  segs: $('#segs'), counter: $('#counter'), hint: $('#hint'),
  next: $('[data-action="next"]'), prev: $('[data-action="prev"]'),
};

/* ---------- العرض ---------- */
function bind(name, fn) { $$(`[data-bind="${name}"]`).forEach(fn); }
const ICON_MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const ICON_SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function renderBindings() {
  bind('rel-name', n => n.textContent = RELIGIONS[state.rel].name);
  bind('lang-name', n => n.textContent = LANGS[state.lang][0]);
  bind('lang-code', n => n.textContent = LANGS[state.lang][1]);
  bind('theme-btn', n => { n.innerHTML = state.dark ? ICON_SUN : ICON_MOON; n.dataset.tip = n.title = state.dark ? 'الوضع الفاتح' : 'الوضع الداكن'; });
  bind('theme-label', n => n.textContent = state.dark ? 'الوضع الفاتح' : 'الوضع الداكن');
  bind('theme-icon', n => n.textContent = state.dark ? '☀' : '☾');
  bind('intro-theme-icon', n => n.textContent = state.introDark ? '☀' : '☾');
  bind('intro-theme-label', n => n.textContent = state.introDark ? 'الوضع الفاتح' : 'الوضع الداكن');
  bind('intro-theme-btn', n => { n.dataset.tip = state.introDark ? 'الوضع الفاتح' : 'الوضع الداكن'; n.setAttribute('aria-label', n.dataset.tip); });
  bind('card-title', n => n.textContent = current().title);
  const authLabel = state.user ? 'حسابي' : 'الدخول / الاشتراك';
  const userName = state.user?.user_metadata?.full_name?.trim() || '';
  const initial = state.user ? [...(userName || state.user.email || '؟')][0].toUpperCase() : '';
  const avatar = cls => Object.assign(document.createElement('span'), { className: cls, textContent: initial });
  // في القائمة: دائرة الحرف الأول والاسم، وتحته «حسابي»
  bind('auth-label', n => {
    if (!state.user) return n.textContent = authLabel;
    const text = Object.assign(document.createElement('span'), { className: 'drawer__who' });
    text.append(Object.assign(document.createElement('span'), { textContent: userName || state.user.email }),
      Object.assign(document.createElement('span'), { className: 'sub', textContent: authLabel }));
    n.replaceChildren(avatar('avatar'), text);
  });
  // بعد الدخول: الاسم في التلميح، وأول حرف منه مكان الأيقونة
  bind('auth-btn', n => {
    const tip = state.user ? userName || authLabel : authLabel;
    n.dataset.tip = tip; n.setAttribute('aria-label', tip);
    n.userIcon ??= n.innerHTML;
    if (!state.user) { n.innerHTML = n.userIcon; return; }
    n.replaceChildren(avatar('auth-initial'));
  });
  bind('auth-name', n => n.textContent = userName);
  bind('auth-email', n => n.textContent = state.user?.email || '');
  bind('admin-link', n => n.hidden = !state.admin);
  el.body.dataset.theme = state.dark ? 'dark' : 'light';
  el.intro.dataset.theme = state.introDark ? 'dark' : 'light';
}

function renderLists() {
  $$('[data-list="rel"]').forEach(box => {
    box.innerHTML = RELIGIONS.map((r, i) => `<button class="pop__item" role="option" data-pick-rel="${i}" aria-selected="${i === state.rel}"><span>${r.name}</span><span class="check">${i === state.rel ? '✓' : ''}</span></button>`).join('');
  });
  $$('[data-list="lang"]').forEach(box => {
    box.innerHTML = LANGS.map((l, i) => `<button class="pop__item" role="option" data-pick-lang="${i}" aria-selected="${i === state.lang}" style="font-size:14px;padding:8px 12px"><span style="white-space:nowrap">${l[0]}</span><span class="code">${l[1]}</span></button>`).join('');
  });
  $$('[data-list="lang-chips"]').forEach(box => {
    box.innerHTML = LANGS.map((l, i) => `<button class="chip" data-pick-lang="${i}" aria-selected="${i === state.lang}">${l[0]}</button>`).join('');
  });
  $$('[data-list="size-intro"]').forEach(box => {
    box.innerHTML = SIZES.map(s => `<button class="size-btn" data-pick-size="${s.key}" data-scope="intro" aria-pressed="${s.key === state.defLen}">${s.label}</button>`).join('');
  });
  $$('[data-list="size-bar"]').forEach(box => {
    box.innerHTML = SIZES.map(s => `<button class="len__btn" data-pick-size="${s.key}" aria-pressed="${s.key === state.len}">${s.label}</button>`).join('');
  });
}

function renderSegs() {
  const n = msgs().length;
  el.segs.innerHTML = Array.from({ length: n }, (_, i) => `<button role="tab" data-go="${i}" title="الرسالة ${i + 1}" aria-current="${i === state.cur}" aria-label="الرسالة ${i + 1}"></button>`).join('');
  el.counter.textContent = `${state.cur + 1} / ${n}`;
  el.next.disabled = state.cur >= n - 1;
  el.prev.disabled = state.cur <= 0;
}

function renderCardView(animate = false) {
  const m = current();
  el.title.textContent = m.title;
  el.title.classList.toggle('card__title--long', m.title.length > 30);
  el.cbody.dataset.size = state.len;
  el.cbody.innerHTML = m[sizeField(state.len)];
  el.scroll.scrollTop = 0; el.stage.scrollTop = 0;
  try { el.cqr.src = qrDataUrl(msgUrl(), 8, 2); } catch { el.cqr.src = 'images/qr-site.png'; }
  if (animate) { el.card.classList.remove('is-entering'); void el.card.offsetWidth; el.card.classList.add('is-entering'); }
  renderSegs(); renderBindings();
  requestAnimationFrame(updateTrack);
  document.fonts?.ready.then(() => requestAnimationFrame(updateTrack));
  $$('[data-list="size-bar"] [data-pick-size]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pickSize === state.len));
  trackView();
}

/* ---------- الإحصاءات (track.js) ---------- */
const msgRef = () => ({ rel: RELIGIONS[state.rel].key, msg: state.cur + 1, title: current().title });
let lastView = '';
// تُحسب قراءة الرسالة مرة عند ظهورها، لا عند تغيير حجمها
function trackView() {
  const key = `${state.rel}:${state.cur}`;
  if (state.intro || key === lastView) return;
  lastView = key; track('view', { ...msgRef(), size: state.len });
}

function renderGuide() {
  $('#guide-items').innerHTML = GUIDE.map((g, i) => `
    <div class="guide__item">
      <span class="guide__num">${i + 1}</span>
      <div><h2 class="guide__h">${g.t}</h2><p class="guide__p">${g.b}</p>${g.b2 ? `<p class="guide__p">${g.b2}</p>` : ''}</div>
    </div>`).join('');
}
// يظهر شريط العودة اللاصق أعلى التوجيهات حين يختفي رابط العودة العلوي عند التمرير
new IntersectionObserver(([e]) => $('#guide').classList.toggle('is-scrolled', !e.isIntersecting), { root: $('#guide') })
  .observe($('.guide__back'));

function renderAll() { renderLists(); renderCardView(); renderGuide(); }

/* ---------- التنقّل ---------- */
function goTo(i, animate = true) {
  const n = msgs().length;
  const next = Math.max(0, Math.min(n - 1, i));
  if (next === state.cur && animate) return;
  state.cur = next; state.len = state.defLen;
  // كالنسخة القديمة: البطاقة الجديدة تظهر في مكانها مباشرة بتلاشٍ داخلي، بلا حركة رجوع
  el.card.classList.remove('is-dragging', 'is-loaded', 'is-entering');
  el.card.style.transition = 'none';
  el.card.style.transform = ''; el.card.style.opacity = '';
  renderCardView(animate);
  requestAnimationFrame(() => { el.card.style.transition = ''; });
}
const nav = dir => goTo(state.cur + dir);

function setRel(i) {
  state.rel = i; state.cur = 0; state.step = Math.max(state.step, 2);
  closePops(); closeMenu();
  renderLists(); renderCardView();
}
function setLen(k, scope) {
  if (scope === 'intro') { state.defLen = k; state.len = k; store.set('om-pref-len', k); if (state.step >= 2) state.step = 3; renderLists(); }
  else { state.defLen = k; state.len = k; store.set('om-pref-len', k); }
  renderCardView();
}
function setLang(i) { state.lang = i; closePops(); renderLists(); renderBindings(); }

/* ---------- الوضع الداكن ---------- */
function toggleTheme() { state.dark = !state.dark; store.set('om-pref-dark', state.dark ? '1' : '0'); renderBindings(); }
function toggleIntroTheme() { state.introDark = !state.introDark; store.set('om-pref-idark', state.introDark ? '1' : '0'); renderBindings(); }

/* ---------- القوائم ---------- */
function closePops() {
  $$('.pop').forEach(p => p.hidden = true);
  $$('[data-pop]').forEach(b => { b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); });
}
function togglePop(btn) {
  const pop = $('#pop-' + btn.dataset.pop); const open = pop.hidden;
  closePops();
  if (open) { pop.hidden = false; btn.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
}
function toggleSub(btn) {
  const sub = $('#' + btn.dataset.sub); sub.hidden = !sub.hidden; btn.classList.toggle('is-open', !sub.hidden);
}
function openMenu() { $('#menu-drawer').hidden = false; $('#menu-backdrop').hidden = false; }
function closeMenu() { $('#menu-drawer').hidden = true; $('#menu-backdrop').hidden = true; $$('#menu-drawer .drawer__sub').forEach(s => s.hidden = true); $$('#menu-drawer .is-open').forEach(b => b.classList.remove('is-open')); }
function openIntroMenu() { $('#intro-drawer').hidden = false; $('#intro-backdrop').hidden = false; }
function closeIntroMenu() { $('#intro-drawer').hidden = true; $('#intro-backdrop').hidden = true; $('#intro-lang-sub').hidden = true; $$('#intro-drawer .is-open').forEach(b => b.classList.remove('is-open')); }

/* ---------- البداية والتلميح ---------- */
let hintT1, hintT2;
function start() {
  state.intro = false; el.intro.hidden = true; closeIntroMenu();
  history.replaceState(null, '', msgUrl().slice(SITE_URL.length));
  showHint();
  track('start', { rel: RELIGIONS[state.rel].key, size: state.len, lang: LANGS[state.lang][1] });
  trackView();
}
function showHint() {
  clearTimeout(hintT1); clearTimeout(hintT2);
  el.hint.classList.remove('is-out'); el.hint.classList.add('is-on');
  hintT1 = setTimeout(() => el.hint.classList.add('is-out'), 3200);
  hintT2 = setTimeout(hideHint, 3650);
}
function hideHint() { clearTimeout(hintT1); clearTimeout(hintT2); el.hint.classList.remove('is-on', 'is-out'); }
function goHome() { state.intro = true; el.intro.hidden = false; lastView = ''; hideHint(); closePops(); closeMenu(); history.replaceState(null, '', location.pathname); }

/* ---------- السحب ---------- */
let drag = null, lastDragEnd = 0;
el.stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button, a, img, input, textarea, .card__track')) return;
  drag = { x: e.clientX, y: e.clientY, axis: null, dx: 0 };
  hideHint();
});
el.stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.axis === null) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    drag.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    if (drag.axis === 'x') { el.card.classList.add('is-dragging'); el.stage.classList.add('is-dragging'); try { el.stage.setPointerCapture(e.pointerId); } catch {} }
  }
  if (drag.axis !== 'x') return;
  const n = msgs().length;
  const atEdge = (dx > 0 && state.cur === n - 1) || (dx < 0 && state.cur === 0);
  drag.dx = atEdge ? dx / 4 : dx;
  el.card.style.transform = `translateX(${drag.dx}px)`;
  el.card.style.opacity = Math.max(.25, 1 - Math.abs(drag.dx) / 500);
});
function endDrag() {
  if (!drag) return;
  const { dx, axis } = drag; drag = null;
  el.card.classList.remove('is-dragging'); el.stage.classList.remove('is-dragging');
  if (axis !== null) lastDragEnd = Date.now();
  const th = Math.min(70, innerWidth * .12);
  const n = msgs().length;
  if (axis === 'x' && dx > th && state.cur < n - 1) { nav(1); return; }
  if (axis === 'x' && dx < -th && state.cur > 0) { nav(-1); return; }
  el.card.style.transform = ''; el.card.style.opacity = '';
}
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.stage.addEventListener(ev, endDrag));

// النقر على حواف الصفحة (سطح المكتب)
let edgeDown = null;
$$('.edge').forEach(e => {
  e.addEventListener('pointerdown', ev => edgeDown = { x: ev.clientX, y: ev.clientY });
  e.addEventListener('pointerup', ev => {
    if (!edgeDown || Math.abs(ev.clientX - edgeDown.x) > 10 || Math.abs(ev.clientY - edgeDown.y) > 10) { edgeDown = null; return; }
    edgeDown = null; nav(+e.dataset.edge);
  });
});

/* ---------- المشاركة والنسخ والتحميل ---------- */
let cardPromise = null;
function generateCard() {
  const m = current(); const { segs } = segmentsFromHtml(m[sizeField(state.len)]);
  cardPromise = renderCard({ title: m.title, segs, url: msgUrl(), logoSrc: 'images/logo.png' });
  return cardPromise;
}
async function copyText(btn) {
  const { title, text } = cardText();
  try { await navigator.clipboard.writeText(title + '\n\n' + text); } catch {}
  btn.classList.add('is-ok'); setTimeout(() => btn.classList.remove('is-ok'), 1600);
  track('copy', msgRef());
}
async function downloadCard() {
  track('download', msgRef());
  const { dataUrl } = await generateCard();
  const a = document.createElement('a'); a.href = dataUrl; a.download = (current().title || 'رسالة') + '.png'; a.click();
}
function openShare() {
  const { title, text } = cardText();
  // المعاينة بتنسيق البطاقة نفسه (الآيات بخط Amiri وعلامة الآية حول رقمها)؛ المُرسَل يبقى نصًا
  $('#share-text').innerHTML = current()[sizeField(state.len)];
  const payload = encodeURIComponent(title + '\n\n' + text), page = encodeURIComponent(msgUrl());
  const links = {
    wa: 'https://wa.me/?text=' + payload,
    tw: 'https://twitter.com/intent/tweet?text=' + payload,
    tg: 'https://t.me/share/url?url=' + page + '&text=' + payload,
    fb: 'https://www.facebook.com/sharer/sharer.php?u=' + page + '&quote=' + payload,
  };
  $$('[data-share]').forEach(a => a.href = links[a.dataset.share]);
  $('#share').hidden = false; generateCard();
}
async function shareNative(e) {
  if (!(navigator.share && navigator.canShare)) return;
  e.preventDefault(); const href = e.currentTarget.href;
  const { file } = await (cardPromise || generateCard());
  if (file && navigator.canShare({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
  else window.open(href, '_blank', 'noopener');
}

/* ---------- الملاحظات ---------- */
// تُحفظ الملاحظة في جدول feedback، ويقرؤها المشرف في صفحة الإحصاءات
function feedbackMsg(text, ok = false) {
  const m = $('#feedback-msg'); m.textContent = text; m.hidden = !text; m.classList.toggle('is-ok', ok);
}
function openFeedback() {
  const f = $('#feedback-form');
  feedbackMsg('');
  if (state.user) {   // المسجّل لا يحتاج إلى كتابة اسمه وبريده
    f.elements.name.value ||= state.user.user_metadata?.full_name || '';
    f.elements.email.value ||= state.user.email || '';
  }
  $('#feedback').hidden = false;
  f.elements.text.focus();
}
$('#feedback-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, f = new FormData(form), body = String(f.get('text') || '').trim();
  if (!body) return feedbackMsg('اكتب ملاحظتك أولًا.');
  const name = String(f.get('name') || '').trim(), email = String(f.get('email') || '').trim();
  if (!auth.authEnabled) {   // بلا Supabase: تُفتح رسالة بريد جاهزة كما كان
    const subject = encodeURIComponent('ملاحظة على رسالة: ' + current().title);
    location.href = `mailto:info@islamiccontent.sa?subject=${subject}&body=${encodeURIComponent(`${body}\n\n— ${name}${email ? ' <' + email + '>' : ''}\n${msgUrl()}`)}`;
    $('#feedback').hidden = true; form.reset();
    return;
  }
  const btn = $('#feedback-send');
  btn.disabled = true; btn.textContent = 'جارٍ الإرسال…'; feedbackMsg('');
  try {
    await insertRow('feedback', { name: name || null, email: email || null, body, ...msgRef() });
    form.reset();
    feedbackMsg('وصلت ملاحظتك، شكرًا لك.', true);
    track('feedback', msgRef());
    setTimeout(() => { $('#feedback').hidden = true; feedbackMsg(''); }, 1600);
  } catch (err) {
    feedbackMsg(auth.errorText(err));
  } finally {
    btn.disabled = false; btn.textContent = 'إرسال';
  }
});

/* ---------- الحسابات (Supabase عبر auth.js) ---------- */
const AUTH_CTA = { in: 'دخول', up: 'إنشاء حساب', forgot: 'إرسال رابط الاستعادة', reset: 'حفظ كلمة المرور' };
const AUTH_TITLE = { forgot: 'استعادة كلمة المرور', reset: 'كلمة مرور جديدة', account: 'حسابي' };
let authMode = 'in';
function setAuthMode(mode, msg = '', ok = false) {
  authMode = mode;
  $$('[data-auth-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.authTab === mode));
  $$('[data-auth-only]').forEach(n => n.hidden = !n.dataset.authOnly.split(' ').includes(mode));
  $('#auth-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  bind('auth-cta', n => n.textContent = AUTH_CTA[mode] || '');
  bind('auth-title', n => n.textContent = AUTH_TITLE[mode] || '');
  showPasswords(false);
  $$('#auth-form [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  authMsg(msg, ok);
}
// زر العين يُظهر حقلي كلمة المرور معًا ليقارن المستخدم بينهما
const ICON_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.4 0 10 8 10 8a17.6 17.6 0 0 1-2.9 4.1"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
function showPasswords(show) {
  $$('#auth-pass, #auth-pass2').forEach(i => i.type = show ? 'text' : 'password');
  $$('.auth__eye').forEach(b => {
    b.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
    b.setAttribute('aria-pressed', show);
    b.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
  });
}
function authMsg(text, ok = false) {
  const m = $('#auth-msg'); m.textContent = text; m.hidden = !text; m.classList.toggle('is-ok', ok);
}
function openAuth(mode = state.user ? 'account' : 'in', msg = '', ok = false) {
  setAuthMode(mode, msg, ok);
  $('#auth').hidden = false; closeMenu(); closeIntroMenu(); cpick.close();
  $('#auth-form').classList.toggle('auth--dark', state.intro ? state.introDark : state.dark);
  auth.preload();
}
/* ---------- اختيار الدولة: قائمة بالأعلام مع بحث ---------- */
// القيمة المختارة في #auth-country.value (زر)، فيبقى التحقق والإرسال كما هما
// توحيد الحروف ليجد «الامارات» «الإمارات» و«السعوديه» «السعودية»
const normAr = s => s.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ̀-ͯ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^ال|\sال/g, ' ').trim();
const flagImg = c => `<img class="cpick__flag" src="images/flags/${c.toLowerCase()}.svg" alt="" loading="lazy" width="22" height="16">`;
function renderCountries() {
  let ar, en; try { ar = new Intl.DisplayNames(['ar'], { type: 'region' }); en = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const list = COUNTRIES.CODES.map(c => [c, COUNTRIES.NAMES[c] || ar?.of(c) || c]).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  $('#cpick-list').innerHTML = list.map(([c, n]) =>
    `<li role="option" id="cp-${c}" data-code="${c}" data-name="${n}" data-q="${normAr(`${n} ${en?.of(c) || ''} ${c}`)}" aria-selected="false">${flagImg(c)}<span>${n}</span></li>`).join('');
}
const cpick = {
  root: $('#cpick'), btn: $('#auth-country'), pop: $('#cpick .cpick__pop'), search: $('#cpick .cpick__search'), list: $('#cpick-list'),
  visible() { return $$('#cpick-list li:not([hidden])'); },
  open() {
    this.pop.hidden = false; this.btn.setAttribute('aria-expanded', 'true');
    this.search.value = ''; this.filter(); this.search.focus();
    const sel = this.list.querySelector('[aria-selected="true"]');
    if (sel) { this.activate(sel); sel.scrollIntoView({ block: 'center' }); }
  },
  close(refocus) {
    if (this.pop.hidden) return;
    this.pop.hidden = true; this.btn.setAttribute('aria-expanded', 'false');
    if (refocus) this.btn.focus();
  },
  filter() {
    const q = normAr(this.search.value);
    let first = null;
    for (const li of this.list.children) { li.hidden = !!q && !li.dataset.q.includes(q); if (!li.hidden) first ??= li; }
    $('#cpick .cpick__empty').hidden = !!first;
    this.activate(first);
  },
  activate(li) {
    this.list.querySelector('.is-active')?.classList.remove('is-active');
    if (li) { li.classList.add('is-active'); li.scrollIntoView({ block: 'nearest' }); }
    li ? this.search.setAttribute('aria-activedescendant', li.id) : this.search.removeAttribute('aria-activedescendant');
  },
  choose(li) {
    this.list.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-selected', 'true');
    this.btn.value = li.dataset.code; this.btn.removeAttribute('aria-invalid');
    this.btn.querySelector('.cpick__val').innerHTML = `${flagImg(li.dataset.code)}<span>${li.dataset.name}</span>`;
    this.close(true);
  },
};
cpick.btn.addEventListener('click', () => cpick.pop.hidden ? cpick.open() : cpick.close());
cpick.search.addEventListener('input', () => cpick.filter());
cpick.list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) cpick.choose(li); });
cpick.root.addEventListener('keydown', e => {
  if (cpick.pop.hidden) return;
  const items = cpick.visible(), i = items.indexOf(cpick.list.querySelector('.is-active'));
  if (e.key === 'ArrowDown') cpick.activate(items[Math.min(i + 1, items.length - 1)]);
  else if (e.key === 'ArrowUp') cpick.activate(items[Math.max(i - 1, 0)]);
  else if (e.key === 'Enter') { if (items[i]) cpick.choose(items[i]); }
  else if (e.key === 'Escape') cpick.close(true);
  else if (e.key === 'Tab') { cpick.close(); return; }
  else return;
  e.preventDefault(); e.stopPropagation();
});
document.addEventListener('pointerdown', e => { if (!cpick.root.contains(e.target)) cpick.close(); });
// يُعلَّم الحقل المخطئ بإطار أحمر، ويزول التعليم حين يُعدَّل
$('#auth-form').addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
function authInvalid() {
  const email = $('#auth-email'), pass = $('#auth-pass').value, isNew = authMode === 'up' || authMode === 'reset';
  if (authMode === 'up' && !$('#auth-name').value.trim()) return ['اكتب اسمك.', 'auth-name'];
  if (authMode === 'up' && !$('#auth-country').value) return ['اختر دولتك.', 'auth-country'];
  if (authMode !== 'reset' && (!email.value.trim() || !email.validity.valid)) return ['اكتب بريدًا إلكترونيًا صحيحًا.', 'auth-email'];
  if (authMode === 'in' && !pass) return ['اكتب كلمة المرور.', 'auth-pass'];
  if (isNew && pass.length < 8) return ['كلمة المرور 8 أحرف على الأقل.', 'auth-pass'];
  if (isNew && pass !== $('#auth-pass2').value) return ['كلمتا المرور غير متطابقتين.', 'auth-pass2'];
  return null;
}
const AUTH_SUBMIT = {
  in: async f => { await auth.signIn(f.email, f.pass); $('#auth').hidden = true; },
  up: async f => {
    const { session } = await auth.signUp(f);
    if (session) $('#auth').hidden = true;
    else authMsg(`أرسلنا رسالة تأكيد إلى ${f.email}، افتحها لتفعيل حسابك.`, true);
  },
  forgot: async f => { await auth.sendReset(f.email); authMsg('إن كان البريد مسجّلًا فسيصلك رابط لتعيين كلمة مرور جديدة.', true); },
  reset: async f => { await auth.setPassword(f.pass); setAuthMode('account', 'حُفظت كلمة المرور الجديدة.', true); },
};
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  $$('#auth-form [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  const bad = authInvalid();
  if (bad) { const field = $('#' + bad[1]); field.setAttribute('aria-invalid', 'true'); field.focus(); return authMsg(bad[0]); }
  const btn = $('#auth-form [type="submit"]');
  const f = { name: $('#auth-name').value.trim(), country: $('#auth-country').value, email: $('#auth-email').value.trim(), pass: $('#auth-pass').value };
  btn.disabled = true; authMsg('');
  try { await AUTH_SUBMIT[authMode](f); $('#auth-pass').value = $('#auth-pass2').value = ''; showPasswords(false); }
  catch (err) { authMsg(auth.errorText(err)); }
  finally { btn.disabled = false; }
});
async function signOut() {
  try { await auth.signOut(); $('#auth').hidden = true; } catch (err) { authMsg(auth.errorText(err)); }
}
let profileFor = null;
auth.onUser(user => {
  state.user = user;
  if (!user) { state.admin = false; profileFor = null; }
  else if (profileFor !== user.id) {
    // صلاحية المشرف من جدول profiles، مرة لكل مستخدم
    profileFor = user.id;
    auth.myProfile().then(p => { state.admin = !!p?.is_admin; renderBindings(); }).catch(() => {});
  }
  renderBindings();
  if (!user && authMode === 'account') $('#auth').hidden = true;
});

/* ---------- الأحداث ---------- */
const actions = {
  start, home: goHome, next: () => nav(1), prev: () => nav(-1),
  guide: () => { $('#guide').hidden = false; closeMenu(); closeIntroMenu(); },
  'close-guide': () => $('#guide').hidden = true,
  theme: toggleTheme, 'intro-theme': toggleIntroTheme,
  menu: openMenu, 'close-menu': closeMenu, 'intro-menu': openIntroMenu, 'close-intro-menu': closeIntroMenu,
  'toggle-pop': (btn) => togglePop(btn), 'toggle-sub': (btn) => toggleSub(btn),
  share: openShare, 'close-share': () => $('#share').hidden = true,
  copy: (btn) => copyText(btn), 'share-copy': (btn) => copyText(btn),
  download: downloadCard, 'share-download': downloadCard,
  feedback: openFeedback, 'close-feedback': () => $('#feedback').hidden = true,
  'msg-qr': () => { $('#msg-qr-img').src = el.cqr.src; $('#msg-qr').hidden = false; },
  'close-msg-qr': () => $('#msg-qr').hidden = true,
  'site-qr': () => { $('#site-qr').hidden = false; closeIntroMenu(); }, 'close-site-qr': () => $('#site-qr').hidden = true,
  auth: () => openAuth(), 'close-auth': () => $('#auth').hidden = true,
  'auth-swap': () => setAuthMode(authMode === 'in' ? 'up' : 'in'),
  'auth-forgot': () => setAuthMode('forgot'), 'auth-in': () => setAuthMode('in'),
  'toggle-pass': () => showPasswords($('#auth-pass').type === 'password'),
  'sign-out': signOut,
  'hide-hint': hideHint,
};

document.addEventListener('click', e => {
  const t = e.target;
  // الطبقات: تجاهل النقر داخل المحتوى
  if (t.closest('[data-stop]') && t.closest('.overlay') === t.closest('[data-stop]').parentElement && !t.closest('[data-action]')) return;

  const pickRel = t.closest('[data-pick-rel]'); if (pickRel) { setRel(+pickRel.dataset.pickRel); return; }
  const pickLang = t.closest('[data-pick-lang]'); if (pickLang) { setLang(+pickLang.dataset.pickLang); return; }
  const pickSize = t.closest('[data-pick-size]'); if (pickSize) { setLen(pickSize.dataset.pickSize, pickSize.dataset.scope); return; }
  const go = t.closest('[data-go]'); if (go) { goTo(+go.dataset.go); return; }
  const tab = t.closest('[data-auth-tab]'); if (tab) { setAuthMode(tab.dataset.authTab); return; }
  const soc = t.closest('[data-share]'); if (soc) { track('share', { ...msgRef(), channel: soc.dataset.share }); shareNative(e); return; }

  const act = t.closest('[data-action]');
  if (act) {
    if (act.tagName === 'A') e.preventDefault();
    if (act.classList.contains('overlay') && t !== act) return;
    if ((act.dataset.action === 'next' || act.dataset.action === 'prev') && Date.now() - lastDragEnd < 350) return;
    actions[act.dataset.action]?.(act, e);
    if (act.dataset.action !== 'toggle-pop') closePops();
    return;
  }
  if (!t.closest('.pop')) closePops();
});

window.addEventListener('keydown', e => {
  if (state.intro || e.target.matches('input, textarea')) return;
  if (e.key === 'ArrowLeft') nav(1);
  if (e.key === 'ArrowRight') nav(-1);
  if (e.key === 'Escape') { $$('.overlay, .guide, .drawer, .backdrop').forEach(n => n.hidden = true); closePops(); }
});

/* ---------- القراءة من الرابط ---------- */
function readHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!h.has('m')) return false;
  state.rel = Math.max(0, Math.min(RELIGIONS.length - 1, parseInt(h.get('r') || '0', 10) || 0));
  const l = h.get('l'); if (SIZE_KEYS.includes(l)) { state.len = l; state.defLen = l; }
  state.cur = Math.max(0, Math.min(msgs().length - 1, (parseInt(h.get('m'), 10) || 1) - 1));
  state.intro = false; el.intro.hidden = true;
  return true;
}

/* ---------- مؤشر التمرير داخل البطاقة ---------- */
function updateTrack() {
  const s = el.scroll, over = s.scrollHeight - s.clientHeight;
  el.track.hidden = over <= 4;
  if (el.track.hidden) return;
  // الهندسة من حاوية التمرير نفسها (المسار: top 16px + bottom 24px في CSS)
  const trackH = Math.max(0, s.clientHeight - 40);
  const thumbH = Math.min(trackH, Math.max(28, trackH * s.clientHeight / s.scrollHeight));
  el.thumb.style.height = thumbH + 'px';
  el.thumb.style.top = Math.max(0, (s.scrollTop / over) * (trackH - thumbH)) + 'px';
}
el.scroll.addEventListener('scroll', updateTrack, { passive: true });
// سحب المؤشر يمرّر النص بالنسبة نفسها
el.thumb.addEventListener('pointerdown', e => {
  const s = el.scroll, y0 = e.clientY, top0 = s.scrollTop;
  const ratio = (s.scrollHeight - s.clientHeight) / Math.max(1, el.track.clientHeight - el.thumb.offsetHeight);
  const ac = new AbortController(), opt = { signal: ac.signal };
  const up = () => { el.thumb.classList.remove('is-dragging'); ac.abort(); };
  el.thumb.setPointerCapture(e.pointerId); el.thumb.classList.add('is-dragging'); e.preventDefault();
  el.thumb.addEventListener('pointermove', ev => { s.scrollTop = top0 + (ev.clientY - y0) * ratio; }, opt);
  el.thumb.addEventListener('pointerup', up, opt);
  el.thumb.addEventListener('pointercancel', up, opt);
});
if ('ResizeObserver' in window) { const ro = new ResizeObserver(updateTrack); ro.observe(el.scroll); ro.observe(el.cbody); }

/* ---------- قياس الشريطَين لتوسيط البطاقة ---------- */
function measureChrome() {
  // --chrome-top ثابت في main.css؛ يُقاس الشريط السفلي فقط
  document.documentElement.style.setProperty('--chrome-bottom', $('.bar').offsetHeight + 'px');
}
if ('ResizeObserver' in window) { new ResizeObserver(measureChrome).observe($('.bar')); }
window.addEventListener('resize', measureChrome);

/* ---------- التشغيل ---------- */
readHash();
renderAll();
setAuthMode('in');
measureChrome();
document.fonts?.ready.then(updateTrack);
el.card.classList.add('is-loaded');
el.body.classList.remove('is-loading');

// الحسابات: تُخفى أزرار الدخول ما لم تُضبط إعدادات Supabase في config.js
if (!auth.authEnabled) $$('[data-action="auth"]').forEach(n => n.hidden = true);
renderCountries();
track('visit');
auth.init().then(() => {
  const cb = auth.callback; if (!cb || !auth.authEnabled) return;
  if (cb.error) openAuth('in', auth.errorText({ code: cb.error }));
  else if (cb.type === 'recovery') openAuth('reset');
  else openAuth('account', 'تم تأكيد بريدك، أهلًا بك.', true);
}).catch(err => { if (auth.callback) openAuth('in', auth.errorText(err)); });

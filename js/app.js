// منطق الصفحة: الحالة، التنقّل بين الرسائل، القوائم، المشاركة، والتفضيلات.
import { MESSAGES, RELIGIONS, LANGS, GUIDE, SIZES } from './data.js';
import { qrDataUrl } from './qr.js';
import { renderCard, segmentsFromHtml } from './card.js';

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
  bind('card-title', n => n.textContent = current().title);
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
  $$('[data-list="size-bar"] [data-pick-size]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pickSize === state.len));
}

function renderGuide() {
  $('#guide-items').innerHTML = GUIDE.map((g, i) => `
    <div class="guide__item">
      <span class="guide__num">${i + 1}</span>
      <div><h2 class="guide__h">${g.t}</h2><p class="guide__p">${g.b}</p>${g.b2 ? `<p class="guide__p">${g.b2}</p>` : ''}</div>
    </div>`).join('');
}

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
}
function showHint() {
  clearTimeout(hintT1); clearTimeout(hintT2);
  el.hint.classList.remove('is-out'); el.hint.classList.add('is-on');
  hintT1 = setTimeout(() => el.hint.classList.add('is-out'), 3200);
  hintT2 = setTimeout(hideHint, 3650);
}
function hideHint() { clearTimeout(hintT1); clearTimeout(hintT2); el.hint.classList.remove('is-on', 'is-out'); }
function goHome() { state.intro = true; el.intro.hidden = false; hideHint(); closePops(); closeMenu(); history.replaceState(null, '', location.pathname); }

/* ---------- السحب ---------- */
let drag = null, lastDragEnd = 0;
el.stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button, a, img, input, textarea')) return;
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
}
async function downloadCard() {
  const { dataUrl } = await generateCard();
  const a = document.createElement('a'); a.href = dataUrl; a.download = (current().title || 'رسالة') + '.png'; a.click();
}
function openShare() {
  const { title, text } = cardText();
  $('#share-text').textContent = text;
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

/* ---------- الملاحظات والدخول ---------- */
$('#feedback-form').addEventListener('submit', e => {
  e.preventDefault(); const f = new FormData(e.target);
  const subject = encodeURIComponent('ملاحظة على رسالة: ' + current().title);
  const body = encodeURIComponent(`${f.get('text') || ''}\n\n— ${f.get('name') || ''}${f.get('email') ? ' <' + f.get('email') + '>' : ''}\n${msgUrl()}`);
  location.href = `mailto:info@islamiccontent.sa?subject=${subject}&body=${body}`;
  $('#feedback').hidden = true; e.target.reset();
});
function setAuthTab(tab) {
  $$('[data-auth-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.authTab === tab));
  $$('[data-auth-only]').forEach(n => n.hidden = n.dataset.authOnly !== tab);
  bind('auth-cta', n => n.textContent = tab === 'up' ? 'إنشاء حساب' : 'دخول');
}
function openAuth() {
  $('#auth').hidden = false; closeMenu(); closeIntroMenu();
  $('#auth-form').classList.toggle('auth--dark', state.intro ? state.introDark : state.dark);
}
$('#auth-form').addEventListener('submit', e => { e.preventDefault(); $('#auth').hidden = true; });

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
  feedback: () => $('#feedback').hidden = false, 'close-feedback': () => $('#feedback').hidden = true,
  'msg-qr': () => { $('#msg-qr-img').src = el.cqr.src; $('#msg-qr').hidden = false; },
  'close-msg-qr': () => $('#msg-qr').hidden = true,
  'site-qr': () => { $('#site-qr').hidden = false; closeIntroMenu(); }, 'close-site-qr': () => $('#site-qr').hidden = true,
  auth: openAuth, 'close-auth': () => $('#auth').hidden = true,
  'auth-swap': () => setAuthTab($('[data-auth-tab="in"]').getAttribute('aria-selected') === 'true' ? 'up' : 'in'),
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
  const tab = t.closest('[data-auth-tab]'); if (tab) { setAuthTab(tab.dataset.authTab); return; }
  const soc = t.closest('[data-share]'); if (soc) { shareNative(e); return; }

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

/* ---------- التشغيل ---------- */
readHash();
renderAll();
setAuthTab('in');
el.card.classList.add('is-loaded');
el.body.classList.remove('is-loading');

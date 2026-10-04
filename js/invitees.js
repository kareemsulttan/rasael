// متابعة المدعوين: من يدعوهم المشترك، وما أرسله لكل واحد منهم (جدولا invitees وinvitee_sends).
// التقدّم يُحسب من الإرسالات نفسها: أعلى رقم رسالة أُرسل للمدعو ضمن رسائل دينه.
// الأسماء مدخلات المستخدم: تُضاف دائمًا كنصوص لا كـ HTML.
import { MESSAGES, RELIGIONS } from './data.js';
import * as auth from './auth.js';

const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    k === 'class' ? n.className = v : n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}

const LATE_DAYS = 7;
const relOf = key => RELIGIONS.find(r => r.key === key) || RELIGIONS[0];
const setOf = key => relOf(key).set;
const totalOf = key => MESSAGES[setOf(key)].length;
const ago = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });
const agoText = days => days < 30 ? ago.format(-days, 'day') : ago.format(-Math.floor(days / 30), 'month');
const joinNames = names => names.length < 3 ? names.join(' و') : `${names.slice(0, 2).join('، ')} و${names.length - 2} آخرين`;

// hooks من app.js: ctx() للرسالة الحالية والمستخدم، openMessage لفتح رسالة مدعو، openAuth للاشتراك
let hooks = {};
let list = [], sends = [], loadedFor = null;
let selected = new Set(), flash = null;
let filter = 'all', editing = null, formFrom = 'list';

function progress(inv) {
  const set = setOf(inv.rel);
  let done = 0, last = '';
  for (const s of sends) {
    if (s.invitee_id !== inv.id) continue;
    if (setOf(s.rel) === set && s.msg > done) done = s.msg;
    if (s.created_at > last) last = s.created_at;
  }
  const total = totalOf(inv.rel);
  done = Math.min(done, total);
  const days = last ? Math.max(0, Math.floor((Date.now() - new Date(last)) / 864e5)) : null;
  return { done, total, last, days, complete: done >= total, late: done < total && days != null && days > LATE_DAYS };
}

/* ---------- التحميل ---------- */
export async function load(user) {
  if (!user) { list = []; sends = []; loadedFor = null; selected.clear(); renderShare(); return; }
  if (loadedFor === user.id) return;
  loadedFor = user.id;
  try {
    [list, sends] = await Promise.all([
      auth.from(c => c.from('invitees').select('id, name, rel, note, created_at').order('created_at')),
      auth.from(c => c.from('invitee_sends').select('invitee_id, rel, msg, created_at').order('created_at')),
    ]);
  } catch { list = []; sends = []; loadedFor = null; }   // يُعاد المحاولة عند فتح القائمة
  renderShare();
  if (!$('#invitees').hidden) renderList();
}
const ready = () => hooks.ctx().user && loadedFor === hooks.ctx().user.id;

/* ---------- سطر «لمن ترسلها؟» في نافذة المشاركة ---------- */
export function prepareShare(preselect = null) {
  selected = new Set(preselect ? [preselect] : []); flash = null;
  renderShare();
}
export function renderShare() {
  const box = $('#share-who'), c = hooks.ctx?.();
  if (!box || !c) return;
  if (!auth.authEnabled || (c.user && !ready())) { box.hidden = true; return; }
  box.hidden = false;
  if (!c.user) {   // غير المشترك: دعوة للاشتراك في اللحظة التي يفهم فيها الفائدة
    return box.replaceChildren(h('div', { class: 'who-promo' },
      h('div', {}, h('b', {}, 'تابِع من تدعوهم'), h('span', {}, 'اشترك مجانًا ليتذكّر الموقع أين وصلتَ مع كل شخص.')),
      h('button', { type: 'button', class: 'who-promo__go', 'data-who': 'signup' }, 'اشترك')));
  }
  const set = setOf(c.relKey);
  const sameSet = inv => setOf(inv.rel) === set;
  const lastOf = inv => progress(inv).last;
  const people = [...list].sort((a, b) => sameSet(b) - sameSet(a) || lastOf(b).localeCompare(lastOf(a)));
  const names = people.filter(p => selected.has(p.id)).map(p => p.name);
  const note = flash ? h('div', { class: 'who__note' + (flash.err ? ' is-err' : ' is-ok') }, flash.text)
    : names.length ? h('div', { class: 'who__note' }, `عند الإرسال تُسجَّل الرسالة ${c.msg} لـ${joinNames(names)}`)
    : !list.length ? h('div', { class: 'who__note' }, 'أضف من ترسل له، ليتذكّر الموقع أين وصلتَ معه.') : null;
  box.replaceChildren(
    h('div', { class: 'who__label' }, 'لمن ترسلها؟ ', h('span', {}, '(اختياري)')),
    h('div', { class: 'who__chips' },
      people.map(p => {
        const pr = progress(p);
        return h('button', { type: 'button', class: 'who-chip', 'data-who-pick': p.id, 'aria-pressed': selected.has(p.id) ? 'true' : 'false' },
          p.name, sameSet(p) && h('small', {}, `${pr.done}/${pr.total}`));
      }),
      h('button', { type: 'button', class: 'who-chip who-chip--add', 'data-who': 'add' }, '+ شخص جديد')),
    note);
}

// يُستدعى عند المشاركة أو النسخ أو التحميل من نافذة المشاركة
export async function recordSend(channel) {
  const c = hooks.ctx();
  if (!c.user || !selected.size || !ready()) return;
  const ids = [...selected];
  const rows = ids.map(id => ({ invitee_id: id, rel: c.relKey, msg: c.msg, size: c.size, channel }));
  const names = list.filter(p => selected.has(p.id)).map(p => p.name);
  try {
    await auth.from(cl => cl.from('invitee_sends').insert(rows));
    const now = new Date().toISOString();
    sends.push(...rows.map(r => ({ invitee_id: r.invitee_id, rel: r.rel, msg: r.msg, created_at: now })));
    flash = { text: `✓ سُجِّلت الرسالة ${c.msg} لـ${joinNames(names)}` };
  } catch (e) {
    flash = { text: 'تعذّر حفظ المتابعة، تحقق من اتصالك وحاول مرة أخرى.', err: true };
  }
  renderShare();
}

/* ---------- قائمة «مدعوّيّ» ---------- */
export function openList() {
  const user = hooks.ctx().user;
  if (!user) return hooks.openAuth('up');
  $('#invitees').hidden = false;
  if (!ready()) load(user);
  renderList();
}
const FILTERS = [['all', 'الكل'], ['waiting', 'ينتظرون رسالة'], ['done', 'اكتملوا']];
function renderList() {
  $('#inv-count').textContent = list.length ? `(${list.length})` : '';
  $('#inv-tabs').replaceChildren(...FILTERS.map(([k, label]) =>
    h('button', { type: 'button', class: 'inv-tab', role: 'tab', 'aria-selected': k === filter ? 'true' : 'false', 'data-inv-filter': k }, label)));
  const box = $('#inv-list');
  if (!ready()) return box.replaceChildren(h('p', { class: 'inv-empty' }, 'جارٍ التحميل…'));
  if (!list.length) return box.replaceChildren(h('p', { class: 'inv-empty' }, 'لم تُضف أحدًا بعد. أضف من تدعوه هنا، أو اختر «+ شخص جديد» عند مشاركة أي رسالة.'));
  const rows = list.map(p => ({ p, pr: progress(p) }))
    .filter(({ pr }) => filter === 'all' || (filter === 'done') === pr.complete)
    // من تأخر أولًا، ثم الأحدث نشاطًا، ثم من اكتملوا
    .sort((a, b) => a.pr.complete - b.pr.complete || b.pr.late - a.pr.late || b.pr.last.localeCompare(a.pr.last));
  if (!rows.length) return box.replaceChildren(h('p', { class: 'inv-empty' }, filter === 'done' ? 'لم يكتمل أحد بعد.' : 'لا أحد ينتظر رسالة الآن.'));
  box.replaceChildren(...rows.map(({ p, pr }) => h('div', { class: 'inv-card' },
    h('div', { class: 'inv-card__top' },
      h('span', { class: 'avatar avatar--sm' }, [...p.name.trim()][0] || '؟'),
      h('span', { class: 'inv-card__name' }, p.name),
      h('span', { class: 'inv-tag' }, relOf(p.rel).name),
      h('button', { type: 'button', class: 'inv-card__edit', 'data-inv-edit': p.id, 'aria-label': `تعديل ${p.name}` }, 'تعديل')),
    h('div', { class: 'inv-bar', 'aria-hidden': 'true' }, Array.from({ length: pr.total }, (_, i) => h('i', { class: i < pr.done ? 'is-on' : '' }))),
    h('div', { class: 'inv-card__foot' },
      h('span', { class: 'inv-card__meta' + (pr.late ? ' is-late' : '') },
        `${pr.done} من ${pr.total}`, pr.days != null ? ` · آخر رسالة ${agoText(pr.days)}` : ' · لم تُرسل له رسالة بعد'),
      pr.complete ? h('span', { class: 'inv-card__done' }, 'اكتملت الرسائل 🎉')
        : h('button', { type: 'button', class: 'inv-card__next', 'data-inv-next': p.id }, `أرسل الرسالة ${pr.done + 1} ←`)),
    p.note && h('div', { class: 'inv-card__note' }, p.note))));
}

/* ---------- إضافة شخص وتعديله ---------- */
function openForm(from, inv = null) {
  formFrom = from; editing = inv;
  const f = $('#inv-form');
  f.reset(); formMsg('');
  $('#inv-form-title').textContent = inv ? 'تعديل' : 'شخص جديد';
  f.elements.name.value = inv?.name || '';
  f.elements.note.value = inv?.note || '';
  const noteOpen = !!inv?.note;
  $('#inv-note-wrap').hidden = !noteOpen; $('#inv-note-toggle').hidden = noteOpen;
  $('#inv-delete').hidden = !inv;
  const rel = inv?.rel || hooks.ctx().relKey;
  $('#inv-form-rel').replaceChildren(...RELIGIONS.map(r =>
    h('button', { type: 'button', class: 'who-chip', 'data-inv-rel': r.key, 'aria-pressed': r.key === rel ? 'true' : 'false' }, r.name)));
  $('#inv-form-wrap').hidden = false;
  f.elements.name.focus();
}
function formMsg(text) { const m = $('#inv-form-msg'); m.textContent = text; m.hidden = !text; }
const closeForm = () => { $('#inv-form-wrap').hidden = true; };

async function saveForm(e) {
  e.preventDefault();
  const f = e.target, name = f.elements.name.value.trim(), note = f.elements.note.value.trim() || null;
  const rel = $('#inv-form-rel [aria-pressed="true"]')?.dataset.invRel || hooks.ctx().relKey;
  if (!name) return formMsg('اكتب الاسم أو اللقب.');
  const btn = $('#inv-save'); btn.disabled = true;
  try {
    if (editing) {
      await auth.from(c => c.from('invitees').update({ name, rel, note }).eq('id', editing.id));
      Object.assign(editing, { name, rel, note });
    } else {
      const row = await auth.from(c => c.from('invitees').insert({ name, rel, note }).select('id, name, rel, note, created_at').single());
      list.push(row);
      if (formFrom === 'share') selected.add(row.id);   // من نافذة المشاركة: يُختار مباشرة
    }
    closeForm(); flash = null;
    renderShare(); if (!$('#invitees').hidden) renderList();
  } catch (err) {
    formMsg(auth.errorText(err));
  } finally { btn.disabled = false; }
}
async function deleteEditing() {
  const inv = editing; if (!inv) return;
  if (!confirm(`حذف «${inv.name}» وكل ما سُجّل له من رسائل؟`)) return;
  try {
    await auth.from(c => c.from('invitees').delete().eq('id', inv.id));
    list = list.filter(p => p.id !== inv.id); sends = sends.filter(s => s.invitee_id !== inv.id); selected.delete(inv.id);
    closeForm(); renderShare(); renderList();
  } catch (err) { formMsg(auth.errorText(err)); }
}

/* ---------- الأحداث ---------- */
export function init(h) {
  hooks = h;
  $('#share-who').addEventListener('click', e => {
    const pick = e.target.closest('[data-who-pick]');
    if (pick) { const id = pick.dataset.whoPick; selected.has(id) ? selected.delete(id) : selected.add(id); flash = null; return renderShare(); }
    const act = e.target.closest('[data-who]')?.dataset.who;
    if (act === 'add') openForm('share');
    if (act === 'signup') hooks.openAuth('up');
  });
  $('#invitees').addEventListener('click', e => {
    const f = e.target.closest('[data-inv-filter]'); if (f) { filter = f.dataset.invFilter; return renderList(); }
    const ed = e.target.closest('[data-inv-edit]'); if (ed) return openForm('list', list.find(p => p.id === ed.dataset.invEdit));
    const nx = e.target.closest('[data-inv-next]');
    if (nx) {
      const p = list.find(x => x.id === nx.dataset.invNext);
      $('#invitees').hidden = true;
      return hooks.openMessage(p.rel, progress(p).done + 1, p.id);
    }
    if (e.target.closest('[data-inv-add]')) openForm('list');
  });
  $('#inv-form').addEventListener('submit', saveForm);
  $('#inv-form').addEventListener('click', e => {
    const r = e.target.closest('[data-inv-rel]');
    if (r) $$rel().forEach(b => b.setAttribute('aria-pressed', b === r ? 'true' : 'false'));
    if (e.target.closest('#inv-note-toggle')) { $('#inv-note-wrap').hidden = false; $('#inv-note-toggle').hidden = true; $('#inv-form').elements.note.focus(); }
    if (e.target.closest('#inv-delete')) deleteEditing();
  });
}
const $$rel = () => Array.from(document.querySelectorAll('#inv-form-rel [data-inv-rel]'));
export { closeForm };

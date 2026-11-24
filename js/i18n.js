// ترجمة الواجهة: النص العربي نفسه هو المفتاح، وقاموس كل لغة في js/i18n/<الرمز>-ui.js.
// الصفحة مكتوبة بالعربية في index.html، وtranslateDom يبدّل نصوصها وخصائصها (التلميحات وغيرها) حسب القاموس،
// ويحفظ الأصل العربي ليعيده عند الرجوع إلى العربية. ما يكتبه app.js يمرّ عبر t().
let dict = null;   // null = العربية

export function setDict(d) { dict = d || null; }

// t('أرسلنا رسالة إلى {email}', { email }) — ما ليس في القاموس يبقى بالعربية
export function t(s, vars) {
  let out = (dict && dict[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}

const AR = /[؀-ۿ]/;
const ATTRS = ['data-tip', 'aria-label', 'title', 'alt', 'placeholder'];
// لكل نص أو خاصية: الأصل العربي وآخر ما كُتب فيها، لنعرف إن غيّرها app.js بعدنا
const textRec = new WeakMap(), attrRec = new WeakMap();
const SKIP = '[data-no-i18n], script, style';

function swap(rec, current) {
  // أول مرة، أو كتب app.js نصًا عربيًا جديدًا: هو الأصل الجديد
  if (!rec || (current !== rec.out && AR.test(current))) rec = AR.test(current) ? { ar: current } : null;
  if (!rec || (current !== rec.out && current !== rec.ar)) return { rec: null, value: current };   // نص كتبه app.js بلغة أخرى
  const core = rec.ar.trim(), tr = dict && dict[core];
  rec.out = tr ? rec.ar.replace(core, tr) : rec.ar;
  return { rec, value: rec.out };
}

export function translateDom(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n; (n = w.nextNode());) {
    const { rec, value } = swap(textRec.get(n), n.nodeValue);
    if (rec) { textRec.set(n, rec); if (n.nodeValue !== value) n.nodeValue = value; }
  }
  root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(el => {
    if (el.closest(SKIP)) return;
    const recs = attrRec.get(el) || {};
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (v == null) continue;
      const { rec, value } = swap(recs[a], v);
      if (rec) { recs[a] = rec; if (v !== value) el.setAttribute(a, value); }
    }
    attrRec.set(el, recs);
  });
}

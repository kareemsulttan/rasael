// سجل الاستخدام للإحصاءات: أحداث صغيرة تُضاف إلى جدول events في Supabase.
// الزائر يُعرَّف برقم عشوائي في متصفحه. غير المسجّل يُرسَل حدثه مباشرة دون تحميل مكتبة Supabase،
// والمسجّل عبر جلسته ليُربط الحدث بحسابه. أي فشل يُتجاهل بصمت ولا يؤثر في الموقع.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { authEnabled, usesClient, client } from './auth.js';

const VISITOR_KEY = 'om-vid';
const newId = () => crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
const visitorId = (() => {
  try { let id = localStorage.getItem(VISITOR_KEY); if (!id) localStorage.setItem(VISITOR_KEY, id = newId()); return id; }
  catch { return newId(); }
})();
const device = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
// التشغيل المحلي لا يُحسب في إحصاءات الموقع الحقيقي
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// إضافة صف إلى جدول في Supabase: المسجّل عبر جلسته، وغيره مباشرة دون تحميل المكتبة
export function insertRow(table, row) {
  if (usesClient()) return client().then(c => c.from(table).insert(row)).then(({ error }) => { if (error) throw error; });
  return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', keepalive: true, body: JSON.stringify(row),
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  }).then(r => { if (!r.ok) throw { status: r.status }; });
}

export function track(type, data = {}) {
  if (!authEnabled || isLocal) return;
  const row = { visitor_id: visitorId, type, ...data };
  if (type === 'visit') row.device = device;
  insertRow('events', row).catch(() => {});
}

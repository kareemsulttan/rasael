// الحسابات عبر Supabase: الدخول، الاشتراك، الخروج، واستعادة كلمة المرور.
// مكتبة Supabase تُحمَّل عند الحاجة فقط، فلا يتأثر باقي الموقع إن تعذّر تحميلها.
import { SUPABASE_URL, SUPABASE_KEY, GOOGLE_CLIENT_ID } from './config.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const STORAGE_KEY = 'om-auth';
const RETURN_KEY = 'om-return';   // موضع الزائر في الصفحة قبل ذهابه إلى Google، ليعود إليه
const SITE_URL = location.origin + location.pathname;
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

// روابط البريد (تأكيد الحساب / استعادة كلمة المرور) والعودة من Google تأتي والجلسة في الرابط.
// نلتقطها هنا قبل أن يقرأ app.js الرابط، ثم ننظّف الرابط (ونعيد موضع الزائر إن كان عائدًا من Google).
export const callback = readCallback();
function readCallback() {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  const p = h.has('access_token') || h.has('error_description') ? h : q.has('error_description') ? q : null;
  if (!p) return null;
  let back = null;
  try { back = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); } catch {}
  history.replaceState(null, '', location.pathname + (back?.startsWith('#') ? back : ''));
  return { type: p.get('type'), oauth: back !== null, access: p.get('access_token'), refresh: p.get('refresh_token'), error: p.get('error_code') || p.get('error') };
}

const listeners = [];
export const onUser = fn => listeners.push(fn);

let clientPromise = null;
const savedSession = () => { try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; } };
// هل نمرّ عبر المكتبة؟ نعم إن كانت محمّلة أو للزائر جلسة محفوظة (ليُربط نشاطه بحسابه)
export const usesClient = () => authEnabled && (clientPromise !== null || savedSession());

export function client() {
  return clientPromise ??= import(LIB).then(({ createClient }) => {
    const c = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: STORAGE_KEY, flowType: 'implicit', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
    c.auth.onAuthStateChange((event, session) => listeners.forEach(fn => fn(session?.user ?? null, event)));
    return c;
  }).catch(e => { clientPromise = null; throw e; });
}
export const preload = () => { if (authEnabled) client().catch(() => {}); };

// عند فتح الصفحة: لا نحمّل المكتبة إلا إن كان الزائر مسجّلًا من قبل أو عائدًا من رابط بريد
export async function init() {
  if (!authEnabled) return;
  if (!savedSession() && !callback?.access) return;
  const c = await client();
  if (callback?.access) await c.auth.setSession({ access_token: callback.access, refresh_token: callback.refresh });
}

async function db(fn) {
  const { data, error } = await fn(await client());
  if (error) throw error;
  return data;
}
const call = fn => db(c => fn(c.auth));
export const getUser = async () => (await call(a => a.getSession())).session?.user ?? null;
export const myProfile = () => db(c => c.from('profiles').select('full_name, country, is_admin').maybeSingle());
export const rpc = (name, args) => db(c => c.rpc(name, args));
// مفضلة المشترك (الصلاحية في قاعدة البيانات: كلٌّ يرى مفضلته فقط)
export const favorites = {
  list: () => db(c => c.from('favorites').select('rel, title, msg, size, created_at').order('created_at', { ascending: false })),
  add: rows => db(c => c.from('favorites').upsert(rows, { onConflict: 'user_id,rel,title', ignoreDuplicates: true })),
  remove: ({ rel, title }) => db(c => c.from('favorites').delete().match({ rel, title })),
};
export const signIn = (email, password) => call(a => a.signInWithPassword({ email, password }));
export async function signUp({ name, email, pass }) {
  const data = await call(a => a.signUp({ email, password: pass, options: { data: { full_name: name }, emailRedirectTo: SITE_URL } }));
  // البريد المسجّل والمؤكَّد من قبل: يردّ Supabase بنجاح شكلي بلا هويات ولا يرسل رسالة
  if (data.user && !data.session && data.user.identities?.length === 0) throw { code: 'user_already_exists' };
  return data;
}
// الدخول بحساب Google: ينتقل المتصفح إلى جوجل ثم يعود إلى الصفحة نفسها والجلسة في الرابط
export async function signInWithGoogle() {
  try { sessionStorage.setItem(RETURN_KEY, location.hash); } catch {}
  return call(a => a.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE_URL, queryParams: { prompt: 'select_account' } } }));
}

// زر Google الرسمي (Google Identity Services): يتم الدخول في صفحتنا نفسها، فتعرض جوجل عنوان موقعنا
// لا عنوان Supabase، ثم نسلّم هوية جوجل إلى Supabase. أداة جوجل تُحمَّل عند فتح نافذة الدخول فقط.
const GSI = 'https://accounts.google.com/gsi/client';
let gsiPromise = null;
const loadGsi = () => gsiPromise ??= new Promise((resolve, reject) => {
  const s = Object.assign(document.createElement('script'), { src: GSI, async: true });
  s.onload = () => window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('gsi'));
  s.onerror = () => { gsiPromise = null; s.remove(); reject(new Error('gsi')); };
  document.head.append(s);
});
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
// يرسم الزر داخل box. onDone(err) بعد اكتمال الدخول (أو فشله) في Supabase.
export async function renderGoogleButton(box, { dark, width, onDone }) {
  if (!GOOGLE_CLIENT_ID) throw new Error('gsi');
  const id = await loadGsi();
  // رقم يُستعمل مرة واحدة: جوجل تضع بصمته في الهوية، وSupabase يطابقها بالرقم نفسه فلا تُعاد الهوية
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  id.initialize({
    client_id: GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false,
    nonce: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))),
    callback: ({ credential }) => call(a => a.signInWithIdToken({ provider: 'google', token: credential, nonce })).then(() => onDone(), onDone),
  });
  box.replaceChildren();
  id.renderButton(box, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', locale: 'ar', width });
}
export const signOut = () => call(a => a.signOut({ scope: 'local' }));
export const sendReset = email => call(a => a.resetPasswordForEmail(email, { redirectTo: SITE_URL }));
export const setPassword = password => call(a => a.updateUser({ password }));

const ERRORS = {
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  email_not_confirmed: 'لم يُؤكَّد بريدك بعد، افتح رسالة التأكيد التي أرسلناها إليك.',
  user_already_exists: 'هذا البريد مسجّل من قبل، جرّب الدخول.',
  weak_password: 'كلمة المرور ضعيفة، اختر كلمة أطول وأصعب تخمينًا.',
  same_password: 'اختر كلمة مرور مختلفة عن السابقة.',
  email_address_invalid: 'البريد الإلكتروني غير صالح.',
  over_email_send_rate_limit: 'أرسلنا رسائل كثيرة إلى هذا البريد، حاول بعد قليل.',
  over_request_rate_limit: 'محاولات كثيرة، حاول بعد قليل.',
  otp_expired: 'انتهت صلاحية الرابط، اطلب رابطًا جديدًا.',
  access_denied: 'الرابط غير صالح أو انتهت صلاحيته.',
  signup_disabled: 'التسجيل مغلق حاليًا.',
};
export const errorText = e => ERRORS[e?.code] || (e?.status === 429 ? ERRORS.over_request_rate_limit : 'تعذّر إتمام الطلب، تحقق من اتصالك وحاول مرة أخرى.');

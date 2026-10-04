-- قاعدة بيانات «رسائل حوارية»: المشتركون، سجل الاستخدام، الملاحظات، متابعة المدعوين، ودوال الإحصاءات للمشرفين.
-- شغّل الملف كاملًا في Supabase ← SQL Editor. إعادة تشغيله آمنة ولا تحذف بيانات.
-- لجعل حسابٍ مشرفًا (بعد اشتراكه وتأكيد بريده):
--   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'name@example.com');
-- لا يعتمد الملف على خيار «Automatically expose new tables»: كل صلاحية تُمنح صراحةً هنا.

grant usage on schema public to anon, authenticated;

-- 1) المشتركون ---------------------------------------------------------------
-- صف لكل مستخدم يُنشأ تلقائيًا عند الاشتراك من بيانات النموذج (الاسم والدولة).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  country text check (country ~ '^[A-Z]{2}$'),   -- رمز ISO مثل SA
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- المستخدم يقرأ صفه فقط، ولا يعدّل شيئًا (فلا يستطيع منح نفسه صلاحية المشرف)
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}');
begin
  insert into public.profiles (id, full_name, country)
  values (
    new.id,
    left(coalesce(meta ->> 'full_name', ''), 100),
    case when meta ->> 'country' ~ '^[A-Za-z]{2}$' then upper(meta ->> 'country') end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- من اشترك قبل تشغيل هذا الملف
insert into public.profiles (id, full_name, country)
select id,
       left(coalesce(raw_user_meta_data ->> 'full_name', ''), 100),
       case when raw_user_meta_data ->> 'country' ~ '^[A-Za-z]{2}$' then upper(raw_user_meta_data ->> 'country') end
from auth.users
on conflict (id) do nothing;


-- 2) سجل الاستخدام ------------------------------------------------------------
-- كل زائر يُعرَّف برقم عشوائي محفوظ في متصفحه، ويُربط بحسابه إن كان مسجّلًا.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor_id uuid not null,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  type text not null check (type in ('visit', 'start', 'view', 'copy', 'share', 'download', 'feedback')),
  rel text check (char_length(rel) <= 20),          -- مفتاح الدين من RELIGIONS في data.js
  msg smallint check (msg between 1 and 500),        -- رقم الرسالة
  title text check (char_length(title) <= 200),      -- عنوانها وقت القراءة
  size text check (size in ('S', 'M', 'L')),
  channel text check (channel in ('wa', 'tw', 'tg', 'fb')),
  lang text check (char_length(lang) <= 5),
  device text check (device in ('mobile', 'desktop'))
);
create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_user_id_idx on public.events (user_id);
alter table public.events enable row level security;

-- أي زائر يضيف حدثًا (باسمه هو فقط)، ولا أحد يقرأ السجل إلا عبر دوال المشرفين أدناه
drop policy if exists "events: anyone can log" on public.events;
create policy "events: anyone can log" on public.events
  for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));
revoke all on public.events from anon, authenticated;
grant insert on public.events to anon, authenticated;


-- 3) الملاحظات ----------------------------------------------------------------
-- ما يكتبه الزوار في نموذج «إرسال ملاحظة»، ولا يقرؤه أحد إلا المشرفون عبر admin_feedback()
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  name text check (char_length(name) <= 100),
  email text check (char_length(email) <= 200),
  body text not null check (char_length(trim(body)) between 1 and 3000),
  rel text check (char_length(rel) <= 20),
  msg smallint check (msg between 1 and 500),
  title text check (char_length(title) <= 200)
);
create index if not exists feedback_created_at_idx on public.feedback (created_at);
alter table public.feedback enable row level security;

drop policy if exists "feedback: anyone can send" on public.feedback;
create policy "feedback: anyone can send" on public.feedback
  for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;



-- 4) متابعة المدعوين ---------------------------------------------------------
-- كل مشترك يحفظ من يدعوهم (اسم أو لقب فقط) وما أرسله لكل واحد منهم من الرسائل.
-- لا يقرأ هذه البيانات إلا صاحبها، ولا تدخل في دوال المشرفين.
create table if not exists public.invitees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  rel text not null check (char_length(rel) <= 20),            -- مفتاح الدين من RELIGIONS في data.js
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists invitees_user_id_idx on public.invitees (user_id);
alter table public.invitees enable row level security;

drop policy if exists "invitees: own rows" on public.invitees;
create policy "invitees: own rows" on public.invitees
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.invitees from anon, authenticated;
grant select, insert, update, delete on public.invitees to authenticated;

-- كل إرسال لرسالة إلى مدعو: منه يُحسب تقدّمه («4 من 13») وتاريخ آخر رسالة
create table if not exists public.invitee_sends (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  invitee_id uuid not null references public.invitees (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rel text not null check (char_length(rel) <= 20),
  msg smallint not null check (msg between 1 and 500),
  size text check (size in ('S', 'M', 'L')),
  channel text check (channel in ('wa', 'tw', 'tg', 'fb', 'copy', 'download'))
);
create index if not exists invitee_sends_user_id_idx on public.invitee_sends (user_id);
create index if not exists invitee_sends_invitee_id_idx on public.invitee_sends (invitee_id);
alter table public.invitee_sends enable row level security;

drop policy if exists "invitee_sends: read own" on public.invitee_sends;
create policy "invitee_sends: read own" on public.invitee_sends
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "invitee_sends: add to own invitees" on public.invitee_sends;
create policy "invitee_sends: add to own invitees" on public.invitee_sends
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.invitees i where i.id = invitee_id and i.user_id = (select auth.uid())));
revoke all on public.invitee_sends from anon, authenticated;
grant select, insert on public.invitee_sends to authenticated;

-- 5) دوال المشرفين ------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;

-- الإحصاءات مجمّعة لآخر (days) يومًا، أو لكل المدة إن كانت 0
create or replace function public.admin_stats(days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := case when days > 0 then now() - make_interval(days => days) else '-infinity' end;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    with ev as (select * from public.events where created_at >= since)
    select jsonb_build_object(
      'totals', (select jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'visits',   count(*) filter (where type = 'visit'),
        'starts',   count(*) filter (where type = 'start'),
        'views',    count(*) filter (where type = 'view'),
        'shares',   count(*) filter (where type in ('share', 'copy', 'download')),
        'feedback', (select count(*) from public.feedback where created_at >= since)) from ev),
      'users', (select jsonb_build_object('total', count(*), 'new', count(*) filter (where created_at >= since)) from public.profiles),
      'daily', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select (created_at at time zone 'Asia/Riyadh')::date as day,
               count(distinct visitor_id) as visitors,
               count(*) filter (where type = 'view') as views
        from ev group by 1) d),
      'rel',       (select coalesce(jsonb_object_agg(k, n), '{}') from (select rel k, count(*) n from ev where type = 'start' and rel is not null group by 1) x),
      'size',      (select coalesce(jsonb_object_agg(k, n), '{}') from (select size k, count(*) n from ev where type = 'start' and size is not null group by 1) x),
      'lang',      (select coalesce(jsonb_object_agg(k, n), '{}') from (select lang k, count(*) n from ev where type = 'start' and lang is not null group by 1) x),
      'device',    (select coalesce(jsonb_object_agg(k, n), '{}') from (select device k, count(distinct visitor_id) n from ev where type = 'visit' and device is not null group by 1) x),
      'channel',   (select coalesce(jsonb_object_agg(k, n), '{}') from (select coalesce(channel, type) k, count(*) n from ev where type in ('share', 'copy', 'download') group by 1) x),
      'countries', (select coalesce(jsonb_object_agg(k, n), '{}') from (select coalesce(country, '—') k, count(*) n from public.profiles group by 1) x),
      'messages',  (select coalesce(jsonb_agg(m order by m.rel, m.msg), '[]') from (
        select rel, msg,
               (array_agg(title order by created_at desc) filter (where title is not null))[1] as title,
               count(distinct visitor_id) filter (where type = 'view') as readers,
               count(*) filter (where type = 'view') as views,
               count(*) filter (where type in ('share', 'copy', 'download')) as shares
        from ev where rel is not null and msg is not null group by rel, msg) m)
    )
  );
end $$;

-- قائمة المشتركين مع آخر دخول ومجموع نشاطهم
create or replace function public.admin_users()
returns table (id uuid, full_name text, email text, country text, is_admin boolean,
               created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, activity bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, p.full_name, u.email::text, p.country, p.is_admin, p.created_at,
           u.last_sign_in_at, u.email_confirmed_at is not null,
           (select count(*) from public.events e where e.user_id = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

-- الملاحظات أحدثها أولًا، مع بيان إن كان مرسلها مشتركًا
create or replace function public.admin_feedback()
returns table (id bigint, created_at timestamptz, name text, email text, body text,
               rel text, msg smallint, title text, is_user boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.id, f.created_at, f.name, f.email, f.body, f.rel, f.msg, f.title, f.user_id is not null
    from public.feedback f
    order by f.created_at desc
    limit 2000;
end $$;

-- حذف ملاحظة (مثل الرسائل المزعجة)
create or replace function public.admin_delete_feedback(feedback_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.feedback where id = feedback_id;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin(), public.admin_stats(int), public.admin_users(),
  public.admin_feedback(), public.admin_delete_feedback(bigint) from public, anon;
grant execute on function public.is_admin(), public.admin_stats(int), public.admin_users(),
  public.admin_feedback(), public.admin_delete_feedback(bigint) to authenticated;

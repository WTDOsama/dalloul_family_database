-- ============================================================================
-- قاعدة بيانات أيتام عائلة دلول — ملف الإعداد الكامل لقاعدة البيانات
-- Combined database setup (schema + RLS) — Supabase SQL Editor one-paste
-- ملاحظة: هذا الملف هو دمج لـ supabase/migrations/0001 و 0002
-- ============================================================================

-- ============================================================================
-- قاعدة بيانات أيتام عائلة دلول — الهيكل الأساسي (Schema)
-- Migration 0001 — Tables, constraints, indexes, functions, triggers
-- Compatible with Supabase (PostgreSQL 15+)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles — user profiles & roles (linked to Supabase Auth)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  full_name   text not null default '',
  username    text,
  role        text not null default 'pending'
              check (role in ('admin', 'staff', 'viewer', 'pending')),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'ملفات المستخدمين والأدوار: admin / staff / viewer / pending';

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- 2) Helper functions (security definer, used by RLS policies)
--    NOTE: security definer avoids RLS recursion on the profiles table.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from public.profiles where user_id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and is_active
                   from public.profiles where user_id = auth.uid()), false)
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin', 'staff') and is_active
                   from public.profiles where user_id = auth.uid()), false)
$$;

-- Public (safe) check used by the first-admin setup screen.
-- Reveals only whether at least one administrator exists.
create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'admin' and is_active)
$$;

-- ---------------------------------------------------------------------------
-- 3) families — الأسر
-- ---------------------------------------------------------------------------

create sequence if not exists public.families_code_seq start 1000;
grant usage, select on sequence public.families_code_seq to anon, authenticated, service_role;

create table if not exists public.families (
  id              uuid primary key default gen_random_uuid(),
  family_code     text not null default ('FAM-' || nextval('public.families_code_seq')::text),
  name            text not null check (char_length(btrim(name)) between 2 and 200),
  guardian        text,
  phone           text
                  check (phone is null or phone ~ '^(\+970|\+972|0)?5[0-9]{8}$'),
  district        text,
  address         text,
  housing         text check (housing is null or housing in
                  ('house', 'rental', 'relatives', 'tent', 'shelter', 'other')),
  income          text,
  family_members  integer check (family_members is null or family_members >= 1),
  economic_status text check (economic_status is null or economic_status in
                  ('good', 'medium', 'poor', 'verypoor')),
  displaced       text not null default 'no' check (displaced in ('yes', 'no')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null
);

comment on table public.families is 'بيانات الأسر — رمز الأسرة فريد واسم الأسرة فريد (غير حساس لحالة الأحرف)';

create unique index if not exists families_family_code_key on public.families (family_code);
create unique index if not exists families_name_lower_key on public.families (lower(btrim(name)));
create index if not exists families_phone_idx on public.families (phone);
create index if not exists families_district_idx on public.families (district);
create index if not exists families_created_at_idx on public.families (created_at desc);

-- ---------------------------------------------------------------------------
-- 4) orphans — الأيتام
--    family_id references families(id) with ON DELETE RESTRICT so a family
--    cannot be deleted while orphans are still linked to it.
-- ---------------------------------------------------------------------------

create table if not exists public.orphans (
  id                   uuid primary key default gen_random_uuid(),
  orphan_code          text not null check (char_length(btrim(orphan_code)) between 1 and 50),
  full_name            text not null check (char_length(btrim(full_name)) between 3 and 300),
  gender               text not null check (gender in ('male', 'female')),
  birth_date           date
                       check (birth_date is null or birth_date <= current_date),
  family_id            uuid references public.families (id) on delete restrict,
  national_id          text
                       check (national_id is null or national_id ~ '^[0-9]{9}$'),
  status               text not null check (status in ('father', 'mother', 'both')),
  education            text check (education is null or education in
                       ('notstudying', 'kindergarten', 'school', 'other')),
  health               text check (health is null or health in
                       ('healthy', 'ill', 'chronic')),
  notes                text,
  -- ---- الحقول الإضافية المحفوظة من النسخة الأصلية ----
  father_name          text,
  mother_name          text,
  father_death_date    date check (father_death_date is null or father_death_date <= current_date),
  father_death_cause   text,
  mother_death_date    date check (mother_death_date is null or mother_death_date <= current_date),
  mother_death_cause   text,
  original_address     text,
  current_address      text,
  governorate          text,
  city                 text,
  area                 text,
  housing_status       text check (housing_status is null or housing_status in
                       ('house', 'rental', 'relatives', 'tent', 'shelter', 'other')),
  displaced            text not null default 'no' check (displaced in ('yes', 'no')),
  guardian_name        text,
  guardian_relationship text,
  primary_phone        text
                       check (primary_phone is null or primary_phone ~ '^(\+970|\+972|0)?5[0-9]{8}$'),
  alternative_phone    text
                       check (alternative_phone is null or alternative_phone ~ '^(\+970|\+972|0)?5[0-9]{8}$'),
  income_source       text,
  family_members      integer check (family_members is null or family_members >= 1),
  economic_status     text check (economic_status is null or economic_status in
                       ('good', 'medium', 'poor', 'verypoor')),
  general_needs       text,
  school_name         text,
  grade               text,
  health_condition    text,
  has_disability      boolean not null default false,
  disability_type     text,
  required_treatment  text,
  sponsorship_status  text check (sponsorship_status is null or sponsorship_status in
                       ('sponsored', 'unsponsored', 'needs')),
  needs               text[] not null default '{}',
  qr_id               text not null default (
                       'ORPHAN:' || (extract(epoch from clock_timestamp())::bigint)::text
                       || ':' || substr(md5(random()::text), 1, 9)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null
);

comment on table public.orphans is 'بيانات الأيتام — رقم الملف فريد، رقم الهوية فريد عند توفره، معرف QR فريد';

create unique index if not exists orphans_orphan_code_key on public.orphans (orphan_code);
create unique index if not exists orphans_qr_id_key on public.orphans (qr_id);
create unique index if not exists orphans_national_id_key on public.orphans (national_id)
  where national_id is not null;
create index if not exists orphans_full_name_idx on public.orphans (full_name);
create index if not exists orphans_family_id_idx on public.orphans (family_id);
create index if not exists orphans_primary_phone_idx on public.orphans (primary_phone);
create index if not exists orphans_created_at_idx on public.orphans (created_at desc);
create index if not exists orphans_status_idx on public.orphans (status);
create index if not exists orphans_sponsorship_idx on public.orphans (sponsorship_status);
create index if not exists orphans_gender_idx on public.orphans (gender);

-- ---------------------------------------------------------------------------
-- 5) assistance — المساعدات
-- ---------------------------------------------------------------------------

create table if not exists public.assistance (
  id          uuid primary key default gen_random_uuid(),
  orphan_id   uuid not null references public.orphans (id) on delete cascade,
  date        date not null default current_date,
  type        text not null check (type in
              ('material', 'food', 'cash', 'medical', 'education', 'housing', 'other')),
  amount      numeric(12, 2) check (amount is null or amount >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null
);

create index if not exists assistance_orphan_id_idx on public.assistance (orphan_id);
create index if not exists assistance_date_idx on public.assistance (date desc);

-- ---------------------------------------------------------------------------
-- 6) follow_ups — المتابعة
-- ---------------------------------------------------------------------------

create table if not exists public.follow_ups (
  id                  uuid primary key default gen_random_uuid(),
  orphan_id           uuid not null references public.orphans (id) on delete cascade,
  date                date not null default current_date,
  notes               text not null default '',
  next_follow_up_date date check (next_follow_up_date is null or next_follow_up_date >= date),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null
);

create index if not exists follow_ups_orphan_id_idx on public.follow_ups (orphan_id);
create index if not exists follow_ups_date_idx on public.follow_ups (date desc);
create index if not exists follow_ups_next_date_idx on public.follow_ups (next_follow_up_date);

-- ---------------------------------------------------------------------------
-- 7) activity_logs — سجل النشاط / Audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  description text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_user_id_idx on public.activity_logs (user_id);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);
create index if not exists activity_logs_action_idx on public.activity_logs (action);

-- ---------------------------------------------------------------------------
-- 8) updated_at / audit-columns triggers (automatic updated_at handling)
-- ---------------------------------------------------------------------------

create or replace function public.set_row_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
  else
    -- protect immutable audit columns from tampering
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_timestamps on public.profiles;
create trigger trg_profiles_timestamps
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_families_timestamps on public.families;
create trigger trg_families_timestamps
  before insert or update on public.families
  for each row execute function public.set_row_timestamps();

drop trigger if exists trg_orphans_timestamps on public.orphans;
create trigger trg_orphans_timestamps
  before insert or update on public.orphans
  for each row execute function public.set_row_timestamps();

drop trigger if exists trg_assistance_timestamps on public.assistance;
create trigger trg_assistance_timestamps
  before insert or update on public.assistance
  for each row execute function public.set_row_timestamps();

drop trigger if exists trg_follow_ups_timestamps on public.follow_ups;
create trigger trg_follow_ups_timestamps
  before insert or update on public.follow_ups
  for each row execute function public.set_row_timestamps();

-- ---------------------------------------------------------------------------
-- 9) Audit trail triggers (database-level, cannot be bypassed by the client)
-- ---------------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text := tg_table_name;
  v_id     uuid;
  v_label  text;
  v_meta   jsonb;
begin
  if tg_op = 'DELETE' then
    v_id    := old.id;
    v_label := case tg_table_name
                 when 'orphans'     then coalesce(to_jsonb(old) ->> 'full_name', old.id::text)
                 when 'families'    then coalesce(to_jsonb(old) ->> 'name', old.id::text)
                 when 'assistance'  then coalesce(to_jsonb(old) ->> 'type', 'مساعدة')
                 when 'follow_ups'  then 'متابعة'
                 else old.id::text
               end;
    insert into public.activity_logs (user_id, action, entity_type, entity_id, description, metadata)
    values (auth.uid(), 'delete', v_entity, v_id,
            'حذف ' || v_label,
            jsonb_build_object('label', v_label));
    return old;

  elsif tg_op = 'INSERT' then
    v_id    := new.id;
    v_label := case tg_table_name
                 when 'orphans'     then coalesce(to_jsonb(new) ->> 'full_name', new.id::text)
                 when 'families'    then coalesce(to_jsonb(new) ->> 'name', new.id::text)
                 when 'assistance'  then coalesce(to_jsonb(new) ->> 'type', 'مساعدة')
                 when 'follow_ups'  then 'متابعة'
                 else new.id::text
               end;
    insert into public.activity_logs (user_id, action, entity_type, entity_id, description, metadata)
    values (auth.uid(), 'create', v_entity, v_id,
            'إضافة ' || v_label,
            jsonb_build_object('label', v_label));
    return new;

  else -- UPDATE
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;
    v_id := new.id;
    v_label := case tg_table_name
                 when 'orphans'     then coalesce(to_jsonb(new) ->> 'full_name', new.id::text)
                 when 'families'    then coalesce(to_jsonb(new) ->> 'name', new.id::text)
                 when 'assistance'  then coalesce(to_jsonb(new) ->> 'type', 'مساعدة')
                 when 'follow_ups'  then 'متابعة'
                 else new.id::text
               end;
    select jsonb_agg(key) into v_meta
      from jsonb_each(to_jsonb(new)) as kv(key, val)
      where to_jsonb(new) ->> key is distinct from to_jsonb(old) ->> key;
    insert into public.activity_logs (user_id, action, entity_type, entity_id, description, metadata)
    values (auth.uid(), 'update', v_entity, v_id,
            'تعديل ' || v_label,
            jsonb_build_object('label', v_label, 'changed', coalesce(v_meta, '[]'::jsonb)));
    return new;
  end if;
end;
$$;

drop trigger if exists trg_orphans_audit on public.orphans;
create trigger trg_orphans_audit
  after insert or update or delete on public.orphans
  for each row execute function public.audit_row_change();

drop trigger if exists trg_families_audit on public.families;
create trigger trg_families_audit
  after insert or update or delete on public.families
  for each row execute function public.audit_row_change();

drop trigger if exists trg_assistance_audit on public.assistance;
create trigger trg_assistance_audit
  after insert or update or delete on public.assistance
  for each row execute function public.audit_row_change();

drop trigger if exists trg_follow_ups_audit on public.follow_ups;
create trigger trg_follow_ups_audit
  after insert or update or delete on public.follow_ups
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 10) Supabase Auth: auto-create profile on signup (first user = admin)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
begin
  -- أول مستخدم في النظام يصبح مديراً نشطاً تلقائياً (إعداد أولي آمن بدون
  -- أي كلمة مرور مبرمجة مسبقاً). أي تسجيل لاحق يبقى معلقاً حتى يفعّله مدير.
  select not exists (
    select 1 from public.profiles where role = 'admin'
  ) into v_is_first;

  insert into public.profiles (user_id, full_name, username, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    case when v_is_first then 'admin' else 'pending' end,
    v_is_first
  );

  insert into public.activity_logs (user_id, action, entity_type, entity_id, description, metadata)
  values (new.id,
          case when v_is_first then 'admin_initialized' else 'signup' end,
          'profile', new.id,
          case when v_is_first
               then 'إنشاء حساب المدير الأول للنظام'
               else 'تسجيل مستخدم جديد (بانتظار التفعيل)' end,
          jsonb_build_object('email', new.email, 'is_first_admin', v_is_first));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 11) Protect profiles from privilege escalation
--     - users may only edit their own display fields (full_name / username)
--     - only admins may change roles / activation
--     - service role (auth.uid() is null) is always allowed (server-side API)
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- service_role / privileged server context
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if auth.uid() = new.user_id or auth.uid() = old.user_id then
    if new.role      is distinct from old.role
       or new.is_active  is distinct from old.is_active
       or new.user_id    is distinct from old.user_id then
      raise exception 'PRIVILEGE_ESCALATION: لا يمكنك تعديل الصلاحيات أو حالة التفعيل'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'PRIVILEGE_DENIED: ليس لديك صلاحية لتعديل هذا الملف'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_changes();

-- ---------------------------------------------------------------------------
-- 12) Statistics RPCs (single round-trip, aggregate-only, no row data)
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'UNAUTHORIZED: ليس لديك صلاحية'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'totalOrphans',   (select count(*) from public.orphans),
    'males',          (select count(*) from public.orphans where gender = 'male'),
    'females',        (select count(*) from public.orphans where gender = 'female'),
    'fatherOrphans',  (select count(*) from public.orphans where status = 'father'),
    'motherOrphans',  (select count(*) from public.orphans where status = 'mother'),
    'bothOrphans',    (select count(*) from public.orphans where status = 'both'),
    'sponsored',      (select count(*) from public.orphans where sponsorship_status = 'sponsored'),
    'unsponsored',    (select count(*) from public.orphans where sponsorship_status = 'unsponsored'),
    'needsSponsor',   (select count(*) from public.orphans where sponsorship_status = 'needs'),
    'totalFamilies',  (select count(*) from public.families),
    'displaced',      (select count(*) from public.orphans where displaced = 'yes'),
    'totalAssistance',(select count(*) from public.assistance),
    'totalFollowUps', (select count(*) from public.follow_ups),
    'needsHelp',      (select count(*) from public.orphans
                       where sponsorship_status in ('unsponsored', 'needs'))
  );
end;
$$;

create or replace function public.get_statistics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'UNAUTHORIZED: ليس لديك صلاحية'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'gender', jsonb_build_object(
      'male',   (select count(*) from public.orphans where gender = 'male'),
      'female', (select count(*) from public.orphans where gender = 'female')
    ),
    'orphanStatus', jsonb_build_object(
      'father', (select count(*) from public.orphans where status = 'father'),
      'mother', (select count(*) from public.orphans where status = 'mother'),
      'both',   (select count(*) from public.orphans where status = 'both')
    ),
    'sponsorship', jsonb_build_object(
      'sponsored',   (select count(*) from public.orphans where sponsorship_status = 'sponsored'),
      'unsponsored', (select count(*) from public.orphans where sponsorship_status = 'unsponsored'),
      'needs',       (select count(*) from public.orphans where sponsorship_status = 'needs')
    ),
    'ageGroups', jsonb_build_object(
      'g0_5',   (select count(*) from public.orphans
                 where birth_date is not null
                   and extract(year from age(birth_date)) between 0 and 5),
      'g6_12',  (select count(*) from public.orphans
                 where birth_date is not null
                   and extract(year from age(birth_date)) between 6 and 12),
      'g13_18', (select count(*) from public.orphans
                 where birth_date is not null
                   and extract(year from age(birth_date)) between 13 and 18),
      'g18p',   (select count(*) from public.orphans
                 where birth_date is not null
                   and extract(year from age(birth_date)) > 18)
    ),
    'education', jsonb_build_object(
      'notstudying', (select count(*) from public.orphans where education = 'notstudying'),
      'kindergarten',(select count(*) from public.orphans where education = 'kindergarten'),
      'school',      (select count(*) from public.orphans where education = 'school'),
      'other',       (select count(*) from public.orphans where education = 'other')
    ),
    'health', jsonb_build_object(
      'healthy', (select count(*) from public.orphans where health = 'healthy'),
      'ill',     (select count(*) from public.orphans where health = 'ill'),
      'chronic', (select count(*) from public.orphans where health = 'chronic')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 13) Realtime publication (safe to re-run)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['orphans', 'families', 'assistance', 'follow_ups', 'activity_logs']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;      -- already in publication
      when undefined_object then null;      -- publication missing (non-Supabase env)
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14) Grants
-- ---------------------------------------------------------------------------

grant execute on function public.admin_exists() to anon, authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
grant execute on function public.get_statistics() to authenticated;
revoke execute on function public.get_my_role() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_staff_or_admin() from anon;
revoke execute on function public.is_active_user() from anon;


-- ============================================================================
-- قاعدة بيانات أيتام عائلة دلول — سياسات الأمان على مستوى الصفوف (RLS)
-- Migration 0002 — Row Level Security policies
--
-- القواعد المطبقة:
--   * المجهول (anon) لا يستطيع قراءة أو كتابة أي بيانات حساسة.
--   * viewer      : قراءة فقط (بحث/فلترة/عرض).
--   * staff       : قراءة + إضافة + تعديل (بدون حذف، بدون إدارة مستخدمين).
--   * admin       : كل الصلاحيات.
--   * سجل النشاط : مشاهدة للمدير فقط، إدراج للسجل الخاص بالمستخدم فقط،
--                  ولا يمكن لأي مستخدم تعديله أو حذفه.
--   * الحسابات غير المفعّلة (pending / is_active=false) لا ترى أي بيانات.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- (note: Supabase's service_role already carries BYPASSRLS, and the
--  security-definer audit/trigger functions run as the table owner which is
--  not subject to RLS unless FORCE is set — so we must NOT force it.)
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.families      enable row level security;
alter table public.orphans       enable row level security;
alter table public.assistance    enable row level security;
alter table public.follow_ups    enable row level security;
alter table public.activity_logs enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- لا يوجد سياسة INSERT للمستخدمين العاديين:
-- يتم إنشاء الملفات تلقائياً عبر trigger بأمان، أو عبر المدير من الـ API.

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
  -- الحماية من تصعيد الصلاحيات تُطبَّق أيضاً عبر trg_profiles_protect

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- families — الأسر
-- ---------------------------------------------------------------------------
drop policy if exists "families_select_active" on public.families;
create policy "families_select_active"
  on public.families for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "families_insert_staff" on public.families;
create policy "families_insert_staff"
  on public.families for insert
  to authenticated
  with check (public.is_staff_or_admin());

drop policy if exists "families_update_staff" on public.families;
create policy "families_update_staff"
  on public.families for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "families_delete_admin" on public.families;
create policy "families_delete_admin"
  on public.families for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- orphans — الأيتام
-- ---------------------------------------------------------------------------
drop policy if exists "orphans_select_active" on public.orphans;
create policy "orphans_select_active"
  on public.orphans for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "orphans_insert_staff" on public.orphans;
create policy "orphans_insert_staff"
  on public.orphans for insert
  to authenticated
  with check (public.is_staff_or_admin());

drop policy if exists "orphans_update_staff" on public.orphans;
create policy "orphans_update_staff"
  on public.orphans for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "orphans_delete_admin" on public.orphans;
create policy "orphans_delete_admin"
  on public.orphans for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- assistance — المساعدات
-- ---------------------------------------------------------------------------
drop policy if exists "assistance_select_active" on public.assistance;
create policy "assistance_select_active"
  on public.assistance for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "assistance_insert_staff" on public.assistance;
create policy "assistance_insert_staff"
  on public.assistance for insert
  to authenticated
  with check (public.is_staff_or_admin());

drop policy if exists "assistance_update_staff" on public.assistance;
create policy "assistance_update_staff"
  on public.assistance for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "assistance_delete_admin" on public.assistance;
create policy "assistance_delete_admin"
  on public.assistance for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- follow_ups — المتابعة
-- ---------------------------------------------------------------------------
drop policy if exists "follow_ups_select_active" on public.follow_ups;
create policy "follow_ups_select_active"
  on public.follow_ups for select
  to authenticated
  using (public.is_active_user());

drop policy if exists "follow_ups_insert_staff" on public.follow_ups;
create policy "follow_ups_insert_staff"
  on public.follow_ups for insert
  to authenticated
  with check (public.is_staff_or_admin());

drop policy if exists "follow_ups_update_staff" on public.follow_ups;
create policy "follow_ups_update_staff"
  on public.follow_ups for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "follow_ups_delete_admin" on public.follow_ups;
create policy "follow_ups_delete_admin"
  on public.follow_ups for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- activity_logs — سجل النشاط
--   * المشاهدة: للمدير فقط.
--   * الإدراج: لأي مستخدم مفعّل، لسجله هو فقط (دخول/خروج/تصدير...).
--   * لا توجد سياسات UPDATE / DELETE: لا يمكن لأحد تعديل السجل أو حذفه
--     عبر واجهة قاعدة البيانات (المدير يقرأ فقط).
-- ---------------------------------------------------------------------------
drop policy if exists "activity_logs_select_admin" on public.activity_logs;
create policy "activity_logs_select_admin"
  on public.activity_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "activity_logs_insert_own" on public.activity_logs;
create policy "activity_logs_insert_own"
  on public.activity_logs for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

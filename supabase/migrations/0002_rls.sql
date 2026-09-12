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

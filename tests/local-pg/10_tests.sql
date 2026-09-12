-- ===========================================================================
-- قاعدة بيانات أيتام عائلة دلول — اختبارات قاعدة البيانات والأمان (RLS)
-- يُشغَّل محلياً عبر tests/local-pg/run.sh — يحاكي مستخدمين بأدوار مختلفة
-- ويتحقق من كل سياسة أمان وقيود وتحويلات (triggers).
-- ===========================================================================

-- ---------------------------------------------------------------- helpers --
create schema if not exists tests;

create or replace function tests.assert(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'ASSERT FAILED: %', p_msg;
  end if;
end $$;

create or replace function tests.expect_error(p_sql text, p_label text, p_code text default null)
returns void language plpgsql as $$
declare
  v_err   boolean := false;
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_err   := true;
    v_state := sqlstate;
  end;
  if not v_err then
    raise exception 'ASSERT FAILED (expected error but succeeded): %', p_label;
  end if;
  if p_code is not null and v_state is distinct from p_code then
    raise exception 'ASSERT FAILED (code % instead of %): %', v_state, p_code, p_label;
  end if;
end $$;

grant usage on schema tests to public;
grant execute on all functions in schema tests to public;

-- fixed test identities
-- admin  : 11111111-1111-1111-1111-111111111111
-- staff  : 22222222-2222-2222-2222-222222222222
-- viewer : 33333333-3333-3333-3333-333333333333
-- pending: 44444444-4444-4444-4444-444444444444

-- ========================================================== A) First admin ==
-- A1: before any user exists, admin_exists() must be false (setup screen)
set role anon;
select tests.assert(public.admin_exists() = false, 'A1 admin_exists=false on fresh DB');
reset role;

-- A2: first auth user automatically becomes an active administrator
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@daloul.ps');
select tests.assert(
  (select role from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'admin',
  'A2a first user is admin');
select tests.assert(
  (select is_active from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = true,
  'A2b first user is active');
select tests.assert(
  (select count(*) from public.activity_logs where action = 'admin_initialized') = 1,
  'A2c admin_initialized logged');

-- A3: subsequent signups stay pending & inactive until an admin approves them
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'staff@daloul.ps'),
  ('33333333-3333-3333-3333-333333333333', 'viewer@daloul.ps'),
  ('44444444-4444-4444-4444-444444444444', 'pending@daloul.ps');
select tests.assert(
  (select count(*) from public.profiles where role = 'pending') = 3,
  'A3a later signups are pending');
select tests.assert(
  (select count(*) from public.profiles where role = 'pending' and is_active) = 0,
  'A3b pending users inactive');

-- A4: admin_exists() now true, visible even to anon
set role anon;
select tests.assert(public.admin_exists() = true, 'A4 admin_exists=true after setup');
reset role;

-- ==================================== B) Admin API (service_role) activates ==
-- simulates the server-side /api/admin/users endpoint
set role service_role;
update public.profiles set role = 'staff',  is_active = true where user_id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'viewer', is_active = true where user_id = '33333333-3333-3333-3333-333333333333';
reset role;
select tests.assert(
  (select role from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') = 'staff',
  'B1 staff activated');

-- ===================================================== C) Anonymous blocked ==
set role anon;
select count(*) as n from public.orphans \gset
select tests.assert(:n = 0, 'C1 anon cannot read orphans');
select count(*) as n from public.families \gset
select tests.assert(:n = 0, 'C2 anon cannot read families');
select count(*) as n from public.activity_logs \gset
select tests.assert(:n = 0, 'C3 anon cannot read activity logs');
select count(*) as n from public.profiles \gset
select tests.assert(:n = 0, 'C4 anon cannot read profiles');
select tests.expect_error(
  $q$insert into public.orphans (orphan_code, full_name, gender, status) values ('HACK', 'مخترق وهمي', 'male', 'father')$q$,
  'C5 anon insert blocked', '42501');
select tests.expect_error($q$select public.get_dashboard_stats()$q$, 'C6 rpc blocked for anon');
reset role;

-- ======================================================= D) Pending blocked ==
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select count(*) as n from public.orphans \gset
select tests.assert(:n = 0, 'D1 pending user cannot read orphans');
select tests.expect_error(
  $q$insert into public.families (name) values ('أسرة اختراق')$q$,
  'D2 pending user insert blocked', '42501');
select tests.expect_error($q$select public.get_dashboard_stats()$q$, 'D3 rpc blocked for pending');
reset role;
reset request.jwt.claims;

-- ========================================================== E) Admin CRUD ==
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.families (name, guardian, phone, district, address, housing, income,
                             family_members, economic_status, displaced, notes)
values ('عائلة دلول - خليل', 'محمد خليل دلول', '0598111222', 'نابلس',
        'قرية شمال نابلس', 'rental', 'أعمال موسمية', 6, 'poor', 'yes', 'أسرة بحاجة لدم دائم');
select id as fam1, family_code as fam1_code from public.families where name = 'عائلة دلول - خليل' \gset

select tests.assert(:'fam1_code' like 'FAM-%', 'E1 family_code auto-generated');

insert into public.orphans (orphan_code, full_name, gender, birth_date, family_id, national_id,
                            status, education, health, sponsorship_status, primary_phone,
                            guardian_name, needs)
values ('A-001', 'أحمد محمد خليل دلول', 'male', '2015-03-15', :'fam1'::uuid, '123456789',
        'father', 'school', 'healthy', 'sponsored', '0598111222',
        'محمد خليل دلول', array['food', 'clothes']);
select id as orph1 from public.orphans where orphan_code = 'A-001' \gset

select tests.assert(
  (select created_by from public.orphans where id = :'orph1'::uuid)
    = '11111111-1111-1111-1111-111111111111'::uuid,
  'E2 created_by stamped automatically');
select tests.assert(
  (select needs from public.orphans where id = :'orph1'::uuid) = array['food','clothes'],
  'E3 needs array roundtrip');

select updated_at as upd_before from public.orphans where id = :'orph1'::uuid \gset
update public.orphans set notes = 'تحديث تجريبي' where id = :'orph1'::uuid;
select updated_at as upd_after from public.orphans where id = :'orph1'::uuid \gset
select tests.assert(:'upd_after' > :'upd_before', 'E4 updated_at advances automatically');

select count(*) as n from public.profiles \gset
select tests.assert(:n = 4, 'E5 admin sees all profiles');

select count(*) as n from public.activity_logs \gset
select tests.assert(:n >= 5, 'E6 admin reads activity logs');

select public.get_dashboard_stats() as stats \gset
select tests.assert((:'stats'::jsonb->>'totalOrphans')::int = 1, 'E7 dashboard stats totalOrphans');
select tests.assert((:'stats'::jsonb->>'totalFamilies')::int = 1, 'E8 dashboard stats totalFamilies');

select public.get_statistics() as st \gset
select tests.assert((:'st'::jsonb->'gender'->>'male')::int = 1, 'E9 statistics gender');

-- admin can change another user's role through their own session too
update public.profiles set role = 'viewer', is_active = true
 where user_id = '44444444-4444-4444-4444-444444444444';
select tests.assert(
  (select role from public.profiles where user_id = '44444444-4444-4444-4444-444444444444') = 'viewer',
  'E10 admin manages roles');
reset role;
reset request.jwt.claims;

-- =========================================================== F) Staff role ==
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- F1 staff can create
insert into public.families (name, guardian, phone, district, family_members, economic_status)
values ('عائلة عبد الله', 'سارة عبد الله', '0599333444', 'طولكرم', 4, 'medium');
select id as fam2 from public.families where name = 'عائلة عبد الله' \gset

insert into public.orphans (orphan_code, full_name, gender, birth_date, family_id, status,
                            sponsorship_status, alternative_phone)
values ('A-002', 'مريم أحمد عبد الله', 'female', '2012-07-20', :'fam2'::uuid, 'both', 'needs', '+970599333444');
select id as orph2 from public.orphans where orphan_code = 'A-002' \gset

-- F2 staff can update
update public.orphans set sponsorship_status = 'sponsored' where id = :'orph2'::uuid;
select tests.assert(
  (select sponsorship_status from public.orphans where id = :'orph2'::uuid) = 'sponsored',
  'F2 staff update allowed');

-- F3 staff CANNOT delete (policy exists for admin only → silent no-op)
delete from public.orphans where id = :'orph2'::uuid;
select tests.assert(
  (select count(*) from public.orphans where id = :'orph2'::uuid) = 1,
  'F3 staff delete blocked (row intact)');

-- F4 staff sees only own profile
select count(*) as n from public.profiles \gset
select tests.assert(:n = 1, 'F4 staff sees only own profile');

-- F5 staff can update own display name but NOT escalate role / re-activate
update public.profiles set full_name = 'موظف التسجيل' where user_id = '22222222-2222-2222-2222-222222222222';
select tests.assert(
  (select full_name from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') = 'موظف التسجيل',
  'F5a staff updates own display name');
select tests.expect_error(
  $q$update public.profiles set role = 'admin' where user_id = '22222222-2222-2222-2222-222222222222'$q$,
  'F5b self-escalation blocked', '42501');

-- F6 staff cannot modify other users' profiles (silent no-op via RLS)
update public.profiles set role = 'admin' where user_id = '44444444-4444-4444-4444-444444444444';
reset role;
reset request.jwt.claims;
select tests.assert(
  (select role from public.profiles where user_id = '44444444-4444-4444-4444-444444444444') = 'viewer',
  'F6 staff cannot touch other profiles');
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- F7 staff cannot read audit logs
select count(*) as n from public.activity_logs \gset
select tests.assert(:n = 0, 'F7 staff cannot read audit logs');

-- F8 staff can insert only their own activity log entries
insert into public.activity_logs (user_id, action, entity_type, description)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'login', 'auth', 'تسجيل دخول');
select tests.expect_error(
  format($q$insert into public.activity_logs (user_id, action, entity_type, description)
         values (%L::uuid, 'login', 'auth', 'تزوير')$q$,
         '11111111-1111-1111-1111-111111111111'),
  'F8 staff cannot forge another user''s log', '42501');

-- F9 nobody can update/delete audit logs (even attempt as staff)
update public.activity_logs set description = 'محاولة تلاعب';
delete from public.activity_logs;
reset role;
reset request.jwt.claims;
select tests.assert(
  (select count(*) from public.activity_logs) > 0,
  'F9 audit logs tamper-proof');
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- F10 immutable audit columns survive staff edit attempts
update public.orphans set created_at = '2000-01-01', created_by = null, updated_by = null
 where id = :'orph2'::uuid;
select tests.assert(
  (select created_by from public.orphans where id = :'orph2'::uuid)
    = '22222222-2222-2222-2222-222222222222'::uuid,
  'F10 created_by/updated_by immutable');

-- F11 staff can run statistics RPCs
select public.get_dashboard_stats() as stf \gset
select tests.assert((:'stf'::jsonb->>'totalOrphans')::int = 2, 'F11 staff dashboard stats');
reset role;
reset request.jwt.claims;

-- ========================================================= G) Viewer role ==
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select count(*) as n from public.orphans \gset
select tests.assert(:n = 2, 'G1 viewer can read orphans');
select count(*) as n from public.families \gset
select tests.assert(:n = 2, 'G2 viewer can read families');
select public.get_dashboard_stats() as vst \gset
select tests.assert((:'vst'::jsonb->>'totalOrphans')::int = 2, 'G3 viewer statistics');

select tests.expect_error(
  $q$insert into public.orphans (orphan_code, full_name, gender, status) values ('V-1', 'اسم اختبار للمشاهد', 'male', 'father')$q$,
  'G4 viewer insert blocked', '42501');

select updated_at as upd_before from public.orphans where id = :'orph1'::uuid \gset
update public.orphans set notes = 'محاولة تعديل من مشاهد' where id = :'orph1'::uuid;
select updated_at as upd_after from public.orphans where id = :'orph1'::uuid \gset
select tests.assert(:'upd_after' = :'upd_before', 'G5 viewer update blocked');

delete from public.orphans;
select tests.assert(
  (select count(*) from public.orphans) = 2,
  'G6 viewer delete blocked');

select tests.expect_error(
  $q$update public.profiles set role = 'admin' where user_id = '33333333-3333-3333-3333-333333333333'$q$,
  'G7 viewer self-escalation blocked', '42501');
reset role;
reset request.jwt.claims;

-- ================================= H) Constraints & referential integrity ==
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- H1 duplicate orphan_code
select tests.expect_error(
  format($q$insert into public.orphans (orphan_code, full_name, gender, status, family_id)
         values ('A-001', 'اسم مكرر للرقم نفسه', 'male', 'father', %L::uuid)$q$, :'fam1'),
  'H1 duplicate orphan_code rejected', '23505');

-- H2 duplicate national_id
select tests.expect_error(
  format($q$insert into public.orphans (orphan_code, full_name, gender, status, national_id, family_id)
         values ('A-100', 'يتيم باختبار تكرار الهوية', 'male', 'father', '123456789', %L::uuid)$q$, :'fam1'),
  'H2 duplicate national_id rejected', '23505');

-- H3 invalid national_id (must be exactly 9 digits)
select tests.expect_error(
  format($q$insert into public.orphans (orphan_code, full_name, gender, status, national_id, family_id)
         values ('A-101', 'يتيم برقم هوية قصير', 'male', 'father', '12345678', %L::uuid)$q$, :'fam1'),
  'H3 invalid national_id rejected', '23514');

-- H4 future birth date
select tests.expect_error(
  format($q$insert into public.orphans (orphan_code, full_name, gender, status, birth_date, family_id)
         values ('A-102', 'يتيم بتاريخ مستقبلي', 'male', 'father', '2100-01-01', %L::uuid)$q$, :'fam1'),
  'H4 future birth_date rejected', '23514');

-- H5 invalid phone
select tests.expect_error(
  format($q$insert into public.orphans (orphan_code, full_name, gender, status, primary_phone, family_id)
         values ('A-103', 'يتيم برقم جوال خاطئ', 'male', 'father', '12345', %L::uuid)$q$, :'fam1'),
  'H5 invalid phone rejected', '23514');

-- H6 valid Palestinian phone formats accepted
insert into public.orphans (orphan_code, full_name, gender, status, primary_phone, alternative_phone, family_id)
values ('A-104', 'يتيم فحص أرقام الجوال', 'male', 'father', '0598123456', '+972598123456', :'fam1'::uuid);
select id as orph3 from public.orphans where orphan_code = 'A-104' \gset
delete from public.orphans where id = :'orph3'::uuid;
select tests.assert(
  (select count(*) from public.orphans where orphan_code = 'A-104') = 0,
  'H6 valid phone formats accepted then deleted by admin');

-- H7 invalid gender
select tests.expect_error(
  $q$insert into public.orphans (orphan_code, full_name, gender, status) values ('A-105', 'اسم لفحص الجنس', 'x', 'father')$q$,
  'H7 invalid gender rejected', '23514');

-- H8 invalid family reference
select tests.expect_error(
  $q$insert into public.orphans (orphan_code, full_name, gender, status, family_id)
     values ('A-106', 'اسم لمرجع أسرة غير موجود', 'male', 'father',
             '99999999-9999-9999-9999-999999999999'::uuid)$q$,
  'H8 invalid family_id rejected', '23503');

-- H9 duplicate family name (case-insensitive)
select tests.expect_error(
  $q$insert into public.families (name) values ('عائلة دلول - خليل')$q$,
  'H9a duplicate family name rejected', '23505');
insert into public.families (name) values ('عائلة Test Family');
select tests.expect_error(
  $q$insert into public.families (name) values ('عائلة TEST family')$q$,
  'H9b case-insensitive family uniqueness', '23505');
delete from public.families where name = 'عائلة Test Family';

-- H10 cannot delete a family that still has orphans (FK RESTRICT)
select tests.expect_error(
  format($q$delete from public.families where id = %L::uuid$q$, :'fam1'),
  'H10 family delete blocked while orphans linked', '23503');

-- H11 family deletion succeeds when no orphans linked
insert into public.families (name) values ('عائلة مؤقتة للاختبار');
delete from public.families where name = 'عائلة مؤقتة للاختبار';
select tests.assert(
  (select count(*) from public.families where name = 'عائلة مؤقتة للاختبار') = 0,
  'H11 empty family deletable by admin');

-- H12 orphan delete cascades assistance & follow-ups
insert into public.assistance (orphan_id, date, type, amount, notes)
values (:'orph2'::uuid, current_date, 'food', 250.50, 'سلة غذائية');
insert into public.follow_ups (orphan_id, date, notes, next_follow_up_date)
values (:'orph2'::uuid, current_date, 'زيارة ميدانية', current_date + 30);
delete from public.orphans where id = :'orph2'::uuid;
select tests.assert(
  (select count(*) from public.assistance where orphan_id = :'orph2'::uuid) = 0
  and (select count(*) from public.follow_ups where orphan_id = :'orph2'::uuid) = 0,
  'H12 assistance/follow-ups cascade on orphan delete');

-- H13 invalid assistance type rejected
select tests.expect_error(
  format($q$insert into public.assistance (orphan_id, type) values (%L::uuid, 'gold')$q$, :'orph1'),
  'H13 invalid assistance type rejected', '23514');

-- H14 updated_at on profiles advances
select updated_at as pupd_before from public.profiles
 where user_id = '11111111-1111-1111-1111-111111111111' \gset
update public.profiles set full_name = 'مدير النظام الرئيسي'
 where user_id = '11111111-1111-1111-1111-111111111111';
select updated_at as pupd_after from public.profiles
 where user_id = '11111111-1111-1111-1111-111111111111' \gset
select tests.assert(:'pupd_after' > :'pupd_before', 'H14 profiles updated_at advances');
reset role;
reset request.jwt.claims;

-- ======================================================== I) Audit trail ==
select tests.assert(
  (select count(*) from public.activity_logs where action = 'create' and entity_type = 'orphans') >= 2,
  'I1 orphan creates audited');
select tests.assert(
  (select count(*) from public.activity_logs where action = 'update' and entity_type = 'orphans') >= 2,
  'I2 orphan updates audited');
select tests.assert(
  (select count(*) from public.activity_logs where action = 'delete' and entity_type = 'orphans') >= 1,
  'I3 orphan deletes audited');
select tests.assert(
  (select count(*) from public.activity_logs where action = 'create' and entity_type = 'families') >= 2,
  'I4 family creates audited');
select tests.assert(
  (select count(*) = 1 from public.activity_logs
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and action = 'login'),
  'I5 login events recorded');
select tests.assert(
  (select bool_and(user_id is not null) from public.activity_logs
    where action in ('create','update','delete')),
  'I6 db-triggered audit rows carry the acting user');

-- audit metadata for updates lists changed columns only
select tests.assert(
  (select count(*) from public.activity_logs
    where action = 'update' and entity_type = 'orphans'
      and metadata ? 'changed') >= 1,
  'I7 update metadata contains changed columns');

-- ================================= J) Cross-checks with service_role (API) ==
set role service_role;
-- J1 the server-side admin API can read profiles (bypasses RLS legitimately)
select count(*) as n from public.profiles \gset
select tests.assert(:n = 4, 'J1 service_role lists all profiles');
reset role;

-- J2 RPCs must reject calls without a user session (service/anon context)
select tests.expect_error($q$select public.get_dashboard_stats()$q$,
  'J2 rpc rejects session-less caller');

-- J3 final data sanity (as the admin user)
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.get_dashboard_stats() as fin \gset
reset role;
reset request.jwt.claims;
select tests.assert((:'fin'::jsonb->>'totalOrphans')::int = 1, 'J3 final orphan count');
select tests.assert((:'fin'::jsonb->>'totalFamilies')::int = 2, 'J4 final family count');
select tests.assert((:'fin'::jsonb->>'males')::int = 1 and (:'fin'::jsonb->>'females')::int = 0, 'J5 gender counts');

select tests.assert(
  (select count(*) from public.activity_logs) >= 15,
  'J6 rich audit trail accumulated');

-- ============================================================
--  roles.sql — إضافة دور «إداري» (manager) + مزامنة دوال RLS
-- ============================================================
--  هذا الملف آمن لإعادة التشغيل (idempotent).
--  المحتوى نفسه مدمج الآن داخل supabase-migration.sql للمشاريع الجديدة.
--  شغّله على أي قاعدة قديمة لو لسه القيد/الدوال مش محدثة.
--
--  جدول الأدوار بعد التنفيذ:
--     admin   → مدير النظام  : كل حاجة
--     manager → إداري        : كل حاجة غير إعدادات النظام
--     ops     → تشغيل        : يعدّل في تبويب الفحص فقط
--     view    → مشاهدة       : عرض فقط
-- ============================================================


-- ------------------------------------------------------------
-- 1) توسيع القيد ليشمل «إداري»
-- ------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'ops', 'view'));


-- ------------------------------------------------------------
-- 2) دوال RLS — «إداري» يعدّل زي المدير، بس مش إعدادات النظام
-- ------------------------------------------------------------
create or replace function public.yahma_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.yahma_is_ops_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager', 'ops')
  );
$$;

create or replace function public.yahma_sees_all_branches()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'manager')
        or (p.role in ('ops', 'view') and nullif(btrim(p.branch_name), '') is null)
      )
  );
$$;

create or replace function public.yahma_manages_all_branches()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'manager')
        or (p.role = 'ops' and nullif(btrim(p.branch_name), '') is null)
      )
  );
$$;

create or replace function public.yahma_manage_branch()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(btrim(p.branch_name), '')
  from public.profiles p
  where p.id = auth.uid()
    and p.role in ('ops', 'manager', 'view')
$$;

create or replace function public.yahma_read_branch()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(btrim(p.branch_name), '')
  from public.profiles p
  where p.id = auth.uid()
    and p.role in ('ops', 'view', 'manager')
$$;

create or replace function public.yahma_can_access_branch(vehicle_branch text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.yahma_is_admin()
    or public.yahma_sees_all_branches()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('ops', 'view', 'manager')
        and branch_name is not null
        and trim(branch_name) = trim(coalesce(vehicle_branch, ''))
    );
$$;

create or replace function public.yahma_can_manage_branch(vehicle_branch text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.yahma_is_admin()
    or public.yahma_manages_all_branches()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('ops', 'manager')
        and branch_name is not null
        and trim(branch_name) = trim(coalesce(vehicle_branch, ''))
    );
$$;


-- ------------------------------------------------------------
-- 3) سياسة تحديث profiles — تسمح بدور manager
-- ------------------------------------------------------------
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.yahma_is_admin())
with check (role in ('admin', 'manager', 'ops', 'view'));


-- ------------------------------------------------------------
-- 4) مراجعة
-- ------------------------------------------------------------
select role, count(*) from public.profiles group by role order by role;

select pg_get_constraintdef(oid) as new_check
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';
-- لازم يطلع: role = ANY (ARRAY['admin','manager','ops','view'])

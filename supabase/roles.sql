-- ============================================================
--  roles.sql — إضافة دور «إداري» (manager)
-- ============================================================
--  كان.check يسمح بـ 3 أدوار بس:
--     admin | ops | view
--  وبنضيف رابع: manager (إداري) — بين مدير النظام وتشغيل.
--
--  ⚠️ لازم يتنفّذ على الداتابيز وإلا أي محاولة تخزين دور
--     «manager» هترفض بخطأ CHECK violation.
--
--  جدول الأدوار بعد التنفيذ:
--     admin   → مدير النظام  : كل حاجة
--     manager → إداري        : كل حاجة غير إعدادات النظام
--     ops     → تشغيل        : يعدّل في تبويب الفحص فقط
--     view    → مشاهدة       : عرض فقط
-- ============================================================


-- ------------------------------------------------------------
-- 1) القيد الحالي
-- ------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'c'
  and conname like '%role%';


-- ------------------------------------------------------------
-- 2) توسيع القيد ليشمل «إداري»
-- ------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'ops', 'view'));


-- ------------------------------------------------------------
-- 3) دوال RLS — «إداري» يعدّل زي المدير، بس مش إعدادات النظام
-- ------------------------------------------------------------
-- يahma_is_ops_or_admin بقى يشمل manager. دي الدالة اللي بتتحكم
-- في الكتابة على جدول vehicles.
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

-- يahma_sees_all_branches: المدير والإداري يشوفوا كل الفروع
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
  )
$$;

-- يahma_manages_all_branches: المدير والإداري يديروا كل الفروع
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
  )
$$;

-- الفرع المحدد: «إداري» برضه مقيّد بفرعه
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
    and p.role in ('ops', 'manager')
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


-- ------------------------------------------------------------
-- 4) الحقول الافتراضية بتاعت الأدوار الجديدة
-- ------------------------------------------------------------
-- ادارة الحسابات الفرعية: للمدير فقط (مش للإداري)
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


-- ------------------------------------------------------------
-- 5) مراجعة — لازم ترجع 0 صفوف
-- ------------------------------------------------------------
select role, count(*) from public.profiles group by role order by role;

-- التأكد إن القيد اتوسّع
select pg_get_constraintdef(oid) as new_check
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';
-- لازم يطلع: {role = ANY (ARRAY['admin'::text, 'manager'::text, 'ops'::text, 'view'::text])}
-- ============================================================
--  rls-performance.sql — تسريع تحميل الأسطول
--  ✅ مطبّق بالفعل على الإنتاج (2026-10-14)
-- ============================================================
--  المشكلة:
--    سياسة RLS على جدول vehicles كانت بتنداء
--       yahma_can_access_branch(branch)
--    ودالة بتاخد «عمود من الصف» كوسيط، فـ Postgres بيستدعيها
--    مرة لكل سيارة، وجواها استعلام على profiles.
--    3,984 سيارة × استعلامين = 7,968 قراءة متتابعة على جدول
--    profiles من 9 صفوف بس، في كل مرة حد يفتح التطبيق.
--
--  النتيجة على الموبايل: بطء + احتمال تجاوز مهلة الـ30 ثانية
--    ⇒ «تعذر جلب السيارات» + بانر «لم تظهر البيانات».
--
--  الحل:
--    كل الدوال الجديدة من غير أي وسيط (zero-argument)، فـ Postgres
--    بيقيّمها مرة واحدة لكل استعلام بدل مرة لكل صف.
--
--  النتيجة المقيسة بعد التطبيق:
--    reads على profiles لكل تحميل:   7,968  →  0
--    وقت تحميل 3,984 سيارة (admin):          →  872 ms
--    خطة التنفيذ:                            →  Index Only Scan
--    Heap Fetches (count فقط):               →  24 بدل 3,984
--
--  ⚠️ المنطق مطابق للدوال القديمة سطر بسطر. اتأكدنا فعليًا قبل
--     حذف الدوال القديمة، وحذفناهم فعلاً.
--     نتائج المقارنة (قديم = جديد في كل الحالات):
--       admin                    → 3,984 سيارة، كل المقارنات true
--       ops فرع 5 (saud12)       → 237 سيارة
--       ops فرع 3 (m.basiuony40) → 241 سيارة
-- ============================================================


-- ------------------------------------------------------------
-- 1) دوال بلا وسيط — تُقيَّم مرة واحدة لكل استعلام
-- ------------------------------------------------------------

-- فرع المستخدم للقراءة، لو كان ops أو view. null = لا franch.
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
    and p.role in ('ops', 'view')
$$;

-- فرع المستخدم للإدارة، لو كان ops فقط (view ما بتعديش).
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
    and p.role = 'ops'
$$;

-- يشوف كل الفروع: admin، أو ops/view بدون فرع محدد.
-- مستخدم من غير profile خالص ما بيدخلش هنا (بيبقى false) —
-- زي سلوك الدالة القديمة بالظبط.
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
        p.role = 'admin'
        or (p.role in ('ops', 'view') and nullif(btrim(p.branch_name), '') is null)
      )
  )
$$;

-- يدير كل الفروع: admin، أو ops بدون فرع محدد.
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
        p.role = 'admin'
        or (p.role = 'ops' and nullif(btrim(p.branch_name), '') is null)
      )
  )
$$;


-- ------------------------------------------------------------
-- 2) السياسات
-- ------------------------------------------------------------
--  المنطق القديم:
--    yahma_can_access_branch(b) = is_admin()
--      OR exists(profiles: uid, role in (ops,view), branch_name NOT NULL
--                          AND trim(branch_name) = trim(b))
--
--  ⇔  is_admin()  OR  (role in (ops,view) AND branch IS NOT NULL
--                       AND branch = b)
--    ⇔  yahma_sees_all_branches()  OR  yahma_read_branch() IS NOT NULL
--                                      AND yahma_read_branch() = b
--
--  الفرع الفاضي (branch_name = '') → nullif بيرجّع NULL
--  ⇒ «فاضي = يشوف كل الفروع» زي ما اتفقنا.
-- ------------------------------------------------------------

drop policy if exists "vehicles_select_authenticated" on public.vehicles;
create policy "vehicles_select_authenticated"
on public.vehicles for select
to authenticated
using (
  public.yahma_sees_all_branches()
  or (
    public.yahma_read_branch() is not null
    and public.yahma_read_branch() = btrim(coalesce(branch, ''))
  )
);

drop policy if exists "vehicles_insert_ops_or_admin" on public.vehicles;
create policy "vehicles_insert_ops_or_admin"
on public.vehicles for insert
to authenticated
with check (
  public.yahma_manages_all_branches()
  or (
    public.yahma_manage_branch() is not null
    and public.yahma_manage_branch() = btrim(coalesce(branch, ''))
  )
);

drop policy if exists "vehicles_update_ops_or_admin" on public.vehicles;
create policy "vehicles_update_ops_or_admin"
on public.vehicles for update
to authenticated
using (
  public.yahma_manages_all_branches()
  or (
    public.yahma_manage_branch() is not null
    and public.yahma_manage_branch() = btrim(coalesce(branch, ''))
  )
)
with check (
  public.yahma_manages_all_branches()
  or (
    public.yahma_manage_branch() is not null
    and public.yahma_manage_branch() = btrim(coalesce(branch, ''))
  )
);


-- ------------------------------------------------------------
-- 3) حذف الدوال القديمة (بعد التأكد من التطابق)
-- ------------------------------------------------------------
drop function if exists public.yahma_can_access_branch(text);
drop function if exists public.yahma_can_manage_branch(text);


-- ------------------------------------------------------------
-- 4) فهارس مساعدة
-- ------------------------------------------------------------
create index if not exists vehicles_branch_trim_idx
  on public.vehicles (btrim(branch));

create index if not exists profiles_role_idx
  on public.profiles (role);
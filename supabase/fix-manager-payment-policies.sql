-- =====================================================================
--  إصلاح: حساب «إداري» مش قادر ينقل سيارة بين التبويبات
--
--  الأعراض: الإداري بينقل السيارة (مثلاً من «تحت الدفع» لـ«تم الدفع»)،
--  الشاشة بتتغيّر، وبعد الـrefresh السيارة بترجع مكانها زي الأول.
--
--  السبب — اتأكدنا منه بجلسة «إداري» حقيقية على القاعدة الحيّة:
--    insert / update / delete على inspection_payments  →  42501
--    «new row violates row-level security policy»
--  يعني سياسات الجدول في القاعدة الحيّة بتحصر الكتابة في admin/ops
--  ومش شايفة manager — مع إن دالة yahma_is_ops_or_admin() نفسها
--  بترجّع true للإداري، والكتابة في جدول vehicles شغالة عادي.
--  النتيجة: النقل بيتحفظ في المتصفح بس، وأول ريفرش بيرجع للقديم.
--
--  الحل: نمسح كل سياسات الجدول (أي نسخة قديمة بأي اسم) ونعيد بناء
--  الأربعة بقائمة أدوار صريحة فيها manager.
--  آمن للتشغيل أكتر من مرة — مفيش أي تغيير في البيانات.
--
--  التشغيل: Supabase → SQL Editor → الصق الملف كله → Run
-- =====================================================================

-- 0) ضمان إن الدالة نفسها بتشمل «إداري»
--    (مش بنعتمد عليها في السياسات تحت، بس بنوحّدها)
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

-- 1) مسح أي سياسة قديمة على الجدول (بأي اسم كان)
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'inspection_payments'
  loop
    execute format('drop policy if exists %I on public.inspection_payments', pol.policyname);
  end loop;
end $$;

-- 2) القراءة: كل من سجّل دخول (زي الأول بالظبط)
create policy "inspection_payments_select_authenticated"
  on public.inspection_payments for select
  to authenticated
  using (true);

-- 3) الكتابة: admin + manager + ops
create policy "inspection_payments_insert_admin_ops"
  on public.inspection_payments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'ops')
    )
  );

create policy "inspection_payments_update_admin_ops"
  on public.inspection_payments for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'ops')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'ops')
    )
  );

create policy "inspection_payments_delete_admin_ops"
  on public.inspection_payments for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'ops')
    )
  );

-- 4) تحقق: لازم تطلع 4 سياسات، وكل واحدة فيها manager في qual/with_check
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'inspection_payments'
order by cmd;

-- إضافة تبويب "المستخدمون" (users) لأي حساب مدير نظام.
-- السبب: الـallowed_tabs المخزّن اتكتب قبل ما التبويب يتعمل، فالمدير
-- كان بيشوف كل الأقسام إلا تبويب إدارة المستخدمين نفسه.
-- ملاحظة: لازم service_role + claim عشان yahma_guard_profile_columns يسمح.
-- (الملف ده idempotent — تشغيله تاني مبيعملش حاجة.)

begin;
  select set_config('request.jwt.claims', '{"role":"service_role","email":"service@local"}', true);
  set local role service_role;

  update profiles
     set allowed_tabs = (
       select array(
         select t from unnest(coalesce(allowed_tabs, ARRAY[]::text[])) t
         where t <> 'users'
         union all
         select 'users'
       )
     )
   where role = 'admin'
     and not ('users' = any(coalesce(allowed_tabs, ARRAY[]::text[])));
commit;

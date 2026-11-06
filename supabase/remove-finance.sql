-- =====================================================================
--  Yahma: حذف تبويب وبيانات المالية نهائياً
--  شغّل هذا الملف في Supabase → SQL Editor
-- =====================================================================

begin;
  -- تفعيل صلاحيات service_role لتجاوز حراس تعديل جداول profiles
  select set_config('request.jwt.claims', '{"role":"service_role","email":"service@local"}', true);
  set local role service_role;

  -- 1. حذف جدول اليومية المالية وبياناته وفهارسه وسياساته نهائياً
  drop table if exists public.finance_daily_journal cascade;

  -- 2. تنظيف صلاحيات المستخدمين بحذف 'finance' من allowed_tabs
  update public.profiles
     set allowed_tabs = array_remove(allowed_tabs, 'finance')
   where 'finance' = any(coalesce(allowed_tabs, array[]::text[]));

commit;

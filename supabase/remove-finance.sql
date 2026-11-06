-- =====================================================================
--  Yahma: حذف تبويب وبيانات المالية نهائياً
--  شغّل هذا الملف في Supabase → SQL Editor (بدون تبديل Role)
-- =====================================================================

-- 1. حذف جدول اليومية المالية وبياناته وفهارسه وسياساته نهائياً
drop table if exists public.finance_daily_journal cascade;

-- 2. إزالة تبويب 'finance' من صلاحيات المستخدمين في profiles
alter table public.profiles disable trigger yahma_guard_profile_columns;

update public.profiles
   set allowed_tabs = array_remove(allowed_tabs, 'finance')
 where 'finance' = any(coalesce(allowed_tabs, array[]::text[]));

alter table public.profiles enable trigger yahma_guard_profile_columns;

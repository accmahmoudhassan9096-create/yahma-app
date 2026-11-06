-- =====================================================================
--  Yahma: حذف تبويب وصلاحيات التنازلات نهائياً
--  شغّل هذا الملف في Supabase → SQL Editor (بدون تبديل Role)
-- =====================================================================

-- إزالة تبويب 'transfers' من صلاحيات المستخدمين في profiles
alter table public.profiles disable trigger yahma_guard_profile_columns;

update public.profiles
   set allowed_tabs = array_remove(allowed_tabs, 'transfers')
 where 'transfers' = any(coalesce(allowed_tabs, array[]::text[]));

alter table public.profiles enable trigger yahma_guard_profile_columns;

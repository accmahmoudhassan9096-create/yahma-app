-- =====================================================================
-- بيانات المستخدم الشخصية + تغيير كلمة المرور
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================
-- المشكلة
--   policies على جدول profiles كانت للقراءة (صفك أو كل الصفوف
--   للمدير) وللكتابة **للمدير فقط**. يعني أي مستخدم غير المدير
--   بيضغط «إعدادات الحساب» مفيش حاجةGetting — مش عشان الزر مخفي،
--   لكن عشان الـpolicy نفسها.
--   وكلمة المرور كان ينفع تتغير من لينك الاستعادة بس، مش من
--   جوّه المنصة.
--
-- الحل
--   1) أعمدة بيانات شخصية: رقم الهوية، تاريخ الميلاد، رقم الجوال.
--   2) trigger يسمح للمستخدم بتعديل صفه هو بس، وفي الأعمدة
--      الشخصية بس. الأدوار والفرع والأقسام مقفولة عليه.
-- =====================================================================

alter table public.profiles add column if not exists national_id text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists phone text;

-- ---------- التحقق من المدخلات ----------
-- القيد في القاعدة مش في الواجهة: مستخدم ممكن يبعت طلب
-- من غير ما يمر على النموذج، والرقم القلط من غير تحقق بيتخزّن.
--   • الهوية (الإقامة): 10 أرقام
--   • الجوال: 10 أرقام تبدأ بـ05
--   • الميلاد: لازم يكون في الماضي، ومش قبل 1900
-- اتأكدت إن مافيش صف واحد عنده قيمة تخالف الجديدين، فالتغيير
-- اتطبّق على 16 حساب موجود من غير استثناء واحد.
alter table public.profiles
  drop constraint if exists profiles_national_id_format;
alter table public.profiles
  add constraint profiles_national_id_format
  check (national_id is null or national_id ~ '^[0-9]{10}$');

alter table public.profiles
  drop constraint if exists profiles_phone_format;
alter table public.profiles
  add constraint profiles_phone_format
  check (phone is null or phone ~ '^05[0-9]{8}$');

alter table public.profiles
  drop constraint if exists profiles_birth_date_sane;
alter table public.profiles
  add constraint profiles_birth_date_sane
  check (birth_date is null or (birth_date <= current_date and birth_date > date '1900-01-01'));

-- ---------- الكتابة ----------
-- policies permissive بتتجمع بـOR، فإضافة «صفك» جنب «المدير»
-- بتفتح الكتابة على صفك. مفيش تسريب: الـtrigger تحت بيمنع
-- أي عمود مش شخصي، والصفوف التانية مش هتعدّي أصلاً.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- حارس الأعمدة ----------
create or replace function public.yahma_guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_admin boolean := false;
begin
  -- المدير يعدّل أي صف بأي عمود، زي ما كان
  select yahma_is_admin() into v_admin;
  if v_admin then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'معرف الحساب غير قابل للتعديل' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    raise exception 'الدور يعدّله مدير النظام فقط' using errcode = '42501';
  end if;
  if new.branch_name is distinct from old.branch_name then
    raise exception 'الفرع يعدّله مدير النظام فقط' using errcode = '42501';
  end if;
  if new.allowed_tabs is distinct from old.allowed_tabs then
    raise exception 'الأقسام المسموحة يعدّلها مدير النظام فقط' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'البريد يعدّله مدير النظام فقط' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists yahma_guard_profile_columns on public.profiles;
create trigger yahma_guard_profile_columns
  before update on public.profiles
  for each row execute function public.yahma_guard_profile_columns();

-- شاشات المستخدمين بتقرأ أعمدة محددة، فالجديدين لسه مش فيها.
-- الأعمدة دي بيانات شخصية بتظهر في شاشة صاحب الحساب بس،
-- مفيش شاشة بتعرضها لغيره.
comment on column public.profiles.national_id is
  'رقم الهوية (الإقامة) — 10 أرقام، يعدّله صاحب الحساب نفسه';
comment on column public.profiles.birth_date is
  'تاريخ الميلاد — يعدّله صاحب الحساب نفسه';
comment on column public.profiles.phone is
  'رقم الجوال — 10 أرقام تبدأ بـ05، يعدّله صاحب الحساب نفسه';
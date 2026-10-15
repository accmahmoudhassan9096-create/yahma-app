-- =====================================================================
-- قالب رسالة الترحيب: تُرسل تلقائيًا لكل حساب جديد
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================
-- ليش جدول أصلاً؟
--   رسالة الترحيب كانت مكتوبة **جوه كود الـEdge Function**. المدير
--   مكانش يقدر يغيّر كلمة ولا رابط ولا يضيف اسم الفرع، وأي تعديل
--   كان معناه إعادة نشر للـfunction.
--
--   هنا النص في جدول: المدير يفتح «رسالة الترحيب» من لوحة إدارة
--   المستخدمين، يعدّل، يpreview، ويحفظ. الـfunction تقرأ الصف عند
--   كل حساب جديد.
--
-- صف واحد بس (id = 1) — مش جدول قوالب، جدول إعداد.
-- =====================================================================

create table if not exists public.welcome_template (
  id          int primary key default 1,
  subject     text not null default 'تم إنشاء حسابك في منصة يهماء',
  body        text not null default '',
  enabled     boolean not null default true,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  -- يمنع أي صف ثاني: القالب مفرد مش قائمة
  constraint welcome_template_singleton check (id = 1)
);

alter table public.welcome_template enable row level security;

-- القراءة والكتابة من الـEdge Function فقط (service role).
-- المتصفح ممنوع يكتب — يعدّل النص لازم يعدّي على function بتتحقق
-- من الدور، عشان محدش غير المدير يعدّل نص بيوصل لكل مستخدم جديد.
-- مفيش سياسات RLS على الجدول عمدًا: من غير سياسة أي select من
-- anon أو authenticated بيفشل، وده اللي عايزينه بالظبط.

comment on table public.welcome_template is
  'نص رسالة الترحيب للحسابات الجديدة — يُعدّله المدير من لوحة المستخدمين فقط';

-- الصف الافتراضي. body فاضي عمدًا: الـfunction فيه نص احتياطي كامل
-- لو الصف مش موجود، فالإدراج الفاضي ده مش بيكسر حاجة.
insert into public.welcome_template (id, subject, body)
values (1, 'تم إنشاء حسابك في منصة يهماء', '')
on conflict (id) do nothing;
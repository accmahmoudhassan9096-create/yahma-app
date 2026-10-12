-- =====================================================================
-- إيميلات الفروع: تقرير الفحص الأسبوعي لكل فرع
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================

create table if not exists public.branch_contacts (
  branch_name text primary key,
  email       text not null,
  phone       text,
  active      boolean not null default true,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.branch_contacts enable row level security;

-- القراءة للمستخدمين المسجّلين (لعرض الجدول داخل المنصة)
drop policy if exists "branch contacts read" on public.branch_contacts;
create policy "branch contacts read"
  on public.branch_contacts for select
  to authenticated
  using (true);

-- الكتابة من دالة Edge Function فقط (service role) — لا نسمح للعميل بالكتابة مباشرة

comment on table public.branch_contacts is
  'بريد كل فرع لاستقبال تقرير الفحص الأسبوعي (يُرسل من send-user-email)';
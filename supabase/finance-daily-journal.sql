-- =====================================================================
--  Yahma: Daily Finance Journal (اليومية المالية السحابية)
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================

create table if not exists public.finance_daily_journal (
  id              uuid primary key default gen_random_uuid(),
  entry_id        text,                               -- رقم السند
  branch_seq      text,                               -- تسلسل الفرع
  branch_name     text,                               -- اسم الفرع
  entry_date      date not null,                      -- التاريخ (YYYY-MM-DD)
  entry_datetime  text,                               -- التاريخ والوقت كاملاً
  client_id       text,                               -- هوية العميل
  client_name     text,                               -- اسم العميل
  plate           text,                               -- رقم اللوحة
  movement_type   text,                               -- نوع الحركة (تمديد عقد، تصفية، مقدم...)
  op_type         text,                               -- نوع العملية
  category        text,                               -- الفئة (إيرادات، مصروفات)
  amount_in       numeric not null default 0,         -- قبض
  amount_out      numeric not null default 0,         -- صرف
  contract_no     text,                               -- رقم العقد
  paper_contract  text,                               -- العقد الورقي
  description     text,                               -- البيان
  pay_method      text,                               -- طريقة الدفع
  account_name    text,                               -- من حساب
  is_approved     boolean default true,               -- معتمد
  auth_no         text,                               -- رقم الموافقة
  created_by_user text,                               -- أضيف بواسطة
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- فهارس للبحث السريع
create index if not exists finance_daily_journal_date_idx on public.finance_daily_journal (entry_date desc);
create index if not exists finance_daily_journal_plate_idx on public.finance_daily_journal (plate);
create index if not exists finance_daily_journal_branch_idx on public.finance_daily_journal (branch_name);

-- تفعيل أمان الصفوف RLS
alter table public.finance_daily_journal enable row level security;

-- القراءة متاحة لكل المستخدمين المسجلين
drop policy if exists "finance_journal_select" on public.finance_daily_journal;
create policy "finance_journal_select" on public.finance_daily_journal
  for select to authenticated using (true);

-- الإضافة متاحة للمستخدمين المسجلين
drop policy if exists "finance_journal_insert" on public.finance_daily_journal;
create policy "finance_journal_insert" on public.finance_daily_journal
  for insert to authenticated with check (true);

-- الحذف للمدير والإداري فقط
drop policy if exists "finance_journal_delete" on public.finance_daily_journal;
create policy "finance_journal_delete" on public.finance_daily_journal
  for delete to authenticated using (public.yahma_is_ops_or_admin());

comment on table public.finance_daily_journal is
  'اليومية المالية السحابية — تخزين الحركات المالية اليومية المرفوعة من ملفات Excel';

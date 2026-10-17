-- =====================================================================
--  Yahma: سجل الاستئجارات (rentals)
-- ---------------------------------------------------------------------
--  ليش الجدول ده؟
--
--  التقارير كانت بتقرأ العمود `renteddays` في `vehicles` — رقم واحد
--  لكل سيارة بيتكتب فوق نفسه كل شهر. النتيجة: 3,984 سيارة عندها
--  صفر، فالتقرير بيقول «0% استغلال · 0 إيراد» — مش ناقص بيانات،
--  بيانات غلط. والأسوأ إنك لو سجّلت رقم الشهر ده وعدّلت السعر بعد
--  كده، إيراد الشهر اللي فات بيتغيّر — المستند بيتعاد كتابته.
--
--  الجدول ده بيخزّن **عملية استئجار واحدة** بتاريخاتها:
--      من تاريخ … إلى تاريخ (أو لسه شغّال)
--  فالتقرير بيحسب من السجل مش من رقم مصقول:
--      • أي فترة زمنية تختارها في التقرير بتطلع صح
--      • تغيير سعر اليوم بعد كده ما بيغيّرش إيراد قديم
--      • تاريخ كل عملية محفوظ، ففيه فضل استرجاع
--
--  الفوترة: يومي (عدد الأيام × سعر اليوم) — زي ما اتفق.
--  سعر اليوم بيتنسخ على السجل وقت التسجيل (daily_rate) — وده
--  مقصود، مش تكرار: لو غيرنا السعر بعد كده، لازم التقرير القديم
--  يفضل زي ما كان.
--
--  حالة السيارة: تسجيل استئجار بيحط «مؤجرة» على السيارة.
--  الحالة القديمة بتتخزن في `prev_status` عشان نعرف نرجّعها
--  لو المستخدم عايز (مش تلقائي — القرار له).
--
--  Run this once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.rentals (
  id          uuid primary key default gen_random_uuid(),
  car_id      text not null,
  plate       text,
  branch      text,
  start_date  date not null,
  -- null = لسه شغّال (مش محدد تاريخ نهاية)
  end_date    date,
  -- لقطة السعر وقت التسجيل — انظر شرح الجدول فوق
  daily_rate  numeric not null default 0 check (daily_rate >= 0),
  note        text,
  -- حالة السيارة قبل ما نحط «مؤجرة» — عشان نقدر نرجّعها بإذن
  prev_status text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  -- تاريخ النهاية لازم يكون بعد البداية. القيد ده بيمسك الإدخال
  -- الغلط في القاعدة، مش في الواجهة بس — لأن الواجهة بتتفوت
  -- والصف بيفضل غلط ومحدش بيعرف.
  constraint rentals_dates_ordered check (end_date is null or end_date >= start_date)
);

-- الاستعلام المتكرر: «استئجارات فترة معيّنة»
create index if not exists rentals_start_idx
  on public.rentals (start_date desc);

-- والاستعلام التاني: «تاريخ السيارة دي»
create index if not exists rentals_car_idx
  on public.rentals (car_id, start_date desc);

alter table public.rentals enable row level security;

-- ============================================================
--  السياسات
-- ============================================================
--  زي `vehicles` بالظبط: datasource الفرع هو نفسه، والإيراد
--  بيانات حسّاس زي الأسطول نفسه — مش لكل مدير فرع يشوف فرع غيره.
drop policy if exists "rentals_select_authenticated" on public.rentals;
create policy "rentals_select_authenticated"
  on public.rentals for select
  to authenticated
  using (public.yahma_can_access_branch(branch));

drop policy if exists "rentals_insert_admin_ops" on public.rentals;
create policy "rentals_insert_admin_ops"
  on public.rentals for insert
  to authenticated
  with check (public.yahma_can_manage_branch(branch));

drop policy if exists "rentals_update_admin_ops" on public.rentals;
create policy "rentals_update_admin_ops"
  on public.rentals for update
  to authenticated
  using (public.yahma_can_manage_branch(branch))
  with check (public.yahma_can_manage_branch(branch));

-- الحذف للمدير بس — نفس `vehicles_delete_admin`:
-- حذف استئجار بيمسح من التاريخ، وده قرار إداري مش تشغيلي.
drop policy if exists "rentals_delete_admin" on public.rentals;
create policy "rentals_delete_admin"
  on public.rentals for delete
  to authenticated
  using (public.yahma_is_admin());

grant select, insert, update, delete on public.rentals to authenticated;

-- keep updated_at fresh
create or replace function public.touch_rentals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rentals_touch on public.rentals;
create trigger rentals_touch
  before update on public.rentals
  for each row execute function public.touch_rentals();

-- ============================================================
--  allowed_tabs — التبويب الجديد لازم يوصل لكل حساب قايم
-- ============================================================
--  ⚠️ التنبيه في supabase-migration.sql:119 بيحدّث الصفوف اللي
--  allowed_tabs بتاعها NULL بس. الحسابات الموجودة عندنا اتعملها
--  من أول، فالتحديث ده لوحده مش هيوصّلها — لازم array_append صريح.
do $$
declare
  v_added integer;
begin
  update public.profiles
     set allowed_tabs = array_append(allowed_tabs, 'rentals')
   where not ('rentals' = any(allowed_tabs));
  get diagnostics v_added = row_count;
  raise notice 'rentals: allowed_tabs اتضاف ل % حساب', v_added;
end $$;
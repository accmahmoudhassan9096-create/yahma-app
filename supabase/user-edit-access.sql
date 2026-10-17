-- =====================================================================
--Allow branch users to enter and edit their data
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- =====================================================================
-- المشكلة
--   yahma_manage_branch() كانت ترجّع NULL لدور «view»، وسياسات
--   vehicles_insert_* / vehicles_update_* بتشترط قيمتها — فحساب
--   «مشاهدة» كان ممنوع عليه الإدخال والتعديل رغم إنه مرتبط بفرع
--   وشايف أسطول فرعه.العزل بالفرع مبني وصح، والدور بس مش داخله.
--
-- الحل
--   1) نضيف 'view' للدور فيفتح الإدخال والتعديل داخل نطاق الفرع بس.
--   2) trigger يمنع الأعمدة المحمية لدور «مشاهدة».
--
-- ليه trigger مش GRANT على أعمدة؟
--   GRANT UPDATE (قائمة أعمدة) بيشيل الصلاحية عن **كل** من في
--   authenticated — يعني الإداري والتشغيل هيبقوا مش قادرين يعدّلوا
--   اللوحة ولا السعر، لأن Postgres ما بيفرّقش بين مستخدمين في نفس
--   الـrole. وفيه كمان مساران Contrerasural يكتبوا مباشرة
--   (offline-queue.js و data.js) — لو شيلنا UPDATE كان لازم نعدّلهم.
--   الـtrigger بيشتغل من ورا أي كتابة: upsert أو RPC أو نداء مباشر
--   من كود متلاعب، ويرفض بنفس القاعدة.
-- =====================================================================

-- ---------- 1) فتح الدور داخل نطاق الفرع ----------
create or replace function public.yahma_manage_branch()
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select nullif(btrim(p.branch_name), '')
  from public.profiles p
  where p.id = auth.uid() and p.role in ('ops','manager','view')
$fn$;

-- ---------- 2) اللوحة الفاضية كانت بتخفي السيارة ----------
-- saveData بيعمل filter(row => row.plate)، فسيارة بلوحة فاضية مش
-- بتتخزّن في السحابة خالص ومن غير رسالة خطأ. القيد ده بيحوّل
-- الخطأ الصامت لرسالة واضحة من القاعدة.
alter table public.vehicles
  drop constraint if exists vehicles_plate_not_blank;
alter table public.vehicles
  add constraint vehicles_plate_not_blank
  check (char_length(btrim(coalesce(plate,''))) > 0);

-- ---------- 3) حارس الأعمدة ----------
-- ملاحظة عن data: عمود واحد فيه نسخة من كل الحقول. سايبينه مفتوح
--   عن قصد — بعد إصلاح ترتيب الدمج في fromVehicleRow العمود هو
--   المرجع، فأي قيمة مزروعة جواه ما بتظهرش. الحقول اللي مالها
--   عمود أصلا (نوع الهيكل، GPS، رقم الشاسيه…) بيانات وصفية مش
--   حساسة، وأنا قفلت كل العمود منها.
create or replace function public.yahma_guard_car_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_role text;
  v_bad  text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'view' then
    return new;
  end if;

  /* أعمدة البنية مقفولة على أي دور — دي مفاتيح هوية الصف،
     ولما تتغير بتبطّل ربط السيارة بطلبات الدفع وبصور الملف. */
  if new.car_id is distinct from old.car_id
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'أعمدة هوية السجل غير قابلة للتعديل'
      using errcode = '42501';
  end if;

  /* أعمدة محمية لدور المشاهدة: الهوية، المال، والفرع.
     بالترتيب عشان الرسالة تطلع بأول مخالفة مش عشوائية. */
  v_bad := null;
  if new.plate           is distinct from old.plate           then v_bad := 'رقم اللوحة';   end if;
  if new.brand           is distinct from old.brand           then v_bad := 'الماركة';       end if;
  if new.type            is distinct from old.type            then v_bad := 'النوع';         end if;
  if new.model           is distinct from old.model           then v_bad := 'الموديل';       end if;
  if new.year            is distinct from old.year            then v_bad := 'سنة الصنع';     end if;
  if new.serial          is distinct from old.serial          then v_bad := 'الرقم التسلسلي'; end if;
  if new.accountno       is distinct from old.accountno       then v_bad := 'رقم الحاسب الآلي'; end if;
  if new.companyname     is distinct from old.companyname     then v_bad := 'اسم الشركة';   end if;
  if new.ownernumber     is distinct from old.ownernumber     then v_bad := 'رقم المالك';     end if;
  if new.owner           is distinct from old.owner           then v_bad := 'المالك';         end if;
  if new.branch          is distinct from old.branch          then v_bad := 'الفرع';          end if;
  if new.carstatus       is distinct from old.carstatus       then v_bad := 'حالة السيارة';   end if;
  if new.dailyrate       is distinct from old.dailyrate       then v_bad := 'سعر اليوم';      end if;
  if new.renteddays      is distinct from old.renteddays      then v_bad := 'أيام التأجير';   end if;
  if new.maintenancecost is distinct from old.maintenancecost then v_bad := 'تكلفة الصيانة';  end if;
  if new.prep_final      is distinct from old.prep_final      then v_bad := 'المراجعة النهائية'; end if;
  if new.prep_final_note is distinct from old.prep_final_note then v_bad := 'ملاحظة المراجعة'; end if;
  if new.prep_tasks      is distinct from old.prep_tasks      then v_bad := 'مهام التجهيز';    end if;

  if v_bad is not null then
    raise exception '«%» غير مسموح بتعديله من حساب «مشاهدة»', v_bad
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists yahma_guard_car_columns on public.vehicles;
create trigger yahma_guard_car_columns
  before update on public.vehicles
  for each row execute function public.yahma_guard_car_columns();

comment on function public.yahma_guard_car_columns() is
  'يمنع حساب «مشاهدة» من تعديل الهوية والمال والفرع — يعمل مع أي مسار كتابة';
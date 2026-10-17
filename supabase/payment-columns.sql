/* ===== عمودان جديدان على السيارة: رقم الحاسب الآلي + اسم الشركة =====

   مطلوبين في تبويب «تحت الدفع» جنب الرقم التسلسلي والملاحظات.

   • accountno  = «رقم الحاسب الآلي» — رقم الدفتر داخلي.
   • companyname = «اسم الشركة» — مستقل عن «المالك»؛ اتنين
     بيتسجلوا مع بعض («المالك» = اسم الشخص، «الشركة» = الكيان).

   ⚠️ added if not exists عشان الملف يتطبق أكتر من مرة.

   ⚠️ مهم: الحارس yahma_guard_car_columns بيقفل أعمدة الهوية والمال
   والفرع على دور «مشاهدة». الحقلين الجديدين من أعمدة الهوية
   (زي serial و owner بالظبط)، فلازم يدخلوا نفس القائمة — من غير
   كده «مشاهدة» يقدر يعدّلهم من غير الواجهة.

   ⚠️ الأعمدة nullable من غير default. الـCHECK على serial موجود
   في user-edit-access.sql (شاسيه 17 رقم) — ما بنعملش CHECK على
   الحقلين الجديدين لأن «رقم الحاسب» بيجي بأشكال مختلفة (رقم
   حساب، رقم فاتورة، كود داخلي)، والقيد الغلط هنا هيمنع تسجيل
   بيانات صحيحة. */

alter table public.vehicles add column if not exists accountno text;
alter table public.vehicles add column if not exists companyname text;

comment on column public.vehicles.accountno is
  'رقم الحاسب الآلي — رقم الدgjeter الداخلي، يعدّله المدير';
comment on column public.vehicles.companyname is
  'اسم الشركة — مستقل عن المالك، يعدّله المدير';


/* ===== إعادة تعريف الحارس مع الحقلين الجديدين =====

   نفس الدالة الموجودة في user-edit-access.sql، والحقلين الجديدين
   مضافين لقائمة أعمدة «مشاهدة». الاستثناء بتاع service_role
   موجود وبيحمي دوال الحافة — من غيره الدالة مش بتعمل ولا عملية. */

create or replace function public.yahma_guard_car_columns()
returns trigger
language plpgsql
security definer
set search_path = 'public'
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

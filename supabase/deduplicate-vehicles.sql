-- ==============================================================================
-- سكربت فحص وحذف السيارات المكررة في جدول vehicles
-- 
-- كيفية الاستخدام في Supabase SQL Editor:
-- 1. افتح صفحة SQL Editor في مشروع Supabase الخاص بك.
-- 2. الصق هذا الكود كاملاً واضغط Run.
-- 3. وضع التشغيل الافتراضي أدناه هو (v_dry_run := true) للتجربة وعرض المكررات فقط بأمان.
-- 4. بعد مراجعة التقرير والتأكد من المكررات، غيّر v_dry_run := false واضغط Run للتنفيذ الفعلي.
-- ==============================================================================

-- أولاً: استعراض جميع السيارات المكررة حسب رقم اللوحة (مع توحيد المسافات والهمزات والأرقام)
with normalized as (
  select 
    id,
    car_id,
    plate,
    brand,
    model,
    branch,
    updated_at,
    lower(
      regexp_replace(
        translate(
          coalesce(plate, ''),
          'إأآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'ااااهي01234567890123456789'
        ),
        '[\s\-_ً-ْ]', '', 'g'
      )
    ) as norm_plate
  from public.vehicles
  where coalesce(trim(plate), '') <> ''
),
dup_plates as (
  select norm_plate
  from normalized
  group by norm_plate
  having count(*) > 1
)
select 
  n.norm_plate as "رقم اللوحة الموحد",
  count(*) over (partition by n.norm_plate) as "عدد التكرار",
  n.id as "معرف السيارة id",
  n.car_id as "معرف car_id",
  n.plate as "اللوحة الأصلية",
  n.brand as "الماركة",
  n.model as "الموديل",
  n.branch as "الفرع",
  n.updated_at as "تاريخ التحديث"
from normalized n
join dup_plates d on n.norm_plate = d.norm_plate
order by n.norm_plate, n.updated_at desc, n.id desc;


-- ==============================================================================
-- ثانياً: كتلة المعالجة التلقائية وحذف المكررات مع دمج البيانات وحماية السجلات المرتبطة
-- ==============================================================================
do $$
declare
  -- ============================================================================
  -- ⚠️ تنبيه هام:
  -- اجعل هذه القيمة false للتنفيذ الفعلي وحذف المكررات نهائياً.
  -- عند إبقائها true لن يتم حذف أي شيء وستظهر فقط رسائل الفحص في تبويب Messages.
  -- ============================================================================
  v_dry_run boolean := false; 

  v_dup_groups int := 0;
  v_deleted_cars int := 0;
  r record;
  v_keeper_id bigint;
  v_keeper_car_id text;
  v_dup_ids bigint[];
  v_dup_car_ids text[];
begin
  raise notice '=======================================================';
  raise notice 'بدء فحص وحذف السيارات المكررة في جدول public.vehicles';
  raise notice 'وضع التشغيل: %', case when v_dry_run then 'تجريبي (DRY RUN - لن يتم الحذف)' else 'تنفيذ فعلي (LIVE EXECUTION)' end;
  raise notice '=======================================================';

  -- دالة مساعدة لتطبيع اللوحة داخل الجلسة المؤقتة
  create or replace function pg_temp.yahma_norm_plate(p text)
  returns text language sql immutable as $fn$
    select lower(
      regexp_replace(
        translate(
          coalesce(p, ''),
          'إأآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'ااااهي01234567890123456789'
        ),
        '[\s\-_ً-ْ]', '', 'g'
      )
    );
  $fn$;

  -- 1) فحص ومعالجة السيارات المكررة حسب رقم اللوحة (الموحد)
  for r in
    select 
      pg_temp.yahma_norm_plate(plate) as norm_plate,
      array_agg(id order by 
        -- معيار اختيار أفضل نسخة للاحتفاظ بها:
        (case when coalesce(trim(serial),'') not in ('','0','بدون','لا يوجد','-') then 2 else 0 end +
         case when coalesce(trim(branch),'') <> '' then 1 else 0 end +
         case when coalesce(trim(licenseexpiry::text),'') <> '' then 2 else 0 end +
         case when coalesce(trim(inspection),'') <> '' then 1 else 0 end +
         case when coalesce(trim(notes),'') <> '' then 1 else 0 end +
         case when coalesce(trim(accountno),'') <> '' then 1 else 0 end +
         case when coalesce(trim(companyname),'') <> '' then 1 else 0 end) desc,
        updated_at desc,
        id desc
      ) as all_ids,
      array_agg(car_id order by 
        (case when coalesce(trim(serial),'') not in ('','0','بدون','لا يوجد','-') then 2 else 0 end +
         case when coalesce(trim(branch),'') <> '' then 1 else 0 end +
         case when coalesce(trim(licenseexpiry::text),'') <> '' then 2 else 0 end +
         case when coalesce(trim(inspection),'') <> '' then 1 else 0 end +
         case when coalesce(trim(notes),'') <> '' then 1 else 0 end +
         case when coalesce(trim(accountno),'') <> '' then 1 else 0 end +
         case when coalesce(trim(companyname),'') <> '' then 1 else 0 end) desc,
        updated_at desc,
        id desc
      ) as all_car_ids,
      count(*) as cnt
    from public.vehicles
    where coalesce(trim(plate), '') <> ''
    group by pg_temp.yahma_norm_plate(plate)
    having count(*) > 1
  loop
    v_dup_groups := v_dup_groups + 1;
    v_keeper_id := r.all_ids[1];
    v_keeper_car_id := r.all_car_ids[1];
    v_dup_ids := r.all_ids[2:array_length(r.all_ids, 1)];
    v_dup_car_ids := r.all_car_ids[2:array_length(r.all_car_ids, 1)];

    raise notice 'مجموعة لوحة [%]: المحتفظ بها (id: %, car_id: %) | مكررات للحذف: % سيارة (ids: %)',
      r.norm_plate, v_keeper_id, v_keeper_car_id, array_length(v_dup_ids, 1), v_dup_ids;

    if not v_dry_run then
      -- أ) دمج أي بيانات ناقصة في السيارة المحتفظ بها قبل حذف المكررات
      update public.vehicles k
      set 
        serial = coalesce(k.serial, d.serial),
        accountno = coalesce(k.accountno, d.accountno),
        companyname = coalesce(k.companyname, d.companyname),
        cardnumber = coalesce(k.cardnumber, d.cardnumber),
        cardexpiry = coalesce(k.cardexpiry, d.cardexpiry),
        licensestatus = coalesce(k.licensestatus, d.licensestatus),
        licenseexpiry = coalesce(k.licenseexpiry, d.licenseexpiry),
        inspection = coalesce(k.inspection, d.inspection),
        insurance = coalesce(k.insurance, d.insurance),
        owner = coalesce(k.owner, d.owner),
        ownernumber = coalesce(k.ownernumber, d.ownernumber),
        branch = coalesce(k.branch, d.branch),
        odometer = coalesce(k.odometer, d.odometer),
        notes = case 
          when k.notes is null or trim(k.notes) = '' then d.notes
          when d.notes is not null and trim(d.notes) <> '' and k.notes not like '%' || d.notes || '%' then k.notes || ' | ' || d.notes
          else k.notes
        end
      from (
        select 
          max(serial) as serial,
          max(accountno) as accountno,
          max(companyname) as companyname,
          max(cardnumber) as cardnumber,
          max(cardexpiry) as cardexpiry,
          max(licensestatus) as licensestatus,
          max(licenseexpiry) as licenseexpiry,
          max(inspection) as inspection,
          max(insurance) as insurance,
          max(owner) as owner,
          max(ownernumber) as ownernumber,
          max(branch) as branch,
          max(odometer) as odometer,
          string_agg(notes, ' | ') as notes
        from public.vehicles
        where id = any(v_dup_ids)
      ) d
      where k.id = v_keeper_id;

      -- ب) إعادة ربط جدول مدفوعات الفحص بالسيارة المحتفظ بها
      update public.inspection_payments
      set car_id = v_keeper_car_id
      where car_id = any(v_dup_car_ids);

      -- ج) إعادة ربط جدول الاستئجارات بالسيارة المحتفظ بها
      update public.rentals
      set car_id = v_keeper_car_id
      where car_id = any(v_dup_car_ids);

      -- د) حذف السيارات المكررة من جدول الأسطول
      delete from public.vehicles
      where id = any(v_dup_ids);
    end if;

    v_deleted_cars := v_deleted_cars + array_length(v_dup_ids, 1);
  end loop;

  -- 2) فحص ومعالجة السيارات المكررة حسب رقم الشاسيه (الرقم التسلسلي serial)
  for r in
    select 
      trim(lower(serial)) as s_key,
      array_agg(id order by updated_at desc, id desc) as all_ids,
      array_agg(car_id order by updated_at desc, id desc) as all_car_ids,
      count(*) as cnt
    from public.vehicles
    where coalesce(trim(serial), '') not in ('', '0', 'بدون', 'لا يوجد', '-')
    group by trim(lower(serial))
    having count(*) > 1
  loop
    v_keeper_id := r.all_ids[1];
    v_keeper_car_id := r.all_car_ids[1];
    v_dup_ids := r.all_ids[2:array_length(r.all_ids, 1)];
    v_dup_car_ids := r.all_car_ids[2:array_length(r.all_car_ids, 1)];

    raise notice 'مجموعة شاسيه [%]: المحتفظ بها id: % | حذف % سيارة مكررة',
      r.s_key, v_keeper_id, array_length(v_dup_ids, 1);

    if not v_dry_run then
      update public.inspection_payments set car_id = v_keeper_car_id where car_id = any(v_dup_car_ids);
      update public.rentals set car_id = v_keeper_car_id where car_id = any(v_dup_car_ids);
      delete from public.vehicles where id = any(v_dup_ids);
    end if;

    v_dup_groups := v_dup_groups + 1;
    v_deleted_cars := v_deleted_cars + array_length(v_dup_ids, 1);
  end loop;

  raise notice '=======================================================';
  if v_dup_groups = 0 then
    raise notice '✓ النتيجة: لا توجد أي سيارات مكررة في جدول public.vehicles!';
  else
    raise notice 'اكتملت العملية: تم العثور على % مجموعة مكررة، وإجمالي % سيارة مكررة.', v_dup_groups, v_deleted_cars;
    if v_dry_run then
      raise notice '⚠️ وضع تجريبي: لم يتم حذف أي سيارة بعد. لتنفيذ الحذف، اجعل v_dry_run := false في السطر 56 ثم اضغط Run.';
    else
      raise notice '✓ تم الحذف الفعلي بنجاح، ودمج البيانات، وتحديث كافة السجلات المرتبطة.';
    end if;
  end if;
  raise notice '=======================================================';
end $$;

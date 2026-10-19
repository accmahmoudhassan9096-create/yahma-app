-- ==============================================================================
-- 1) استعلام فحص السيارات المكررة (معاينة فقط):
-- ==============================================================================
select 
  lower(
    regexp_replace(
      translate(
        coalesce(plate, ''),
        'إأآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        'ااااهي01234567890123456789'
      ),
      '[\s\-_ً-ْ]', '', 'g'
    )
  ) as "اللوحة الموحدة",
  count(*) as "عدد التكرار",
  string_agg(id::text, ', ' order by updated_at desc) as "معرفات id",
  string_agg(plate, ', ' order by updated_at desc) as "اللوحات الأصلية",
  string_agg(coalesce(branch, '—'), ', ' order by updated_at desc) as "الفروع"
from public.vehicles
where coalesce(trim(plate), '') <> ''
group by 1
having count(*) > 1;


-- ==============================================================================
-- 2) أمر حذف السيارات المكررة فوراً (مع إبقاء النسخة الأحدث والأكمل):
-- ==============================================================================
delete from public.vehicles
where id in (
  select id from (
    select id,
           row_number() over (
             partition by lower(
               regexp_replace(
                 translate(
                   coalesce(plate, ''),
                   'إأآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                   'ااااهي01234567890123456789'
                 ),
                 '[\s\-_ً-ْ]', '', 'g'
               )
             )
             order by 
               (case when coalesce(trim(serial),'') not in ('','0','بدون','لا يوجد','-') then 2 else 0 end +
                case when coalesce(trim(branch),'') <> '' then 1 else 0 end +
                case when coalesce(trim(licenseexpiry::text),'') <> '' then 2 else 0 end +
                case when coalesce(trim(inspection),'') <> '' then 1 else 0 end +
                case when coalesce(trim(notes),'') <> '' then 1 else 0 end +
                case when coalesce(trim(accountno),'') <> '' then 1 else 0 end +
                case when coalesce(trim(companyname),'') <> '' then 1 else 0 end) desc,
               updated_at desc,
               id desc
           ) as rn
    from public.vehicles
    where coalesce(trim(plate), '') <> ''
  ) t
  where rn > 1
);

-- حذف أي سيارات مكررة بنفس رقم الشاسيه (السيريال) مع إبقاء الأحدث:
delete from public.vehicles
where id in (
  select id from (
    select id,
           row_number() over (
             partition by trim(lower(serial))
             order by updated_at desc, id desc
           ) as rn
    from public.vehicles
    where coalesce(trim(serial), '') not in ('', '0', 'بدون', 'لا يوجد', '-')
  ) t
  where rn > 1
);

-- ===== ترحيل سجلات الاستئجارات من حالة «مؤجرة» =====
-- 🔴 dry-run الأول: شغّل _dryrun-rentals.sql وشوف الأرقام قبل التنفيذ.
--    الـidempotent: تشغيله تاني بيمسح السجلات القديمة ويعملها من جديد.
--
-- السبب: 2,859 سيارة حالتها «مؤجرة» و 3,894 عندها سعر يومي، بس جدول
-- rentals كان فاضي (0 سجل) والعمود القديم renteddays = 0 للجميع.
-- فالتقارير كانت بتطلع 0% استغلال و 0 إيراد — أرقام برضه بس مبنية
-- على «مفيش بيانات» مش على قياس حقيقي.
--
-- ⚠️ البداية = بداية الشهر الحالي (مش تاريخ الإنشاء):
--    التقارير بتعرض الشهر الحالي افتراضياً، فلو السجل بدأ في شهر
--    ماضي مش هيبان في الفترة الافتراضية (وه اللي حصل في النسخة الأولى
--    — بدأت من created_at في سبتمبر فالطلع 0%).
--
-- المدة: 30 يوم (افتراضي — مفيش تاريخ نهاية مسجّل في البيانات).
--
-- الـnote بينوضّح إن السجل مُرحَّل تلقائياً، عشان يبقى واضح لكل مين
-- بيشوف السجل إنه مش مسجّل يدوي. ولما المستخدم يسجّل استئجار حقيقي
-- بنفس السيارة، السجل التلقائي بيتشال تلقائياً (من rentals-store.js)
-- عشان ما يتحسبش مرتين.

begin;

-- 1) نشيل السجلات المرحَّلة القديمة
delete from rentals where note like 'ترحيل تلقائي%';

-- 2) نعمل سجلات جديدة تبدأ من بداية الشهر الحالي
insert into rentals (car_id, plate, branch, start_date, end_date, daily_rate, note, prev_status)
select
  v.id::text,
  v.plate,
  v.branch,
  greatest(
    date_trunc('month', current_date)::date,
    coalesce(v.lastmaintenance::date, v.created_at::date, v.updated_at::date, current_date)
  ),
  greatest(
    date_trunc('month', current_date)::date,
    coalesce(v.lastmaintenance::date, v.created_at::date, v.updated_at::date, current_date)
  ) + 29,
  v.dailyrate,
  'ترحيل تلقائي من حالة «مؤجرة» (30 يوم) — راجعه وسجّل التاريخ الفعلي',
  v.carstatus
from vehicles v
where v.carstatus like '%مؤجر%'
  and v.dailyrate is not null and v.dailyrate > 0
  and (v.lastmaintenance is not null or v.created_at is not null or v.updated_at is not null);

commit;

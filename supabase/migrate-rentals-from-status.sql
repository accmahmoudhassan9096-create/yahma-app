-- ===== ترحيل سجلات الاستئجارات من حالة «مؤجرة» =====
-- 🔴 dry-run الأول: شغّل _dryrun-rentals.sql وشوف الأرقام قبل التنفيذ.
--    الـidempotent: لو شغّلته تاني مش هيعمل حاجة (شروط التوقف).
--
-- السبب: 2,859 سيارة حالتها «مؤجرة» و 3,894 عندها سعر يومي، بس جدول
-- rentals كان فاضي (0 سجل) والعمود القديم renteddays = 0 للجميع.
-- فالتقارير كانت بتطلع 0% استغلال و 0 إيراد — أرقام برضه بس مبنية
-- على «مفيش بيانات» مش على قياس حقيقي.
--
-- منطق البداية (بالترتيب): آخر صيانة ← تاريخ الإنشاء ← تاريخ التحديث.
-- المدة: 30 يوم (افتراضي — مفيش تاريخ نهاية مسجّل في البيانات).
--
-- الـnote بينوضّح إن السجل مُرحَّل تلقائياً، عشان يبقى واضح لكل مين
-- بيشوف السجل إنه مش مسجّل يدوي. لما المستخدم يسجّل استئجار حقيقي
-- بنفس السيارة، السجل التلقائي لازم يتشال (عشان ما يت DOUBLE-count).

begin;

insert into rentals (car_id, plate, branch, start_date, end_date, daily_rate, note, prev_status)
select
  v.id::text,
  v.plate,
  v.branch,
  coalesce(v.lastmaintenance::date, v.created_at::date, v.updated_at::date, current_date),
  coalesce(v.lastmaintenance::date, v.created_at::date, v.updated_at::date, current_date) + 29,
  v.dailyrate,
  'ترحيل تلقائي من حالة «مؤجرة» (30 يوم) — راجعه وسجّل التاريخ الفعلي',
  v.carstatus
from vehicles v
where v.carstatus like '%مؤجر%'
  and v.dailyrate is not null and v.dailyrate > 0
  and (v.lastmaintenance is not null or v.created_at is not null or v.updated_at is not null)
  /* التوقف: متكررش نفس السجل */
  and not exists (
    select 1 from rentals r
    where r.car_id = v.id::text
      and r.note like 'ترحيل تلقائي%'
  );

commit;

-- ============================================================
--  team-overview.sql — تقرير حسابات المنصة (قراءة فقط)
-- ============================================================
--  كان متوقع تنضيف حسابات زيادة في profiles، بس لما راجعنا لقينا:
--
--    إجمالي profiles : 9
--    مربوطة بحساب    : 9
--    يتيمة (أوفلان) : 0   ← مفيش أي حاجة تتشال
--    حسابات بلا profile : 0
--
--  الـ6 زيادة عن 3 حسابات قدام هي مستخدمين حقيقيين اتعملوا
--  يوم 2026-10-14 (فريق الفروع) — مفيش أي حساب زيادة.
--  ⛔ لذلك مفيش حذف، الملف ده للتقرير والمراجعة بس.
--
--  👈 الملف كله قراءة فقط. مش بيغيّر أي حاجة.
-- ============================================================


-- 1) كل الحسابات
select
  p.role,
  coalesce(p.branch_name, '— كل الفروع —') as الفرع,
  coalesce(p.full_name, '—')                as الاسم,
  u.email,
  p.created_at::date                         as تاريخ_إنشاء_الحساب,
  case when u.id is null then '⚠️ يتيم' else '✅ سليم' end as الحالة
from public.profiles p
left join auth.users u on u.id = p.id
order by
  case p.role when 'admin' then 0 when 'ops' then 1 else 2 end,
  p.branch_name nulls first,
  p.full_name;


-- 2) ملخص
select
  (select count(*) from public.profiles)                       as إجمالي_المستخدمين,
  (select count(*) from public.profiles where role = 'admin')  as مدير,
  (select count(*) from public.profiles where role = 'ops')    as تشغيل,
  (select count(*) from public.profiles where role = 'view')   as عرض_فقط,
  (select count(*) from public.profiles
     where nullif(btrim(branch_name), '') is null)             as بدون_فرع_يروا_الكل,
  (select count(*) from public.profiles p
     left join auth.users u on u.id = p.id
     where u.id is null)                                       as حسابات_يتيمة;


-- 3) عدد السيارات المرئية لكل فرع (RLS بيشتغل زي ما هو)
select
  coalesce(btrim(branch), '— بدون فرع —') as الفرع,
  count(*)                               as عدد_السيارات
from public.vehicles
group by 1
order by 2 desc;


-- 4) فحص خاطير: نفس الإيميل على أكتر من حساب
select
  u.email,
  count(distinct p.id)        as عدد_الحسابات,
  string_agg(distinct p.role, ', ') as الأدوار
from public.profiles p
join auth.users u on u.id = p.id
group by u.email
having count(distinct p.id) > 1
order by 2 desc;
-- ↑ رجّع 0 صفوف = مفيش تكرار. لو رجّع-something، راجعه فورًا.
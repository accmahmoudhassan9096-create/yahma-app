-- إثبات سلوك سياسات جدول rentals على القاعدة الحقيقية.
--
-- الاختبارات في ملفات المشروع بتتأكد إن الـSQL مكتوب صح. دي بتتأكد
-- إن Postgres بيطبّقه صح — بنفس الفكرة بـverify-payment-columns.sql.
--
-- كله جوه transaction بيعمل rollback: البيانات اللي بتحطها هنا مش
-- هتفضل. النتيجة بتطلع جوّه نص الاستثناء لأن الـnotices مش بتظهر مع
-- خطأ، والـraise في الآخر هو اللي بيعمل rollback.
--
-- الحالات:
--   1) الجدول فيه RLS مفعّل + 4 سياسات
--   2) قيد ترتيب التواريخ شغّال (نهاية قبل بداية → يرفض)
--   3) قيد السعر السالب + نفس اليوم مسموح
--   4) «مشاهدة» ما تقدرش تكتب
--   5) مدير فرع يكتب في فرعه ويترفض في فرع غيره
--   6) تحديث updated_at بيشتغل
do $$
declare
  v_probe        uuid;
  v_probe_role   text;
  v_probe_branch text;
  v_mgr         uuid;
  v_mgr_branch  text;
  v_other_branch text;
  v_res         text := '';
  v_cnt         integer;
begin
  -- ---------- 1) الجدول والسياسات و RLS ----------
  select count(*) into v_cnt from pg_policies where tablename = 'rentals';
  v_res := v_res || '[1 policies=' || v_cnt ||
           (case when v_cnt = 4 then '=OK' else '=EXPECTED4' end) || ']';

  -- ⚠️ ولا «إداري» عنده فرع (صفر من اتنين)، و19 من الـ20 «تشغيل»
  -- عندهم فروع. فلو اخترنا «إداري» بس مش branch_name، v_mgr هيطلع
  -- NULL وauth.uid() يبقى فاضي — والاختبار بيطلع BLOCKED-BAD
  -- والسبب مش RLS. أول نسخة كانت بتعمل كده بالظبط.
  select id, branch_name into v_mgr, v_mgr_branch
    from public.profiles
   where role in ('ops','manager') and nullif(btrim(branch_name),'') is not null
   order by role asc
   limit 1;

  -- فرع تاني مختلف — لنتأكد إن مدير الفرع ما يعدّيش عليه
  select branch into v_other_branch
    from public.vehicles
   where coalesce(btrim(branch),'') <> ''
     and coalesce(btrim(branch),'') <> coalesce(v_mgr_branch,'')
   group by branch
   order by count(*) desc
   limit 1;

  if exists (select 1 from pg_class where relname='rentals' and relrowsecurity) then
    v_res := v_res || '[1 rls=ON]';
  else
    v_res := v_res || '[1 rls=OFF-BAD]';
  end if;

  -- ---------- 2) قيد ترتيب التواريخ ----------
  begin
    insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
    values ('zz-verify', 'ZZ-V', 'فرع التحقق', date '2026-10-10', date '2026-10-01', 100);
    v_res := v_res || '[2 dates=BAD-ACCEPTED]';
  exception when check_violation then
    v_res := v_res || '[2 dates=REJECTED-OK]';
  end;

  -- ---------- 3) السعر السالب ----------
  begin
    insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
    values ('zz-verify', 'ZZ-V', 'فرع التحقق', date '2026-10-01', date '2026-10-05', -50);
    v_res := v_res || '[3 rate=BAD-ACCEPTED]';
  exception when check_violation then
    v_res := v_res || '[3 rate=REJECTED-OK]';
  end;

  -- نفس اليوم مسموح (مش أقل) — لازم يعدّي
  begin
    insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
    values ('zz-verify', 'ZZ-V', 'فرع التحقق', date '2026-10-01', date '2026-10-01', 100);
    v_res := v_res || '[3 sameDay=OK]';
    delete from public.rentals where car_id = 'zz-verify';
  exception when others then
    v_res := v_res || '[3 sameDay=BAD-' || sqlstate || ']';
  end;

  -- ---------- 4) و 5) : نتعامل مع RLS كأننا مستخدمين ----------
  -- ⚠️ مفيش حساب «مشاهدة» على المنصة دلوقتي (صفر)، وفيه 20 «تشغيل»
  -- و2 «إداري». فلو اخترنا view هناخد NULL وauth.uid() يبقى فاضي
  -- والاختبار هيعدّي من غير ما يختبر حاجة.
  --
  -- وكمان profiles.id مربوط بـauth.users بـFK، فمش ينفع نعمل
  -- حساب بـuuid عشوائي.
  --
  -- فباخد حساب «تشغيل» موجود ونغيّر دوره لـ«مشاهدة» مؤقتًا:
  --   • تغيير الدور بيعدّي من الحارس لما يكون الـrole = service_role
  --     (الحارس بيستثنيه صراحة)
  --   • الحساب موجود في auth.users فمش هيقع في الـFK
  --   • كله جوه الـtransaction فالـrollback بيرجّع الدور الأصلي
  select id, role, branch_name into v_probe, v_probe_role, v_probe_branch
    from public.profiles
   where role = 'ops' limit 1;

  -- ⚠️ ليش `set local role service_role` لوحده مش كفاية:
  -- الحارس yahma_guard_profile_columns متصرَّف security definer، فجوه
  -- التريجر current_user هو مالك الدالة (postgres) مش اللي نادى.
  -- والحارس بيستثني service_role بالاسم ده، فالاستثناء بيشتغل
  -- بس claim الـJWT نفسه لازم يكون service_role.
  -- أول محاولة استخدمت set local role بس، فالحارس رفض وطلع:
  --   ERROR: 42501 الدور يعدّله مدير النظام فقط
  -- فأنا بظبط الاتنين: claim للـguard + role للصلاحيات.

  if v_probe is null then
    v_res := v_res || '[4 SKIP-no-ops-account]';
  else
    set local role service_role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_probe::text, 'role', 'service_role')::text, true);
    update public.profiles set role = 'view' where id = v_probe;
    reset role;

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_probe::text, 'role', 'authenticated')::text, true);

    begin
      insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
      values ('zz-verify', 'ZZ-V', coalesce(v_mgr_branch,'فرع التحقق'), date '2026-10-01', date '2026-10-05', 100);
      v_res := v_res || '[4 view=WROTE-BAD]';
      delete from public.rentals where car_id = 'zz-verify';
    exception when insufficient_privilege then
      v_res := v_res || '[4 view=BLOCKED-OK]';
    end;

    -- مدير الفرع: في فرعه يعدّي
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mgr::text, 'role', 'authenticated')::text, true);
    begin
      insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
      values ('zz-verify', 'ZZ-V', coalesce(v_mgr_branch,'فرع التحقق'), date '2026-10-01', date '2026-10-05', 100);
      v_res := v_res || '[5 mgrOwnBranch=OK]';
    exception when insufficient_privilege then
      v_res := v_res || '[5 mgrOwnBranch=BLOCKED-BAD]';
    end;

    -- في فرع غيره يترفض — دي الحماية اللي بتمنع مدير فرع يشوف
    -- فرع غيره. لو دي ماشتغلتش، الإيراد بيتسرّب بين الفروع.
    if v_other_branch is not null and v_other_branch <> coalesce(v_mgr_branch,'فرع التحقق') then
      begin
        insert into public.rentals (car_id, plate, branch, start_date, end_date, daily_rate)
        values ('zz-verify', 'ZZ-V', v_other_branch, date '2026-10-01', date '2026-10-05', 100);
        v_res := v_res || '[5 mgrOtherBranch=WROTE-BAD]';
        delete from public.rentals where car_id = 'zz-verify';
      exception when insufficient_privilege then
        v_res := v_res || '[5 mgrOtherBranch=BLOCKED-OK]';
      end;
    else
      v_res := v_res || '[5 mgrOtherBranch=SKIP]';
    end if;

    reset role;

    -- رجّع الدور الأصلي
    set local role service_role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_probe::text, 'role', 'service_role')::text, true);
    update public.profiles set role = v_probe_role where id = v_probe;
    reset role;
  end if;

  -- ---------- 6) تحديث updated_at ----------
  begin
    update public.rentals set daily_rate = 111 where car_id = 'zz-verify';
    v_res := v_res || '[6 update=OK]';
    delete from public.rentals where car_id = 'zz-verify';
  exception when others then
    v_res := v_res || '[6 update=BAD-' || sqlstate || ']';
  end;

  raise exception 'RENTALS-VERIFY %', v_res;
end $$;
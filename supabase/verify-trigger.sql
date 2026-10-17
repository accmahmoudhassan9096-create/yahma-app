/* اختبار التريجر على القاعدة نفسها — والنتيجة بتطلع جوّه نص
   الاستثناء.

   ليه جوّه الاستثناء: عشان آخر سطر بيعمل rollback للـDO block
   كله، فمفيش أي تغيير على البيانات. بس كده الـnotices بتيختفي
   من المخرج، فنحط النتيجة في رسالة الاستثناء عشان تبان.

   المسارات اللي بيتختبرها:
     ❶ service_role (دوال الحافة)  → يعدّل الأعمدة المحمية → يعدّي
     ❷ authenticated صاحب حساب عادي → يعدّل الأعمدة المحمية → يترفض
     ❸ authenticated مدير           → يعدّل                        → يعدّي

   مافيش commit ولا delete — الملف ده آمن يتطبق أي عدد مرات. */

do $$
declare
  v_admin uuid;
  v_other uuid;
  v_before text;
  v_ok boolean;
  v_res  text := '';
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_other from public.profiles where role <> 'admin' limit 1;
  select role into v_before from public.profiles where id = v_other;

  /* ---------- ❶ service_role: مسار دالة إنشاء المستخدم ---------- */
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    update public.profiles set role = 'ops' where id = v_other;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_res := v_res || '[1 service_role ROLE=' ||
    case when v_ok then 'ALLOWED' else 'BLOCKED' end || ']';

  /* ---------- ❷ authenticated + صاحب حساب مش مدير ---------- */
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);

  begin
    update public.profiles set role = 'manager' where id = v_other;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2 nonadmin ROLE=' ||
    case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  begin
    update public.profiles set branch_name = 'probe-branch' where id = v_other;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2b nonadmin BRANCH=' ||
    case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  begin
    update public.profiles set allowed_tabs = array['fleet'] where id = v_other;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2c nonadmin TABS=' ||
    case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  begin
    update public.profiles set email = 'probe@example.com' where id = v_other;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2d nonadmin EMAIL=' ||
    case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  /* ---------- ❸ authenticated + مدير ---------- */
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  begin
    update public.profiles set role = 'ops' where id = v_other;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_res := v_res || '[3 admin ROLE=' ||
    case when v_ok then 'ALLOWED' else 'BLOCKED' end || ']';

  v_res := v_res || '[original-role=' || v_before || ']';

  -- دي بتعمل rollback للـDO block كله، فمفيش تغيير دائم
  raise exception '%', v_res;
end;
$$;

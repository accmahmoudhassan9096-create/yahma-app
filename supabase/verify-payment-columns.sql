/* اختبار الحقلين الجديدين على القاعدة: existent + الكتابة بتتقفل
   على «مشاهدة» وبتعدّي لغيرهم. كله جوه transaction بيعمل rollback.

   النتيجة بتطلع جوّه نص الاستثناء لأن الـnotices مش بتظهر مع خطأ،
   والـraise في الآخر هو اللي بيعمل rollback. */
do $$
declare
  v_ops  uuid;
  v_car  text;
  v_ok   boolean;
  v_res  text := '';
begin
  select id into v_ops from public.profiles where role in ('ops','manager','admin') limit 1;
  select car_id into v_car from public.vehicles where coalesce(btrim(car_id),'') <> '' limit 1;
  if v_car is null then select plate into v_car from public.vehicles limit 1; end if;

  /* ---------- ❶ الأعمدة موجودة فعلاً ---------- */
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='vehicles' and column_name='accountno')
     and exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='vehicles' and column_name='companyname') then
    v_res := v_res || '[1 columns=OK]';
  else
    v_res := v_res || '[1 columns=MISSING]';
  end if;

  /* ---------- ❷ «مشاهدة» تعدّل الحقلين — لازم يترفض ----------

     ⚠️ مفيش أي حساب دوره «مشاهدة» على المنصة دلوقتي (صفر)،
     فلو اخترنا uid من profiles بـ role='view' هناخد NULL وauth.uid()
     هيرجع NULL والحارس هيعدّي بالم Early-out — والنتيجة هتبقى
     «ALLOWED_HOLE» بالغلط والسبب مش الغلط.

     عشان كده بنعمل واحد جوه الـtransaction: بننزّل دور حساب
     تشغيل لـ«مشاهدة» قبل ما نجرّب.

     وبما إن حارس profiles بيمنع تغيير الدور لحد ما يكون
     المتصل مدير، بنوقف تريجر الحارس **جوه نفس الـtransaction
     بس** ونرجّعه تاني على طول. الـtransaction بيرجع في الآخر
     (آخر سطر raise) فالوقف ده بيترجع كمان — مافيش أثر دائم. */
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'alter table public.profiles disable trigger yahma_guard_profile_columns';
  update public.profiles set role = 'view' where id = v_ops;
  execute 'alter table public.profiles enable trigger yahma_guard_profile_columns';
  perform set_config('request.jwt.claim.sub', v_ops::text, true);

  v_res := v_res || '[view_user_made=' ||
    (select case when role = 'view' then 'yes' else 'NO' end from public.profiles where id = v_ops)
    || ']';

  begin
    update public.vehicles set accountno = 'probe-acc' where car_id = v_car;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2 view ACCOUNTNO=' || case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  begin
    update public.vehicles set companyname = 'probe-co' where car_id = v_car;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2b view COMPANYNAME=' || case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  /* أعمدة تانية محمية — لازم تفضل مقفولة كمان (الحارس لسه شغّال) */
  begin
    update public.vehicles set serial = 'PROBESERIAL17' where car_id = v_car;
    v_ok := false;
  exception when others then v_ok := true; end;
  v_res := v_res || '[2c view SERIAL=' || case when v_ok then 'BLOCKED' else 'ALLOWED_HOLE' end || ']';

  /* ---------- ❸ «تشغيل» يعدّلهم — لازم يعدّي ---------- */
  execute 'alter table public.profiles disable trigger yahma_guard_profile_columns';
  update public.profiles set role = 'ops' where id = v_ops;
  execute 'alter table public.profiles enable trigger yahma_guard_profile_columns';
  perform set_config('request.jwt.claim.sub', v_ops::text, true);
  begin
    update public.vehicles set accountno = 'probe-acc' where car_id = v_car;
    v_ok := true;
  exception when others then v_ok := false; end;
  v_res := v_res || '[3 ops ACCOUNTNO=' || case when v_ok then 'ALLOWED' else 'BLOCKED' end || ']';

  begin
    update public.vehicles set companyname = 'probe-co' where car_id = v_car;
    v_ok := true;
  exception when others then v_ok := false; end;
  v_res := v_res || '[3b ops COMPANYNAME=' || case when v_ok then 'ALLOWED' else 'BLOCKED' end || ']';

  v_res := v_res || '[target=' || coalesce(v_car,'none') || ']';

  -- rollback
  raise exception '%', v_res;
end;
$$;

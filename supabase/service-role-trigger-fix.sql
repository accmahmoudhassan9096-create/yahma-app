/* ===== إصلاح: دوال الحافة مش قادرة تعدّل profiles خالص =====

   🚨 الرجوع ده سببه التريجر اللي اتعمل مع أعمدة البيانات الشخصية
   (الاسم، الرقم، تاريخ الميلاد، التليفون). التريجر بيحمي أعمدة
   الصلاحيات من أي حد مش مدير:

       select yahma_is_admin() into v_admin;
       if v_admin then return new; end if;
       if new.role is distinct from old.role then
         raise exception 'الدور يعدّله مدير النظام فقط' using errcode = '42501';
       end if;

   ودوال الحافة admin-create-user بتعدّل role وbranch_name و
   allowed_tabs — بالظبط الأعمدة دي. وهي بتشتغل بمفتاح service_role،
   ومفيش JWT user معاها، فـ auth.uid() بيرجع NULL وyahma_is_admin()
   بترجع false، والتريجر بيرمي 42501 على كل عملية.

   النتيجة العملية: أي حد يختار دور أو قسم أو فرع في لوحة إدارة
   المستخدمين بياخد «Database error saving new user» والدالة
   بتراجع الحساب وترجّعه. أربع حسابات اشتغلت قبل ما التريجر ده
   يتعمل، وبعده الإضافة بقت ميتة.

   ليه الاستثناء ده مش ثغرة: مفتاح service_role سري على السيرفر
   ومش بيوصل المتصفح أبداً، وعميل التطبيق نفسه بيشتغل بـ
   authenticated مع JWT للمستخدم. فالمتصفح مابيقدرش يوصل للحالة
   دي، والسيرفر هو المفروض يعدّل من غير أسئلة.

   ⚠️ حارس السيارات ما تأثرش من المشكلة دي: هو بيعمل العكس —
   لو الدور مش «مشاهدة» بيعدّي. فالطلب من service_role
   (auth.uid() = NULL) بيعدّي منه عادي. المشكلة بس في حماية
   الأعمدة الإلزامية، وده guard_profile_columns.

   ملاحظة: my-account.sql فيه نفس التعريف بالتصحيح، والاختبار
   بيقفل إن الملفين متطابقين — غير كده بيترجع حسب أي ملف اتطبق
   آخر. الملف ده نسخة مستقلة idempotent عشان يتطبق على أي بيئة
   من غير ما يتعمل my-account.sql كله تاني. */

create or replace function public.yahma_guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_admin boolean := false;
  v_role  text;
begin
  /* طلبات service_role (دوال الحافة) مالهاش JWT user. من غير
     الاستثناء ده التريجر بيعتبرها طلب من غير مدير وبيمنع كل
     تعديل — فالوحدة بتراجع أي حساب جديد وترجّع «تعذر حفظ بيانات
     المستخدم». */
  v_role := coalesce(auth.role(), current_user);
  if v_role = 'service_role' then
    return new;
  end if;

  -- المدير يعدّل أي صف بأي عمود
  select yahma_is_admin() into v_admin;
  if v_admin then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'معرف الحساب غير قابل للتعديل' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    raise exception 'الدور يعدّله مدير النظام فقط' using errcode = '42501';
  end if;
  if new.branch_name is distinct from old.branch_name then
    raise exception 'الفرع يعدّله مدير النظام فقط' using errcode = '42501';
  end if;
  if new.allowed_tabs is distinct from old.allowed_tabs then
    raise exception 'الأقسام المسموحة يعدّلها مدير النظام فقط' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'البريد يعدّله مدير النظام فقط' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists yahma_guard_profile_columns on public.profiles;
create trigger yahma_guard_profile_columns
  before update on public.profiles
  for each row execute function public.yahma_guard_profile_columns();

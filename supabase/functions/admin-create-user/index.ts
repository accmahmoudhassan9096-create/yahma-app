import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ===== قراءة رسالة الخطأ الصح =====

   كان السطر الأخير:
       error instanceof Error ? error.message : 'تعذر إنشاء المستخدم'
   وأخطاء Supabase (AuthError / PostgrestError) مبنية في حزمة
   تانية، فـinstanceof Error بيرجع false ليها — والنتيجة إن **السبب
   الحقيقي كان بيتبلع** والمستخدم بيشوف رسالة عامة من غير أي معلومة.

   هنا بنقرأ `.message` من أي حاجة عندها الحقل ده، وبعدها بن fallback
   لـstatusCode لو محتاجين تفاصيل. */
function errorMessage(error: unknown): string {
  if (!error) return 'تعذر إنشاء المستخدم';
  if (typeof error === 'string') return error;
  const anyError = error as { message?: unknown; error_description?: unknown; msg?: unknown; code?: unknown };
  const raw = anyError.message ?? anyError.error_description ?? anyError.msg;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text) return text;
  if (anyError.code) return 'خطأ من الخادم: ' + String(anyError.code);
  try {
    const dumped = JSON.stringify(error);
    if (dumped && dumped !== '{}') return dumped.slice(0, 200);
  } catch (_) { /* circular */ }
  return 'تعذر إنشاء المستخدم';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('يجب تسجيل الدخول أولًا');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('YAHMA_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) throw new Error('جلسة الدخول غير صالحة');

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).single();
    if (profileError || callerProfile?.role !== 'admin') throw new Error('هذه العملية متاحة للمدير فقط');

    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    /* ⚠️ كان ناقص 'manager'. الدور موجود في الواجهة وفي قيد
       القاعدة (profiles_role_check) من v175، بس مش هنا — فأي
       «إداري» بيتعمل من اللوحة كان بيتخزّن «مشاهدة» من غير ما
       حد ياخد باله. */
    const role = ['admin', 'manager', 'ops', 'view'].includes(body.role) ? body.role : 'view';
    const branchName = String(body.branch_name || '').trim() || null;
    /* لازم تطابق PAGE_PERMISSION_OPTIONS في core/branches-store.js.
       ناقص كان paid و renewed و dues — أي حد يختارهم في اللوحة
       كان بضيّعهم من غير رسالة. في اختبار بيمنع انفصال القائمتين. */
    const allowedTabs = ['fleet', 'branches', 'renewals', 'payments', 'paid', 'renewed', 'license-renewals', 'insurance-renewals', 'inspections', 'reports', 'audit', 'users'];
    const requestedTabs = Array.isArray(body.allowed_tabs)
      ? [...new Set(body.allowed_tabs.filter((tab: unknown): tab is string => typeof tab === 'string' && allowedTabs.includes(tab)))]
      : [];
    const profileTabs = role === 'admin' ? allowedTabs : requestedTabs;
    if (!name || !email || password.length < 8) throw new Error('الاسم والبريد وكلمة مرور من 8 أحرف مطلوبة');

    /* فحوص قبل الإنشاء — رسائل صريحة بدل أخطاء مصنّفة من الخادم */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('صيغة البريد الإلكتروني غير صحيحة');
    const { data: existingList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const alreadyThere = (existingList?.users || []).find(
      (u) => String(u.email || '').toLowerCase() === email,
    );
    if (alreadyThere) {
      throw new Error(`البريد «${email}» مسجّل بالفعل على المنصة — جرّب بريد آخر أو احذف الحساب القديم أولًا.`);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createError || !created.user) {
      throw new Error(errorMessage(createError) || 'تعذر إنشاء الحساب');
    }

    const { error: insertError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      full_name: name,
      role,
      branch_name: branchName,
      allowed_tabs: profileTabs,
    });
    if (insertError) {
      /* الحساب اتعمل في auth بس مش في profiles — من غير تنظيف
         بيقعد مستخدم ما يقدرش يدخل ولا يتشال من اللوحة. */
      let rolledBack = true;
      try {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(created.user.id);
        rolledBack = !deleteError;
      } catch (_) { rolledBack = false; }
      const suffix = rolledBack
        ? ' تم تراجع الحساب.'
        : ' ⚠️ الحساب اتعمل بدون ملف مستخدم — كلّم الدعم.';
      throw new Error(`تعذر حفظ بيانات المستخدم: ${errorMessage(insertError)}${suffix}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      id: created.user.id,
      role,
      allowed_tabs: profileTabs,
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorMessage(error) }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

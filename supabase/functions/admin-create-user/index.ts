import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const role = ['admin', 'ops', 'view'].includes(body.role) ? body.role : 'view';
    const branchName = String(body.branch_name || '').trim() || null;
    const allowedTabs = ['fleet', 'branches', 'renewals', 'payments', 'license-renewals', 'insurance-renewals', 'inspections', 'transfers', 'reports', 'audit'];
    const requestedTabs = Array.isArray(body.allowed_tabs)
      ? [...new Set(body.allowed_tabs.filter((tab: unknown): tab is string => typeof tab === 'string' && allowedTabs.includes(tab)))]
      : [];
    const profileTabs = role === 'admin' ? allowedTabs : requestedTabs;
    if (!name || !email || password.length < 8) throw new Error('الاسم والبريد وكلمة مرور من 8 أحرف مطلوبة');

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createError || !created.user) throw createError || new Error('تعذر إنشاء الحساب');

    const { error: insertError } = await adminClient.from('profiles').upsert({
      id: created.user.id,
      full_name: name,
      role,
      branch_name: branchName,
      allowed_tabs: profileTabs,
    });
    if (insertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw insertError;
    }

    return new Response(JSON.stringify({ ok: true, id: created.user.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'تعذر إنشاء المستخدم' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

// supabase/functions/admin-delete-user/index.ts
//
// Deletes a user's auth account (their public.profiles row cascades away
// automatically via the `on delete cascade` foreign key). Only an admin
// may call this, an admin can't delete their own account this way, and
// the last remaining admin can't be deleted (so nobody locks themselves
// out of user management).
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
    const targetId = String(body.id || '').trim();
    if (!targetId) throw new Error('لم يتم تحديد المستخدم المطلوب حذفه');
    if (targetId === caller.id) throw new Error('لا يمكنك حذف حسابك الخاص من هنا');

    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles').select('role').eq('id', targetId).single();
    if (targetError || !targetProfile) throw new Error('المستخدم غير موجود');

    if (targetProfile.role === 'admin') {
      const { count, error: countError } = await adminClient
        .from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
      if (countError) throw countError;
      if ((count || 0) <= 1) throw new Error('لا يمكن حذف آخر مدير في النظام');
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId);
    if (deleteError) throw deleteError;

    // Safety net: the FK is `on delete cascade`, but in case the profile
    // row somehow survives, clean it up explicitly too.
    await adminClient.from('profiles').delete().eq('id', targetId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'تعذر حذف المستخدم' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

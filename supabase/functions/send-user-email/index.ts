import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-yahma-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const timezone = 'Asia/Riyadh';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function riyadhNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    day: dayIndex[values.weekday] ?? new Date().getUTCDay(),
  };
}

function asDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function flattenCars(vehicles: Record<string, unknown>[]) {
  return vehicles.map((row) => ({ ...row, ...((row.data && typeof row.data === 'object') ? row.data as Record<string, unknown> : {}) }));
}

/* تقرير فحص لكل فرع: السيارات التي لم يتم فحصها (أو رخصتها منتهية) */
function buildBranchInspectionReports(vehicles: Record<string, unknown>[], date: string) {
  const cars = flattenCars(vehicles);
  const today = new Date(`${date}T00:00:00+03:00`).getTime();
  const daysLeft = (value: unknown) => {
    const iso = asDate(value);
    if (!iso) return null;
    return Math.floor((new Date(`${iso}T00:00:00+03:00`).getTime() - today) / 86400000);
  };
  const byBranch = new Map<string, { total: number; pending: { plate: string; license: string; status: string }[] }>();
  for (const car of cars) {
    const branch = String(car.branch || '').trim() || 'غير محدد';
    if (!byBranch.has(branch)) byBranch.set(branch, { total: 0, pending: [] });
    const entry = byBranch.get(branch)!;
    entry.total++;
    const inspection = String(car.inspectionStatus ?? car.inspection_status ?? '').trim();
    const inspected = inspection === 'تم الفحص';
    const licenseLeft = daysLeft(car.licenseExpiry ?? car.licenseexpiry);
    if (!inspected || (licenseLeft !== null && licenseLeft < 0)) {
      entry.pending.push({
        plate: String(car.plate || '—'),
        license: licenseLeft === null ? '—' : (licenseLeft < 0 ? `منتهية منذ ${Math.abs(licenseLeft)} يوم` : `سارية (${licenseLeft} يوم)`),
        status: inspected ? 'تم الفحص — رخصة منتهية' : (inspection || 'لم يفحص'),
      });
    }
  }
  return [...byBranch.entries()].map(([branch, data]) => {
    const list = data.pending.slice(0, 60);
    const lines = [
      `الفرع: ${branch}`,
      `التاريخ: ${date}`,
      '',
      `عدد السيارات التي تحتاج فحصًا: ${data.pending.length} من ${data.total}`,
      '',
    ];
    list.forEach((item, index) => {
      lines.push(`${index + 1}) اللوحة: ${item.plate} — الحالة: ${item.status} — الرخصة: ${item.license}`);
    });
    if (data.pending.length > list.length) lines.push(`… و${data.pending.length - list.length} سيارة أخرى`);
    if (!data.pending.length) lines.push('لا توجد سيارات تحتاج فحصًا — thank you، كل السيارات مفحوصة.');
    lines.push('', 'برجاء إجراء الفحص وتحديث حالته في المنصة. شكرًا تعاونكم.');
    return { branch, total: data.total, pending: data.pending.length, subject: `يهماء — تقرير الفحص الأسبوعي — ${branch}`, message: lines.join('\n') };
  });
}

/* ===== وسيط الإرسال: EmailJS أولًا (لو مُعدّ)، وإلا Resend =====
   EmailJS يُستدعى من الخادم بمفتاح خاص فيبقى الإرسال التلقائي شغّال
   حتى لو محدش فتح المنصة. القالب يحتاج متغيّرات: to_email / subject / message */
function emailjsConfig() {
  const privateKey = Deno.env.get('EMAILJS_PRIVATE_KEY');
  const serviceId = Deno.env.get('EMAILJS_SERVICE_ID');
  const templateId = Deno.env.get('EMAILJS_TEMPLATE_ID');
  if (privateKey && serviceId && templateId) return { privateKey, serviceId, templateId };
  return null;
}
function mailReady(fromEmail: string, resendKey: string) {
  return !!emailjsConfig() || (!!resendKey && !!fromEmail);
}

/* ===== قالب رسالة الترحيب =====

   النص كان مكتوب جوه الكود هنا — المدير مكانش يقدر يغيّر كلمة ولا
   رابط، وأي تعديل كان معناه إعادة نشر للـfunction. دلوقتي النص في
   جدول welcome_template والـfunction بتقرأه عند كل حساب جديد.

   لو الصف مش موجود أو النص فاضي، بيرجع للافتراضي تحت — عشان الحفظ
   باظ أو حد مسح الصف ما يوقفتش إرسال الترحيب خالص. */

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'إداري',
  ops: 'فريق تشغيل',
  view: 'مشاهدة فقط',
};

function defaultWelcomeSubject() {
  return 'تم إنشاء حسابك في منصة يهماء لتأجير السيارات';
}

function defaultWelcomeBody() {
  return [
    'مرحبًا {{name}}،',
    '',
    'تم إنشاء حساب لك في منصة يهماء لتأجير السيارات، ودورك: {{role}}{{branch}}.',
    '',
    'خطوات الدخول:',
    '1) افتح: {{login_url}}',
    '2) سجّل الدخول ببريدك وكلمة المرور من مدير النظام.',
    '3) غيّر كلمة المرور من أول مرة تدخل.',
    '',
    'صلاحياتك محددة سلفًا، فلو محتاج تبويب مش ظاهرلك كلّم مدير النظام يفعّله.',
    '',
    'مع تحيات،',
    'فريق منصة يهماء',
  ].join('\n');
}

/* رابط المنصة: متغيّرت بيئة أولًا، وبعدين النطاق الفعلي.
   الكود القديم كان فيه رابط ثابت على نطاق Netlify — وده كان بيبعت
   الناس لموقع تاني غير الإنتاج من غير ما حد ياخد باله. */
function siteUrl() {
  const configured = Deno.env.get('YAHMA_SITE_URL');
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
  return 'https://yahma-app.acc-mahmoud-hassan9096.workers.dev';
}

/* استبدال {{name}} و{{role}} و{{branch}} و{{login_url}}.
   أي placeholder تاني بيترك زي ما هو — لو المدير كتب {{phone}} ما
   هنحسبش منين. */
function renderWelcome(template: string, vars: { name: string; role: string; branch: string }) {
  const branch = vars.branch ? ` — الفرع: ${vars.branch}` : '';
  return String(template)
    .replaceAll('{{name}}', vars.name || 'بك')
    .replaceAll('{{role}}', vars.role || 'مشاهدة فقط')
    .replaceAll('{{branch}}', branch)
    .replaceAll('{{login_url}}', siteUrl());
}

async function readWelcomeTemplate(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('welcome_template')
    .select('subject,body,enabled')
    .eq('id', 1)
    .maybeSingle();
  if (error) return { subject: defaultWelcomeSubject(), body: defaultWelcomeBody(), enabled: true, fromDb: false };
  return {
    subject: data?.subject?.trim() ? String(data.subject) : defaultWelcomeSubject(),
    body: data?.body?.trim() ? String(data.body) : defaultWelcomeBody(),
    enabled: data ? data.enabled !== false : true,
    fromDb: !!data,
  };
}

async function sendViaEmailjs(emails: string[], subject: string, message: string) {
  const cfg = emailjsConfig()!;
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const email of emails) {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.privateKey,
        template_params: { to_email: email, subject, message },
      }),
    });
    if (response.ok) sent++;
    else {
      failed++;
      const result = await response.json().catch(() => ({}));
      firstError ||= String(result.message || `خطأ EmailJS (${response.status})`);
    }
  }
  return { sent, failed, error: firstError };
}

async function sendToEmails(emails: string[], subject: string, message: string, fromEmail: string, resendKey: string) {
  const unique = [...new Map(emails.filter((e) => e.includes('@')).map((email) => [email.toLowerCase(), email.trim()])).values()];
  if (!unique.length) return { sent: 0, failed: 0, error: 'لا يوجد بريد صالح' };
  if (emailjsConfig()) return sendViaEmailjs(unique, subject, message);
  const safeMessage = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100).map((email) => ({
      from: fromEmail,
      to: [email],
      subject,
      text: `${message}\n\n— منصة يهماء لتأجير السيارات`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.8">${safeMessage}</div><hr><div dir="rtl" style="color:#667085">منصة يهماء لتأجير السيارات</div>`,
    }));
    const mailResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok) {
      failed += batch.length;
      firstError ||= String(result.message || result.name || `خطأ مزود البريد (${mailResponse.status})`);
    } else sent += batch.length;
  }
  return { sent, failed, error: firstError };
}

function makeScheduledMessage(kind: 'daily' | 'weekly', vehicles: Record<string, unknown>[], date: string) {
  const cars = flattenCars(vehicles);
  const today = new Date(`${date}T00:00:00+03:00`).getTime();
  let expired = 0;
  let due7 = 0;
  let ready = 0;
  for (const car of cars) {
    if (car.prep_final === true || car.prepFinal === true || car.prepReady === true) ready++;
    for (const field of ['cardexpiry', 'cardExpiry', 'licenseexpiry', 'licenseExpiry', 'insuranceExpiry', 'inspectionExpiry']) {
      const expiry = asDate(car[field]);
      if (!expiry) continue;
      const delta = Math.floor((new Date(`${expiry}T00:00:00+03:00`).getTime() - today) / 86400000);
      if (delta < 0) expired++;
      else if (delta <= 7) due7++;
    }
  }
  const title = kind === 'daily' ? 'التقرير اليومي للأسطول' : 'تنبيه المستندات الأسبوعي';
  const message = kind === 'daily'
    ? `التاريخ: ${date}\nإجمالي السيارات: ${cars.length}\nجاهزة للتأجير: ${ready}\nمستندات منتهية: ${expired}\nمستندات تنتهي خلال 7 أيام: ${due7}`
    : `التاريخ: ${date}\nمستندات منتهية: ${expired}\nمستندات تنتهي خلال 7 أيام: ${due7}\nإجمالي السيارات: ${cars.length}`;
  return { subject: `يهماء — ${title}`, message };
}

async function deliver(adminClient: ReturnType<typeof createClient>, fromEmail: string, resendKey: string, subject: string, message: string, role?: string, targetUserId?: string) {
  let allowedIds: Set<string> | null = null;
  if (role && role !== 'all') {
    const { data, error } = await adminClient.from('profiles').select('id').eq('role', role);
    if (error) throw error;
    allowedIds = new Set((data || []).map((profile) => profile.id));
  }

  const recipients: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users || [];
    for (const user of users) {
      if (user.email && (!allowedIds || allowedIds.has(user.id)) && (!targetUserId || targetUserId === user.id)) recipients.push(user.email);
    }
    if (users.length < 1000) break;
  }
  const unique = [...new Map(recipients.map((email) => [email.toLowerCase(), email])).values()];
  if (!unique.length) return { sent: 0, failed: 0, error: 'لا يوجد مستلمون لديهم بريد إلكتروني' };
  if (emailjsConfig()) return sendViaEmailjs(unique, subject, message);

  const safeMessage = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100).map((email) => ({
      from: fromEmail,
      to: [email],
      subject,
      text: `${message}\n\n— منصة يهماء لتأجير السيارات`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.8">${safeMessage}</div><hr><div dir="rtl" style="color:#667085">منصة يهماء لتأجير السيارات</div>`,
    }));
    const mailResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await mailResponse.json().catch(() => ({}));
    if (!mailResponse.ok) {
      failed += batch.length;
      firstError ||= String(result.message || result.name || `خطأ مزود البريد (${mailResponse.status})`);
    } else sent += batch.length;
  }
  return { sent, failed, error: firstError };
}

async function runSchedule(adminClient: ReturnType<typeof createClient>, fromEmail: string, resendKey: string) {
  const { data: schedule, error } = await adminClient.from('email_schedule')
    .select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!schedule?.enabled) return { checked: true, sent: 0 };

  const now = riyadhNow();
  const dailyDue = now.time >= String(schedule.daily_time).slice(0, 5) && schedule.last_daily_date !== now.date;
  const weeklyDue = now.day === Number(schedule.weekly_day)
    && now.time >= String(schedule.weekly_time).slice(0, 5)
    && schedule.last_weekly_date !== now.date;
  if (!dailyDue && !weeklyDue) return { checked: true, sent: 0 };

  const claims: string[] = [];
  if (dailyDue) {
    let claim = adminClient.from('email_schedule').update({ last_daily_date: now.date }).eq('id', 1);
    claim = schedule.last_daily_date ? claim.eq('last_daily_date', schedule.last_daily_date) : claim.is('last_daily_date', null);
    const { data } = await claim.select('id');
    if (data?.length) claims.push('daily');
  }
  if (weeklyDue) {
    let claim = adminClient.from('email_schedule').update({ last_weekly_date: now.date }).eq('id', 1);
    claim = schedule.last_weekly_date ? claim.eq('last_weekly_date', schedule.last_weekly_date) : claim.is('last_weekly_date', null);
    const { data } = await claim.select('id');
    if (data?.length) claims.push('weekly');
  }
  if (!claims.length) return { checked: true, sent: 0 };

  try {
    const vehicles: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error: fleetError } = await adminClient.from('vehicles').select('*').range(offset, offset + 999);
      if (fleetError) throw fleetError;
      vehicles.push(...((data || []) as Record<string, unknown>[]));
      if (!data || data.length < 1000) break;
    }
    const outcomes = [];
    for (const kind of claims) {
      const { subject, message } = makeScheduledMessage(kind as 'daily' | 'weekly', vehicles, now.date);
      outcomes.push({ kind, ...(await deliver(adminClient, fromEmail, resendKey, subject, message)) });
    }
    /* تقرير الفحص لكل فرع — يُرسل مع نوبة الأسبوعي إن كانت هناك بريدات مسجّلة */
    if (claims.includes('weekly')) {
      const { data: contacts } = await adminClient.from('branch_contacts').select('branch_name,email,active');
      const active = (contacts || []).filter((c) => c.active !== false && c.email);
      if (active.length) {
        const reports = buildBranchInspectionReports(vehicles, now.date);
        let sent = 0;
        let failed = 0;
        const skipped: string[] = [];
        const errors: string[] = [];
        for (const contact of active) {
          const report = reports.find((r) => r.branch === contact.branch_name);
          if (!report) { skipped.push(contact.branch_name); continue; }
          const result = await sendToEmails([contact.email], report.subject, report.message, fromEmail, resendKey);
          sent += result.sent;
          failed += result.failed;
          if (result.error && errors.length < 3) errors.push(`${contact.branch_name}: ${result.error}`);
        }
        outcomes.push({ kind: 'weekly_branches', sent, failed, skipped, errors });
      }
    }
    for (const outcome of outcomes) {
      if (outcome.sent > 0) continue;
      const column = outcome.kind === 'daily' ? 'last_daily_date' : 'last_weekly_date';
      await adminClient.from('email_schedule').update({ [column]: null }).eq('id', 1).eq(column, now.date);
    }
    return { checked: true, outcomes };
  } catch (error) {
    for (const kind of claims) {
      const column = kind === 'daily' ? 'last_daily_date' : 'last_weekly_date';
      await adminClient.from('email_schedule').update({ [column]: null }).eq('id', 1).eq(column, now.date);
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('YAHMA_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const cronSecret = Deno.env.get('YAHMA_CRON_SECRET');

    if (cronSecret && req.headers.get('x-yahma-cron-secret') === cronSecret) {
      if (!mailReady(fromEmail, resendKey)) throw new Error('خدمة البريد غير مكتملة الإعداد');
      return response(await runSchedule(adminClient, fromEmail, resendKey));
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('يجب تسجيل الدخول أولًا');
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) throw new Error('جلسة الدخول غير صالحة');
    const { data: profile, error: profileError } = await adminClient.from('profiles')
      .select('role').eq('id', caller.id).single();
    if (profileError || !profile?.role) throw new Error('تعذر التحقق من صلاحية المستخدم');

    const body = await req.json();
    const action = String(body.action || '');
    if (action === 'mail_preflight') {
      if (!['admin', 'ops'].includes(profile.role)) throw new Error('غير مسموح');
      const ejs = emailjsConfig();
      const provider = ejs ? 'emailjs' : ((resendKey && fromEmail) ? 'resend' : 'none');
      return response({
        provider,
        ready: provider !== 'none',
        from: fromEmail || null,
        serviceId: ejs?.serviceId || null,
        hint: provider === 'none'
          ? 'أضف RESEND_API_KEY و RESEND_FROM_EMAIL في Edge Functions → Secrets'
          : (provider === 'resend' ? 'Resend جاهز — جرّب «📤 إرسال الآن»' : 'EmailJS جاهز'),
      });
    }
    if (action === 'list_branch_contacts') {
      if (profile.role !== 'admin') throw new Error('إدارة بريد الفروع متاحة للمدير فقط');
      const [{ data: contacts }, fleetRows] = await Promise.all([
        adminClient.from('branch_contacts').select('*').order('branch_name'),
        adminClient.from('vehicles').select('branch'),
      ]);
      const counts = new Map<string, number>();
      for (const row of fleetRows.data || []) {
        const name = String((row as Record<string, unknown>).branch || '').trim() || 'غير محدد';
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      const branches = [...counts.entries()].map(([name, cars]) => ({ name, cars })).sort((a, b) => b.cars - a.cars);
      return response({ contacts: contacts || [], branches });
    }
    if (action === 'save_branch_contacts') {
      if (profile.role !== 'admin') throw new Error('حفظ بريد الفروع متاح للمدير فقط');
      const items = Array.isArray(body.contacts) ? body.contacts : [];
      if (items.length > 200) throw new Error('عدد الفروع يتجاوز الحد المسموح');
      const saved: string[] = [];
      const errors: string[] = [];
      for (const raw of items) {
        const branchName = String(raw?.branch_name ?? '').trim();
        const email = String(raw?.email ?? '').trim().toLowerCase();
        if (!branchName || !email) continue;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`بريد غير صالح للفرع ${branchName}`); continue; }
        const { error } = await adminClient.from('branch_contacts').upsert({
          branch_name: branchName,
          email,
          phone: String(raw?.phone ?? '').trim() || null,
          active: raw?.active !== false,
          updated_by: caller.id,
          updated_at: new Date().toISOString(),
        });
        if (error) errors.push(`${branchName}: ${error.message}`);
        else saved.push(branchName);
      }
      return response({ saved: saved.length, errors });
    }
    if (action === 'preview_branch_inspection') {
      if (!['admin', 'ops'].includes(profile.role)) throw new Error('غير مسموح');
      const vehicles: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const { data, error: fleetError } = await adminClient.from('vehicles').select('*').range(offset, offset + 999);
        if (fleetError) throw fleetError;
        vehicles.push(...((data || []) as Record<string, unknown>[]));
        if (!data || data.length < 1000) break;
      }
      const date = riyadhNow().date;
      return response({ date, reports: buildBranchInspectionReports(vehicles, date) });
    }
    if (action === 'send_branch_inspection') {
      if (profile.role !== 'admin') throw new Error('إرسال تقرير الفروع متاح للمدير فقط');
      if (!mailReady(fromEmail, resendKey)) throw new Error('خدمة البريد غير مكتملة الإعداد');
      const only = Array.isArray(body.branches) ? body.branches.map((b: unknown) => String(b)) : [];
      const vehicles: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        const { data, error: fleetError } = await adminClient.from('vehicles').select('*').range(offset, offset + 999);
        if (fleetError) throw fleetError;
        vehicles.push(...((data || []) as Record<string, unknown>[]));
        if (!data || data.length < 1000) break;
      }
      const date = riyadhNow().date;
      const reports = buildBranchInspectionReports(vehicles, date);
      const { data: contacts } = await adminClient.from('branch_contacts').select('branch_name,email,active');
      const active = (contacts || []).filter((c) => c.active !== false && c.email && (!only.length || only.includes(String(c.branch_name))));
      if (!active.length) throw new Error('لا يوجد فروع ببريد مسجّل — أضف بريد الفرع أولًا');
      const results: { branch: string; pending: number; sent: number; failed: number; error?: string }[] = [];
      for (const contact of active) {
        const report = reports.find((r) => r.branch === String(contact.branch_name));
        const result = await sendToEmails([String(contact.email)], report ? report.subject : `يهماء — تقرير الفحص — ${contact.branch_name}`, report ? report.message : `لا توجد بيانات لهذا الفرع بتاريخ ${date}.`, fromEmail, resendKey);
        results.push({ branch: String(contact.branch_name), pending: report?.pending || 0, ...result });
      }
      return response({ date, sent: results.reduce((s, r) => s + r.sent, 0), failed: results.reduce((s, r) => s + r.failed, 0), results });
    }
    if (action === 'get_welcome_template') {
      if (profile.role !== 'admin') throw new Error('رسالة الترحيب متاحة للمدير فقط');
      const template = await readWelcomeTemplate(adminClient);
      /* أمثلة جاهزة عشان المدير يشوف إزاي الـplaceholders بتبان */
      const sample = { name: 'محمود حسن', role: ROLE_LABELS.admin, branch: 'فرع الشيخ زايد' };
      return response({
        subject: template.subject,
        body: template.body,
        enabled: template.enabled,
        fromDb: template.fromDb,
        loginUrl: siteUrl(),
        previewSubject: renderWelcome(template.subject, sample),
        previewBody: renderWelcome(template.body, sample),
        placeholders: ['{{name}}', '{{role}}', '{{branch}}', '{{login_url}}'],
        maxSubject: 180,
        maxBody: 4000,
      });
    }
    if (action === 'save_welcome_template') {
      if (profile.role !== 'admin') throw new Error('حفظ رسالة الترحيب متاح للمدير فقط');
      const subject = String(body.subject || '').trim();
      const text = String(body.body || '');
      if (!subject || subject.length > 180) throw new Error('عنوان الرسالة مطلوب وبحد أقصى 180 حرفًا');
      if (!text.trim()) throw new Error('نص رسالة الترحيب مطلوب');
      if (text.length > 4000) throw new Error('نص رسالة الترحيب يتجاوز 4000 حرف');
      const enabled = body.enabled !== false;
      const { data, error: writeError } = await adminClient.from('welcome_template')
        .upsert({ id: 1, subject, body: text, enabled, updated_by: caller.id, updated_at: new Date().toISOString() })
        .select('subject,body,enabled').single();
      if (writeError) throw writeError;
      return response({ saved: true, subject: data?.subject, enabled: data?.enabled });
    }
    if (action === 'list_report_recipients') {
      if (profile.role !== 'admin') throw new Error('اختيار مستلمي التقارير متاح للمدير فقط');
      const users: { id: string; email: string; name: string }[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const user of data.users || []) {
          if (user.email) users.push({ id: user.id, email: user.email, name: String(user.user_metadata?.full_name || user.user_metadata?.name || '') });
        }
        if ((data.users || []).length < 1000) break;
      }
      return response({ users });
    }
    if (!mailReady(fromEmail, resendKey)) throw new Error('خدمة البريد غير مكتملة الإعداد');
    if (action === 'send_report_pdf') {
      if (profile.role !== 'admin') throw new Error('إرسال التقارير متاح للمدير فقط');
      const subject = String(body.subject || '').trim();
      const message = String(body.message || '').trim();
      const filename = String(body.filename || 'yahma-report.pdf').replace(/[^\w.\-\u0600-\u06FF]/g, '_').slice(0, 120);
      const pdfBase64 = String(body.pdfBase64 || '');
      const recipientIds = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds.map((id: unknown) => String(id)))] : [];
      if (!subject || subject.length > 180) throw new Error('عنوان الرسالة مطلوب وبحد أقصى 180 حرفًا');
      if (message.length > 5000) throw new Error('نص الرسالة يتجاوز الحد المسموح');
      if (!filename.toLowerCase().endsWith('.pdf')) throw new Error('المرفق يجب أن يكون ملف PDF');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64) || pdfBase64.length < 100 || pdfBase64.length > 8_000_000) throw new Error('ملف PDF غير صالح أو أكبر من 6 ميجابايت');
      if (!recipientIds.length || recipientIds.length > 25) throw new Error('اختر من 1 إلى 25 مستخدمًا في كل عملية إرسال');

      const wanted = new Set(recipientIds);
      const recipients: { id: string; email: string }[] = [];
      for (let page = 1; page <= 20 && wanted.size; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const user of data.users || []) {
          if (wanted.has(user.id) && user.email) {
            recipients.push({ id: user.id, email: user.email });
            wanted.delete(user.id);
          }
        }
        if ((data.users || []).length < 1000) break;
      }
      if (wanted.size) throw new Error('بعض المستلمين غير موجودين أو بلا بريد إلكتروني');

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      const safeMessage = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      for (const recipient of recipients) {
        const mailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient.email],
            subject,
            text: `${message}\n\n— منصة يهماء لتأجير السيارات`,
            html: `<div dir="rtl" style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.8">${safeMessage}</div><hr><div dir="rtl" style="color:#667085">منصة يهماء لتأجير السيارات</div>`,
            attachments: [{ filename, content: pdfBase64, content_type: 'application/pdf' }],
          }),
        });
        const result = await mailResponse.json().catch(() => ({}));
        if (mailResponse.ok) sent++;
        else { failed++; if (errors.length < 3) errors.push(String(result.message || result.name || `خطأ مزود البريد (${mailResponse.status})`)); }
      }
      return response({ sent, failed, errors });
    }

    const event = String(body.event || '');
    if (event) {
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
      const clean = (value: unknown, max = 100) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
      if (event === 'vehicle_added' || event === 'vehicle_approved') {
        if (!['admin', 'ops'].includes(profile.role)) throw new Error('هذا الإشعار متاح لفريق التشغيل فقط');
        const label = event === 'vehicle_added' ? 'إضافة سيارة جديدة' : 'اعتماد سيارة جاهزة للتأجير';
        const subject = `يهماء — ${label}`;
        const message = `${label}\nرقم اللوحة: ${clean(payload.plate) || 'غير محدد'}\nالفرع: ${clean(payload.branch) || 'غير محدد'}\nتمت العملية بواسطة: ${clean(caller.user_metadata?.full_name || caller.email) || 'مستخدم المنصة'}`;
        const result = await deliver(adminClient, fromEmail, resendKey, subject, message, 'admin');
        if (!result.sent) throw new Error(result.error || 'لا يوجد مديرون لديهم بريد إلكتروني');
        return response(result);
      }
      if (event === 'account_created') {
        if (profile.role !== 'admin') throw new Error('إنشاء الحسابات متاح للمدير فقط');
        const targetUserId = clean(payload.userId, 64);
        if (!targetUserId) throw new Error('لم يتم تحديد الحساب الجديد');
        /* القالب يُقرأ من الجدول، و«إرسال الترحيب» من الـpayload:
           لو المدير شال التحديد من نموذج الإضافة، الحساب يتعمل
           والرسالة ما تتبعتش. */
        const template = await readWelcomeTemplate(adminClient);
        if (!template.enabled || payload.sendWelcome === false) {
          return response({ sent: 0, skipped: true, reason: 'معطّل' });
        }
        /* الدور والفرع من قاعدة البيانات مش من المتصفح: المتصفح
           caller واحد، والـpayload أرقام من أي حد تاني. */
        let fullName = clean(payload.name, 100);
        let roleLabel = '';
        let branchName = '';
        const { data: targetProfile } = await adminClient.from('profiles')
          .select('role,branch_name,full_name').eq('id', targetUserId).maybeSingle();
        if (targetProfile) {
          roleLabel = ROLE_LABELS[String(targetProfile.role)] || String(targetProfile.role || '');
          branchName = String(targetProfile.branch_name || '').trim();
          fullName = String(targetProfile.full_name || '').trim() || fullName;
        }
        const result = await deliver(
          adminClient,
          fromEmail,
          resendKey,
          renderWelcome(template.subject, { name: fullName, role: roleLabel, branch: branchName }),
          renderWelcome(template.body, { name: fullName, role: roleLabel, branch: branchName }),
          undefined,
          targetUserId,
        );
        if (!result.sent) throw new Error(result.error || 'تعذر العثور على بريد المستخدم الجديد');
        return response({ ...result, templateFromDb: template.fromDb });
      }
      throw new Error('نوع الحدث غير مدعوم');
    }

    if (profile.role !== 'admin') throw new Error('هذه العملية متاحة للمدير فقط');

    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const audience = String(body.audience || 'all');
    if (!subject || subject.length > 180) throw new Error('عنوان الرسالة مطلوب وبحد أقصى 180 حرفًا');
    if (!message || message.length > 20000) throw new Error('نص الرسالة مطلوب وبحد أقصى 20000 حرف');
    /* «مدير» كان ناقص من القائمة رغم إن الدور موجود(v175): التعميم
       لإداري بيدي «فئة المستلمين غير صالحة» وإنت مش داري السبب. */
    if (!['all', 'admin', 'manager', 'ops', 'view'].includes(audience)) throw new Error('فئة المستلمين غير صالحة');
    return response(await deliver(adminClient, fromEmail, resendKey, subject, message, audience));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'تعذر إرسال البريد' }, 400);
  }
});

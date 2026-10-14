/* sw.js — يهماء: تخزين هيكل التطبيق (offline shell) فقط.
 * لا يلمس أي طلب لـ Supabase أبدًا — الدخول والبيانات الحية لازم تدايمًا
 * تعدي عبر الشبكة، مش من الكاش.
 */
const CACHE_NAME = 'yahma-shell-v161';
const LOCAL_APP_SHELL = [
  './',
  './index.html',
  './diagnostic.html',
  /* style.css فُرّق إلى أربعة ملفات بنفس الترتيب (يجب أن يبقى 04 آخرًا) */
  './css/01-base.css',
  './css/02-components.css',
  './css/03-motion-layout.css',
  './css/04-dark-overrides.css',
  './assets/dashboard-hero.png',
  './app.js',
  /* app-core.js فُرّغ إلى ملف شاهد — محتواه في core/* بنفس الترتيب */
  './core/auth-boot.js',
  './core/branches-store.js',
  './core/sync.js',
  './core/report-glue.js',
  './core/render-router.js',
  './core/pdf-share.js',
  './core/excel-import.js',
  /* كتل استُخرجت من app-core.js (نفس ترتيب التنفيذ السابق) */
  './modules/audit-theme.js',
  './modules/notifications.js',
  './modules/preparation-live.js',
  './modules/vehicle-360.js',
  './modules/ops-intel.js',
  './modules/topbar-ui.js',
  './modules/app-version.js',
  './modules/nav-guard.js',
  './modules/perf-vtable.js',
  './manifest.json',
  /* modules/auth.js أُزيل: موقوف التحميل (كود ميت) — حتى لا يُثبَّت في الكاش */
  './modules/data.js',
  './modules/payments-store.js',
  './modules/email-schedule.js',
  './modules/branch-email.js',
  './modules/realtime.js',
  './modules/utils.js',
  './modules/readiness.js',
  './modules/export.js',
  './modules/fleet.js',
  './modules/reports.js',
  './modules/dashboard.js',
  './modules/branches.js',
  './modules/audit.js',
  './modules/preparation-data.js',
  './modules/preparation-history.js',
  './modules/renewals.js',
  './modules/renewals-ui.js',
  './modules/follow-up-ui.js',
  './modules/transfers-ui.js',
  './modules/vehicle-modal.js',
  './modules/vehicle-form.js',
  './modules/vehicle-operations.js',
  './modules/fleet-excel.js',
  './modules/smooth.js',
  './modules/cloud.js',
  './icon-192.png',
  './icon-512.png',
];
const OPTIONAL_CDN = [
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
];

/* التثبيت لازم يكون صامد: cache.addAll بيفشل ذرّيًا لو ملف واحد رجّع
   خطأ، وكان معناه إن التحديث كله بيموت صامت والمستخدم يفضل على
   نسخته القديمة للأبد. هنا بنضيف كل ملف لوحده — الملف الغلط لحاله
   مايضرّش الباقي. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled([
        ...LOCAL_APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
        ...OPTIONAL_CDN.map((url) => cache.add(url)),
      ]);
      const failed = results
        .map((r, i) => (r.status === 'rejected' ? (i < LOCAL_APP_SHELL.length ? LOCAL_APP_SHELL[i] : OPTIONAL_CDN[i - LOCAL_APP_SHELL.length]) : null))
        .filter(Boolean);
      if (failed.length) console.warn('[yahma-sw] precache failed for:', failed);
      /* الملف الأساسي لازم يكون موجود — من غيره التطبيق مش هيشتغل أصلاً */
      const core = await cache.match(new Request('./index.html', { cache: 'reload' }));
      if (!core) throw new Error('index.html precache failed');
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

/* بنطابق داخل كاش النسخة الحالية بس — مش أي كاش — عشان ما نقدّمش
   ملف من نسخة قديمة بالصدفة أثناء تداخل الكاشات. */
async function shellMatch(request, cacheName) {
  const cache = await caches.open(cacheName);
  let hit = await cache.match(request);
  if (hit) return hit;
  /* التنقل بـ ?query (زي ?v=157) مش بيلاقي './index.html' في الكاش */
  try {
    const url = new URL(request.url);
    if (request.mode === 'navigate' || url.pathname.endsWith('/')) {
      hit = await cache.match(new URL('./index.html', self.location.href).href);
      if (hit) return hit;
    }
  } catch (_) {}
  return null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // لا تلمس عمليات الحفظ/الرفع

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // اتصال Supabase (auth + بيانات + realtime) لازم يفضل حي دايمًا، بره الكاش تمامًا
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // ملفات التطبيق: الشبكة أولًا — يضمن أحدث كود على طول.
  // الكاش احتياطي بس لما الشبكة تفشل (تشغيل أوفلاين).
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => shellMatch(req, CACHE_NAME).then((hit) => hit || Response.error()))
    );
    return;
  }

  // مكتبات خارجية (CDN): الكاش أولًا — لأنها ثابتة ومش بتتغير.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => Response.error());
    })
  );
});

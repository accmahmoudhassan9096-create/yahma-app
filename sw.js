/* sw.js — يهماء: تخزين هيكل التطبيق (offline shell) فقط.
 * لا يلمس أي طلب لـ Supabase أبدًا — الدخول والبيانات الحية لازم تدايمًا
 * تعدي عبر الشبكة، مش من الكاش.
 */
const CACHE_NAME = 'yahma-shell-v194';
const LOCAL_APP_SHELL = [
  './',
  './index.html',
  './diagnostic.html',
  /* ⭐ المكتبات محلية مش CDN — كاش إجباري.
     لو الـCDN اتحجب، Supabase ماحمّلتش والتطبيق فتح «وضع محلي»
     وطلع 0 سيارة (اللي حصل لأمين على الآيفون). دلوقتي كل مكتبة
     لازمة موجودة عندنا وبتتكيّش مع التطبيق. */
  './vendor/supabase.min.js',
  './vendor/dexie.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './css/01-base.css',
  './css/02-components.css',
  './css/03-motion-layout.css',
  './css/04-dark-overrides.css',
  './assets/dashboard-hero.png',
  './app.js',
  './core/permissions.js',
  './core/auth-boot.js',
  './modules/app-lock.js',
  './core/branches-store.js',
  './core/sync.js',
  './core/report-glue.js',
  './core/render-router.js',
  './core/pdf-share.js',
  './core/excel-import.js',
  './modules/undo.js',
  './modules/error-bus.js',
  './modules/error-panel.js',
  './modules/offline-queue.js',
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
  './modules/data.js',
  './modules/payments-store.js',
  './modules/email-schedule.js',
  './modules/branch-email.js',
  './modules/realtime.js',
  './modules/utils.js',
  './modules/readiness.js',
  './modules/export.js',
  './modules/export-bar.js',
  './modules/dues.js',
  './modules/my-account.js',
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
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/images/layers.png',
  './vendor/images/layers-2x.png',
  './vendor/images/marker-icon.png',
  './css/fonts.css',
  './css/05-offline-badge.css',
  './fonts/cairo-000000.woff2',
  './fonts/cairo-010002.woff2',
  './fonts/cairo-060006.woff2',
  './icon-192.png',
  './icon-512.png',
];
/* مفيش CDN اختياري بقى.
   كان الخط من fonts.googleapis.com وكنا بنعمله cache كشبكة أمان.
   دلوقتي الخط local على نطاقنا (fonts/*.woff2، 79KB)، فمفيش أي
   سبب يفضل في القائمة — والقائمة دي كانتمعناها إنها آخر نقطة
   فشل في السلسلة. */
const OPTIONAL_CDN = [];

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
  } catch(_){yahmaErr(_,'sw.js:129');}
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

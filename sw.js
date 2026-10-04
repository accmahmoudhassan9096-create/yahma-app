/* sw.js — يهماء: تخزين هيكل التطبيق (offline shell) فقط.
 * لا يلمس أي طلب لـ Supabase أبدًا — الدخول والبيانات الحية لازم تدايمًا
 * تعدي عبر الشبكة، مش من الكاش.
 */
const CACHE_NAME = 'yahma-shell-v97';
const LOCAL_APP_SHELL = [
  './',
  './index.html',
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
  './modules/perf-vtable.js',
  './manifest.json',
  /* modules/auth.js أُزيل: موقوف التحميل (كود ميت) — حتى لا يُثبَّت في الكاش */
  './modules/data.js',
  './modules/email-schedule.js',
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
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(LOCAL_APP_SHELL);
        await Promise.allSettled(OPTIONAL_CDN.map((url) => cache.add(url)));
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // لا تلمس عمليات الحفظ/الرفع

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // اتصال Supabase (auth + بيانات + realtime) لازم يفضل حي دايمًا، بره الكاش تمامًا
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

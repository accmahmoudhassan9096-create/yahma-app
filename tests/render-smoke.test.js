/* ===== دوال الرسم: مفيش ReferenceError فيها =====

   ⚠️ العطل (2026-10-18): في modules/fleet-view.js كان مكتوب
      const selectedIds = _persistentFleetSelectedIds;
   — متغير مش معرّف في أي مكان بالمشروع. النتيجة:
     - تبويب «الأسطول» كان بيرمي ReferenceError وقت الرسم
     - الـcatch في render() كان بيرسم emergency fleet بدل الجدول
     - المستخدم شاف «السيارات بتتنقل بين التبويبات» من غير سبب

   الاختبار ده بيحلل ساكناً: لكل ملف فيه دوال رسم، بيتأكد إن أي
   اسم مستخدم جوّه الدالة معرّف (محلياً في نفس الدالة، أو عالمياً
   في المشروع، أو متاح في المتصفح). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* الأسماء اللي المتصفح بيوفّرها */
const BROWSER_GLOBALS = new Set([
  'window', 'document', 'console', 'alert', 'confirm', 'prompt', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch',
  'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'globalThis', 'self',
  'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
  'Proxy', 'Reflect', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'escape', 'unescape', 'Intl', 'URL',
  'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder',
  'Headers', 'Request', 'Response', 'AbortController', 'CustomEvent', 'Event', 'EventTarget',
  'HTMLElement', 'Element', 'Node', 'NodeList', 'XMLHttpRequest', 'Image', 'Audio', 'CSS',
  'caches', 'indexedDB', 'IDBKeyRange', 'Crypto', 'Notification', 'PushManager', 'ServiceWorker',
  'Client', 'Cache', 'CacheStorage', 'performance', 'screen', 'frames', 'crypto', 'structuredClone',
  'queueMicrotask', 'matchMedia', 'getComputedStyle', 'scrollTo', 'open', 'close', 'print',
  'undefined', 'NaN', 'Infinity', 'eval', 'isFinite',
  /* متغيرات عامة بتوفرها بيئة التطبيق (sandbox) */
  'supabaseClient', 'supabaseReady', 'fleet', 'branches', 'currentRole', 'currentTab',
  'currentUser', 'currentUserPermissions', 'currentUserName', 'currentUserBranch',
  'YahmaPerms', 'YahmaDB', 'YahmaExport', 'YahmaExportBar', 'YahmaPayments',
  'YahmaUsers', 
  'YahmaDashboard',
  'YahmaDashboardCore', 'YahmaDashboardView', 'YahmaFleet', 'YahmaFleetCore', 'YahmaFleetView',
  'YahmaTopbarUser', 'YahmaTopbarMenu', 'YahmaOpsCore', 'YahmaOpsUX', 'YahmaMyAccount',
  'YahmaAppLock', 'YahmaAppVersion', 'YahmaErrorPanel', 'YahmaAudit',
  'YahmaBranches', 'YahmaRenewals', 'YahmaPreparationData', 'YahmaVehicleForm',
  'YahmaVehicleModal', 'YahmaAppContext', 'YahmaUtils', 'YahmaFollowUp',
  'PAGE_PERMISSION_OPTIONS', 'ALL_YAHMA_TABS', 'fleetForTab', 'vehicleReadiness',
  'readinessStats', 'readinessReasons', 'dateStatus', 'textTag', 'cardDisplayStatus',
  'licenseDisplayStatus', 'inspectionDisplayStatus', 'prepStatusForCar', 'prepChecklistForCar',
  'loadInspectionPayments', 'loadPaidInspections', 'loadRenewedInspections', 'getPrepTasks',
  'savePrepTask', 'carStatusOut', 'canonicalBrand', 'normStatus', 'addDays', 'todayStr',
  'fmtDate', 'fmtCardNumber', 'escapeHtml', 'formatArabicDate', 'canRunPayments',
  'ensureXlsxReady', 'openModal', 'openVehicle360', 'removeSoldVehiclesByPlates',
  'defaultLicenseExpiry', 'normalizeDateValue', 'churnStats', 'carChurn', 'churnStats',
  'canBulkPayAction', 'canBulkHere', 'canDeleteHere', 'renderInspectionPayments',
  'renderPaidInspections', 'renderRenewedInspections', 'renderFollowUp',
  'renderBranches', 'renderPreparation', 'renderAuditPage', 'renderDashboard', 'renderFleet',
  'renderUsers', 'renderReports', 'renderAudit', 'saveData', 'loadData', 'loadBranches',
  'applyRole', 'applyBranchScopeUI', 'showBranchScopeNotice', 'applyTabEditPermission',
  'updateLastSyncLabel', 'showDataWarning', 'hideDataWarning', 'formatCurrency',
  'toastKbd', 'yahmaErr', 'openPrintWindow', 'openUserAdmin', 'openWelcomeEditor',
  'bindMobileTools', 'syncProfileMenu', 'closeMenu', 'positionMenu', 'openMenu',
  'fleetArr', 'today', 'daysBetween', 'parseDate', 'slaTargetFor', 'collectTasks',
  'expiryAlerts', 'readinessFailures', 'branchMetrics', 'taskSLA', 'buildOpsNotifications',
  'getCurrentActorName', 'rememberCarState', 'prevStateOf', 'isRenewed', 'doneStamp',
  'DONE_NOTE', 'PENDING_KEY', 'PAID_KEY',
  /* globals بتوفرها libraries أو الـHTML attributes */
  'html2canvas', 'jspdf', 'XLSX', 'L', 'supabase',
  /* HTML attributes شاippe كـbare identifier في HTML strings */
  'tabindex', 'quot', 'onclick', 'className', 'disabled', 'checked', 'href', 'target',
  'placeholder', 'value', 'type', 'name', 'id', 'style', 'src', 'alt', 'title', 'role',
  'readonly', 'required', 'minlength', 'maxlength', 'dir', 'lang', 'colspan', 'rowspan',
  'aria-label', 'aria-hidden', 'data-', 'label', 'option', 'select', 'input', 'button',
  'span', 'div', 'td', 'th', 'tr', 'tbody', 'thead', 'table', 'form', 'p', 'h1', 'h2',
  'h3', 'b', 'i', 'em', 'strong', 'small', 'pre', 'code', 'a', 'img', 'br', 'hr',
  /* أسماء متغيرات محلية شائعة — الـlocal detector بيقع أحياناً */
  'personal', 'lb', 'rq', 'muted', 'inherit', 'hidden', 'group', 'tabindex', 'quot',
  'onclick', 'className', 'disabled', 'checked', 'cx', 'cy', 'sw', 'r', 'fBrand', 'fType',
  'fModel', 'fCardSt', 'fCardCond', 'fLicSt', 'fLicCond', 'fInspSt', 'fInspCond',
  'fOwner', 'fBranch', 'fCity', 'fCarSt', 'fPrep', 'fBrand', 'fType', 'fModel',
  /* CSS values وأسماء شائعة */
  'E1E6F1', 'ellipsis', 'flex', 'between', 'arguments', 'normal', 'rej', 'res', 'ok',
  'err', 'e', 'i', 'j', 'k', 'n', 'm', 'v', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'f', 'g',
  'h', 'l', 'p', 'q', 'r', 's', 't', 'u', 'w', 'rb', 'rl', 'rows', 'cols', 'attr',
  /* رموز يونيكود بتظهر في نصوص */
  'u06F9', 'u0640',
  /* ⭐ كلمات جوه نصوص CSS (font-display:swap) — الـmasker مش بيعرف
     يميزها، فكانت بتطلع كأنها متغير مش معرّف. */
  'swap'
]);

/* ملفات فيها دوال رسم — دي اللي لو_referenceError بيظهر فيها */
const RENDER_FILES = [
  'core/render-router.js',
  'core/router-payments.js',
    'core/router-payments-item.js',
    'core/router-payments-bulk.js',
    'core/router-payments-pending.js',
    'core/router-payments-paid.js',
    'core/router-payments-renewed.js',
  'core/router-branches.js',
  'modules/fleet-view.js',
  'modules/fleet-core.js',
  'modules/dashboard-view.js',
  'modules/dashboard-core.js',

  'modules/users-tab.js',
  'modules/renewals-ui.js',
  'modules/topbar-ui.js',
  'modules/topbar-user.js',
  'modules/topbar-menu.js',
  'modules/ops-intel.js',
  'modules/ops-intel-core.js',
  'modules/my-account.js',
  'modules/audit-theme.js',
  'modules/branches.js',
  'modules/export.js',
  'modules/export-bar.js'
];

/* كل الأسماء المعرَّفة في المشروع (متغيرات + دوال + باراميترات) */
function allDefinedNames() {
  const names = new Set();
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (['node_modules', 'vendor', '.git'].includes(e.name)) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.js$/.test(e.name)) files.push(full);
    });
  };
  walk(ROOT);

  files.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    /* destructuring */
    for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        const n = t.includes(':') ? t.split(':').pop().trim() : t;
        if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
      });
    }
    for (const m of src.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t);
      });
    }
    /* باراميترات الدوال */
    for (const m of src.matchAll(/function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t);
      });
    }
    for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t);
      });
    }
    for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
    for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  });
  return names;
}

test('دوال الرسم: مفيش اسم مستخدم ومش معرّف (ReferenceError محتمل)', () => {
  const defined = allDefinedNames();
  BROWSER_GLOBALS.forEach((g) => defined.add(g));

  const problems = [];

  /* ===== قناع سلاسل متعمق — مهم =====
     الـregex البسيط ``..`` بيتلخبط مع الـnested templates
     (`..${cond ? `..` : ''}..`) فبيقفل على الباكتكس الغلط ويسيب
     أجزاء من الـHTML مكشوفة، وكلمات زي accept= بتتصادف معرفات
     كود — إيجابیات كاذبة. السكانير ده ماشي حرف بحرف: محتوى
     الـtemplate بيتمسّح، وكود ${..} بيفضل ظاهر (ده كود حقيقي)،
     وسلاسل ' و \" جوّاها بتتمسّح كمان. نفس الطول بالظبط عشان
     أرقام الأسطر تفضل صح. */
  function maskBackticks(input) {
    const chars = input.split('');
    function maskStr(i, q) {
      i++;
      while (i < chars.length) {
        if (chars[i] === '\\') { chars[i] = ' '; if (chars[i + 1] !== undefined) chars[i + 1] = ' '; i += 2; continue; }
        if (chars[i] === q) return i + 1;
        chars[i] = ' '; i++;
      }
      return i;
    }
    function maskTpl(i) {
      i++;
      while (i < chars.length) {
        const c = chars[i];
        if (c === '\\') { chars[i] = ' '; if (chars[i + 1] !== undefined) chars[i + 1] = ' '; i += 2; continue; }
        if (c === '$' && chars[i + 1] === '{') {
          let b = 1; i += 2;
          while (i < chars.length && b > 0) {
            const ch = chars[i];
            if (ch === '`') { i = maskTpl(i); continue; }
            if (ch === "'") { i = maskStr(i, "'"); continue; }
            if (ch === '"') { i = maskStr(i, '"'); continue; }
            if (ch === '/') { const e = maskRegex(i); if (e !== null) { i = e; b = Math.max(b,0); continue; } i++; continue; }
            if (ch === '{') b++;
            else if (ch === '}') b--;
            i++;
          }
          continue;
        }
        if (c === '`') return i + 1;
        /* نستثني \n و \r — لو رح إمساحهم، أرقام الأسطر بتتببظ */
        if (c === '\n' || c === '\r') { i++; continue; }
        chars[i] = ' '; i++;
      }
      return i;
    }
    /* الـregex literals زي /"/g فيها علامة تنصيص مش سلسلة.
       لو معرفناش نمسّحها، الاقتران بيتبوظ وكل السلاسل بعدها
       بتبقى مكشوفة (إيجابيات كاذبة زي viewBox/fill/charset).
       بنرجّع فهرسة الإغلاق، أو null لو مش regex للموضع ده. */
    function maskRegex(i) {
      /* السياق: Regex ليتبدأ بعد الافتتاحية / أو الرموز والكلمات المفتاحية */
      let j = i - 1;
      while (j >= 0 && (chars[j] === ' ' || chars[j] === '\n' || chars[j] === '\r')) j--;
      let regexOkay;
      if (j < 0) regexOkay = true;
      else {
        const pc = chars[j];
        if (/[\w$)\]]/.test(pc)) {
          /* بعد معرف أو إغلاق قوس: ممكن قسمة. بس لو الكلمة قبلها
             keyword زي return/typeof → regex. نرجع بعد الكلمة. */
          let k = j;
          while (k >= 0 && /[\w$]/.test(chars[k])) k--;
          const word = chars.slice(k + 1, j + 1).join('');
          regexOkay = /^(return|typeof|instanceof|in|of|case|delete|void|new|throw|do|else|yield|await)$/.test(word)
            && (k < 0 || !/[\w$]/.test(chars[k] || ''));
        } else regexOkay = true;
      }
      if (!regexOkay) return null;
      let m = i + 1, inClass = false, closed = false;
      while (m < chars.length) {
        const ch = chars[m];
        if (ch === '\n' || ch === '\r') break;
        if (ch === '\\') { m += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { closed = true; break; }
        m++;
      }
      if (!closed) return null;
      for (let t = i + 1; t < m; t++) chars[t] = ' ';
      m++;
      while (m < chars.length && /^[a-z]$/i.test(chars[m])) m++;
      return m;
    }
    let i = 0;
    while (i < chars.length) {
      const c = chars[i];
      if (c === "'") { i = maskStr(i, "'"); continue; }
      if (c === '"') { i = maskStr(i, '"'); continue; }
      if (c === '`') { i = maskTpl(i); continue; }
      if (c === '/') { const e = maskRegex(i); if (e !== null) { i = e; continue; } i++; continue; }
      i++;
    }
    return chars.join('');
  }

  const toMask = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));

  RENDER_FILES.forEach((rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, 'utf8');
    /* نفس الطول عشان أرقام الأسطر تفضل صحيحة */
    const codeMasked = maskBackticks(toMask(src));

    /* أسماء معرَّفة جوّه نفس الملف (باراميترات، متغيرات محلية) */
    const local = new Set();
    for (const m of codeMasked.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    /* ⭐ تعريفات متعددة في سطر واحد: const a = 1, b = 2, c = 3; */
    for (const m of codeMasked.matchAll(/\b(?:const|let|var)\s+([^;\n]+)/g)) {
      m[1].split(',').forEach((decl) => {
        const t = decl.split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(t)) local.add(t);
      });
    }
    /* destructuring: const { a, b: c } = ... / const [a, b] = ... */
    for (const m of codeMasked.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        const n = t.includes(':') ? t.split(':').pop().trim() : t;
        if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
      });
    }
    for (const m of codeMasked.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(t)) local.add(t);
      });
    }
    /* دوال معباراميتر واحد بين قوسين */
    for (const m of codeMasked.matchAll(/function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(t)) local.add(t);
      });
    }
    /* باراميترات arrow: (a, b) =>  أو  a => */
    for (const m of codeMasked.matchAll(/\(([^)]*)\)\s*=>/g)) {
      m[1].split(',').forEach((p) => {
        const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(t)) local.add(t);
      });
    }
    /* باراميترات arrow متداخلة: ((a, b) => ...) — الـregex البسيط بيقف بدري */
    for (const m of codeMasked.matchAll(/\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*[A-Za-z_$][\w$]*)*\s*\)\s*=>/g)) {
      local.add(m[1]);
    }
    /* باراميتر IIFE: (function (global) { */
    for (const m of codeMasked.matchAll(/\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    for (const m of codeMasked.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) local.add(m[1]);
    for (const m of codeMasked.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) local.add(m[1]);

    /* الأسماء المستخدمة كـbare identifier */
    for (const m of codeMasked.matchAll(/(^|[^\w$.'"`\]])([A-Za-z_$][\w$]*)\s*(?=[=;,)\[\]}]|\s*[,)\]}])/g)) {
      const name = m[2];
      if (name.length < 2) continue;
      if (defined.has(name) || local.has(name)) continue;
      /* literals */
      if (name === 'null' || name === 'true' || name === 'false') continue;
      /* كلمات JS */
      if (/^(if|else|for|while|do|return|typeof|instanceof|new|delete|void|throw|try|catch|finally|switch|case|default|break|continue|function|class|const|let|var|this|typeof|await|async|yield|of|in|get|set|static|extends|super|import|export)$/.test(name)) continue;
      /* object literal shorthand: { cx, cy } */
      if (new RegExp('[{,]\\s*' + name + '\\s*[,}]').test(codeMasked)) continue;
      const line = codeMasked.slice(0, m.index).split('\n').length;
      problems.push(rel + ':' + line + '  ' + name);
    }
  });

  assert.deepStrictEqual(problems, [],
    'أسماء ممكن ترمي ReferenceError (مش معرّفة في المشروع):\n  ' + problems.join('\n  '));
});


/*
 * modules/drive-backup.js — النسخ اليومي على جوجل درايف
 *
 * فكرة العمل:
 *  - النسخ اليومي الحقيقي الخادمي بيعمله Google Apps Script (trigger يومي)،
 *    وسكربت جاهز في supabase/drive-backup.gs — ده بيشتغل حتى لو التطبيق
 *    ما اتفتحش النهاردة خالص.
 *  - الوحدة دي بتعمل حاجتين:
 *      1) «رفع نسخة الآن» — بتبعت NSخة JSON من التطبيق نفسه لـ Web App
 *         (POST no-cors) فالنسخة تتحدّث حتى قبل ما السنبت يقرأ Supabase.
 *      2) «نسخة يومية تلقائية» — أول افتتاح كل يوم (لو الإعدادات متظبطة)
 *         بيرفع نسخة تلقائيًا من غير ما حد يدوس حاجة.
 *  - الإعدادات (رابط Web App + توكن) محفوظة localStorage لكل جهاز.
 *
 * أمان: التوكن بيتبعت مع كل طلب، والسكربت الخادمي بيرفض أي طلب من غيره.
 * لو مش متظبط — الزر يفتح نافذة الإعدادات ويرشد خطوات Setup.
 */
(function (global) {
  'use strict';

  var KEY = 'yahma-drive-backup-config';
  var LAST_PUSH_KEY = 'yahma-drive-backup-last-push';

  function readConfig() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var cfg = raw ? JSON.parse(raw) : {};
      return { url: String(cfg.url || '').trim(), token: String(cfg.token || '').trim() };
    } catch (_) {
      return { url: '', token: '' };
    }
  }

  function writeConfig(cfg) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify({
        url: String(cfg.url || '').trim(),
        token: String(cfg.token || '').trim()
      }));
    } catch (_) {}
  }

  function isConfigured() {
    var cfg = readConfig();
    return /^https:\/\/script\.google\.com\//i.test(cfg.url);
  }

  function todayLocal() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dd;
  }

  function toast(msg, isError) {
    try {
      if (!global.document) return;
      var old = global.document.getElementById('drive-toast');
      if (old) old.remove();
      var el = global.document.createElement('div');
      el.id = 'drive-toast';
      el.textContent = msg;
      el.style.cssText =
        'position:fixed;z-index:10090;left:50%;transform:translateX(-50%);' +
        'bottom:calc(18px + env(safe-area-inset-bottom,0px));' +
        'max-width:min(480px,calc(100vw - 24px));padding:12px 16px;border-radius:14px;' +
        'background:' + (isError ? '#FEE2E2' : '#0E8A68') + ';' +
        'color:' + (isError ? '#991B1B' : '#fff') + ';' +
        'font-size:12.5px;font-weight:700;text-align:center;' +
        'box-shadow:0 14px 34px rgba(15,25,60,.28);direction:rtl;font-family:inherit';
      global.document.body.appendChild(el);
      global.setTimeout(function () { if (el.isConnected) el.remove(); }, 4200);
    } catch (_) { try { global.alert && global.alert(msg); } catch (_) {} }
  }

  function buildPayload() {
    var fleetArr = [];
    try {
      var f = (typeof global.fleet !== 'undefined') ? global.fleet : null;
      fleetArr = Array.isArray(f) ? f : [];
    } catch (_) { fleetArr = []; }
    var auditArr = [];
    try {
      auditArr = JSON.parse(global.localStorage.getItem('yahma-audit') || '[]');
      if (!Array.isArray(auditArr)) auditArr = [];
    } catch (_) { auditArr = []; }
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      source: 'yahma-app-drive',
      fleet: fleetArr,
      audit: auditArr
    };
  }

  function pushNow(opts) {
    opts = opts || {};
    var cfg = readConfig();
    if (!isConfigured()) {
      if (!opts.silent) { toast('لازم تظبط رابط Web App الأول من «إعدادات النسخ على جوجل درايف»', true); }
      if (!opts.silent) openSetup();
      return Promise.resolve({ ok: false, reason: 'not-configured' });
    }
    if (typeof global.fetch !== 'function') {
      if (!opts.silent) toast('المتصفح مش بيدعم الرفع التلقائي — نزّل نسخة JSON يدويًا', true);
      return Promise.resolve({ ok: false, reason: 'no-fetch' });
    }
    var payload = buildPayload();
    var bodyObj = { token: cfg.token, payload: payload };
    var url = cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + 'action=push';
    return global.fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyObj)
    }).then(function () {
      try { global.localStorage.setItem(LAST_PUSH_KEY, todayLocal()); } catch (_) {}
      if (!opts.silent) toast('تم إرسال نسخة النهاردة لجوجل درايف ☁️');
      return { ok: true };
    }).catch(function (err) {
      if (!opts.silent) toast('تعذر الرفع لجوجل درايف: ' + (err && err.message ? err.message : 'خطأ شبكة'), true);
      return { ok: false, reason: 'network' };
    });
  }

  function fetchStatus() {
    var cfg = readConfig();
    if (!isConfigured()) return Promise.resolve({ ok: false, reason: 'not-configured' });
    return new Promise(function (resolve) {
      try {
        var cbName = '__yahmaDriveStatusCb';
        var done = false;
        var finish = function (result) {
          if (done) return; done = true;
          try { delete global[cbName]; } catch (_) {}
          resolve(result);
        };
        global[cbName] = function (data) { finish(data || { ok: false }); };
        var sep = cfg.url.indexOf('?') >= 0 ? '&' : '?';
        var full = cfg.url + sep + 'action=status&callback=' + cbName;
        if (cfg.token) full += '&token=' + encodeURIComponent(cfg.token);
        var script = global.document.createElement('script');
        script.src = full;
        script.onerror = function () { finish({ ok: false, reason: 'network' }); };
        global.setTimeout(function () { finish({ ok: false, reason: 'timeout' }); }, 15000);
        global.document.head.appendChild(script);
      } catch (err) {
        resolve({ ok: false, reason: 'error' });
      }
    });
  }

  function checkDaily() {
    try {
      if (!isConfigured()) return Promise.resolve({ ok: false, skipped: true });
      var last = '';
      try { last = global.localStorage.getItem(LAST_PUSH_KEY) || ''; } catch (_) {}
      if (last === todayLocal()) return Promise.resolve({ ok: false, skipped: true });
      return pushNow({ silent: true }).then(function (res) {
        if (res && res.ok) toast('نسخة النهاردة على جوجل درايف ☁️');
        return res;
      });
    } catch (_) {
      return Promise.resolve({ ok: false, skipped: true });
    }
  }

  function openSetup() {
    try {
      if (!global.document) return;
      var existing = global.document.getElementById('drive-overlay');
      if (existing) { existing.style.display = 'flex'; return; }
      var cfg = readConfig();
      var overlay = global.document.createElement('div');
      overlay.className = 'overlay';
      overlay.id = 'drive-overlay';
      overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:10085';
      var modal = global.document.createElement('div');
      modal.className = 'modal drive-modal';
      modal.innerHTML =
        '<h2>☁️ النسخ اليومي على جوجل درايف</h2>' +
        '<div class="field"><label for="drive-url">رابط Web App (من Apps Script)</label>' +
        '<input id="drive-url" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" value="' +
          String(cfg.url).replace(/"/g, '&quot;') + '"></div>' +
        '<div class="field" style="margin-top:10px"><label for="drive-token">التوكن السري (اختياري لكن مُستحسن)</label>' +
        '<input id="drive-token" dir="ltr" placeholder="HASH_SECRET اللي كتبته في السكربت" value="' +
          String(cfg.token).replace(/"/g, '&quot;') + '"></div>' +
        '<div id="drive-status-row" class="drive-status-row" hidden></div>' +
        '<div class="drive-hint">الإعداد بياخد دقيقة: افتح <b>supabase/DRIVE-BACKUP-SETUP.md</b> في المستودع وامشي على الخطوات — ' +
        'هتاخد رابط Web App + التوكن وتحطهم هنا. بعدها هتشتغل النسخة اليومية التلقائية على حساب جوجل الخاص بيك.</div>' +
        '<div class="modal-actions" style="margin-top:16px">' +
        '<div><button type="button" class="btn btn-ghost" id="drive-check">اختبار الاتصال</button></div>' +
        '<div class="modal-actions-right">' +
        '<button type="button" class="btn btn-ghost" id="drive-close">إغلاق</button>' +
        '<button type="button" class="btn btn-primary" id="drive-save">حفظ ورفع نسخة الآن</button>' +
        '</div></div>';
      overlay.appendChild(modal);
      global.document.body.appendChild(overlay);

      function close() { overlay.style.display = 'none'; }
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      global.document.getElementById('drive-close').addEventListener('click', close);

      global.document.getElementById('drive-check').addEventListener('click', function () {
        writeConfig({
          url: global.document.getElementById('drive-url').value,
          token: global.document.getElementById('drive-token').value
        });
        var row = global.document.getElementById('drive-status-row');
        row.hidden = false;
        row.textContent = 'جارِ الاتصال…';
        fetchStatus().then(function (res) {
          if (res && res.ok) {
            var when = res.lastBackupAt ? new Date(res.lastBackupAt).toLocaleString('ar-EG') : 'لسه مفيش نسخ';
            row.textContent = '✅ متصل! آخر نسخة محفوظة: ' + when;
          } else {
            row.textContent = '⚠️ الاتصال فشل (' + ((res && res.reason) || 'غير معروف') + ') — راجع الرابط والتوكن.';
            row.style.color = '#B45309';
          }
        });
      });

      global.document.getElementById('drive-save').addEventListener('click', function () {
        writeConfig({
          url: global.document.getElementById('drive-url').value,
          token: global.document.getElementById('drive-token').value
        });
        close();
        pushNow().then(function (res) {
          if (res && res.ok) {
            fetchStatus().then(function (st) {
              if (st && st.ok && st.lastBackupAt) {
                toast('تم الحفظ في جوجل درايف — آخر نسخة: ' + new Date(st.lastBackupAt).toLocaleString('ar-EG'));
              }
            });
          }
        });
      });
    } catch (_) {}
  }

  function bindButtons() {
    try {
      var up = global.document && global.document.getElementById('btn-drive-backup');
      if (up && !up._driveBound) {
        up._driveBound = true;
        up.addEventListener('click', function () { pushNow(); });
      }
      var setup = global.document && global.document.getElementById('btn-drive-setup');
      if (setup && !setup._driveBound) {
        setup._driveBound = true;
        setup.addEventListener('click', function () { openSetup(); });
      }
    } catch (_) {}
  }

  function init() {
    bindButtons();
    checkDaily();
  }

  global.YahmaDriveBackup = {
    checkDaily: checkDaily,
    fetchStatus: fetchStatus,
    getConfig: readConfig,
    init: init,
    isConfigured: isConfigured,
    openSetup: openSetup,
    pushNow: pushNow,
    setConfig: writeConfig
  };

  try {
    if (global.document) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
      } else {
        global.setTimeout(init, 0);
      }
      global.setTimeout(init, 2500);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);

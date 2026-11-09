/**
 * ============================================================
 * يهماء — النسخ اليومي التلقائي على جوجل درايف
 * Google Apps Script — ملف واحد، بيتعمل مرة واحدة، وبعدها النسخ شغال يوميًا
 * ------------------------------------------------------------
 * إيه اللي بيحصل:
 *  (أ) trigger يومي (في الوقت اللي تختاره) بيقرأ الأسطول من Supabase REST
 *      وينشئ/يحدّث ملف «fleet-backup-YYYY-MM-DD.json» في فولدر YAHMA-Backup
 *  (ب) الـ app بيرفع نسخة JSON (POST no-cors) على action=push
 *  (ج) action=status بيرجع آخر نسخة (JSONP) عشان التطبيق يعرضها ويتحقق
 *
 * الإعداد الكامل في: supabase/DRIVE-BACKUP-SETUP.md
 * ============================================================
 */

/* ====== لازم تستبدلهم بس XXXXXX ولازم تطابق keys.js/proto ====== */
var SB_URL = 'https://dzildqysxdlnfsmjttjg.supabase.co';
var SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxkcXlzeGRsbmZzbWp0dGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTU3NTMsImV4cCI6MjEwNTYzMTc1M30.UdcML-28I0ndel65IMBxfG7wMOZjRK9ZlrjTj_JFyVc';
/* التوكن السري — غيّره لأي حاجة، واكتبه في التطبيق حتة الموجّه */
var HASH_SECRET = 'YAHMA-CHANGE-ME-7f3a9';
var FOLDER_NAME = 'YAHMA-Backup';
var EMAIL_TO = ''; // اختياري: 'you@example.com' للتنبيه بالبريد بعد كل نسخة

/* ---------- الوصول للخصائص ---------- */
function props() {
  return {
    url: SB_URL,
    key: SB_ANON_KEY,
    token: HASH_SECRET,
    folder: FOLDER_NAME,
    email: EMAIL_TO
  };
}

function driveFolder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

/* ---------- fetch من Supabase REST مع pagination ---------- */
function fetchTable(table, extraParams, limit) {
  var pageSize = 1000;
  var offset = 0;
  var all = [];
  var p = props();
  var base = p.url + '/rest/v1/' + table + '?' + (extraParams || '') + 'select=*';
  while (true) {
    var url = base + '&' + 'offset=' + offset + '&limit=' + pageSize;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'apikey': p.key,
        'Authorization': 'Bearer ' + p.key,
        'Range': offset + '-' + (offset + pageSize - 1)
      },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Supabase ' + code + ' على جدول ' + table);
    }
    var rows = JSON.parse(resp.getContentText() || '[]');
    if (!rows || !rows.length) break;
    for (var i = 0; i < rows.length; i++) all.push(rows[i]);
    if (limit && all.length >= limit) return all.slice(0, limit);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function todayStr() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}

/**
 * الكتابة في درايف: نسخة لكل يوم بنفس الاسم، فالقديم يتحذف ويتحدّث مكانه
 * (فيه audit داخلي على تاريخ النسخة جوه الملف نفسه).
 */
function saveToDrive(payload) {
  var folder = driveFolder();
  var name = 'fleet-backup-' + todayStr() + '.json';
  var existing = folder.getFilesByName(name);
  var blob = Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json', name);
  while (existing.hasNext()) existing.next().remove();
  var file = folder.createFile(blob);
  return { name: name, id: file.getId() };
}

function indexEntry(payloadMeta) {
  /* index.json — سجل تواريخ النسخ (أخف من فتح كل الملفات) */
  var folder = driveFolder();
  var name = 'index.json';
  var list = [];
  var existing = folder.getFilesByName(name);
  if (existing.hasNext()) {
    try { list = JSON.parse(existing.next().getContentText() || '[]'); } catch (_) {}
    while (existing.hasNext()) existing.next().remove();
  }
  list = list.filter(function (e) { return e.date !== todayStr(); });
  list.unshift(payloadMeta);
  folder.createFile(Utilities.newBlob(JSON.stringify(list.slice(0, 365), null, 2), 'application/json', name));
}

function buildServerPayload() {
  var vehicles = fetchTable('vehicles', '');
  var snapshots = [];
  var audit = [];
  try { snapshots = fetchTable('fleet_daily_snapshots', ''); } catch (_) {}
  try { audit = fetchTable('audit_logs', 'order=created_at.desc&', 2000); } catch (_) {}
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    source: 'yahma-appscript-daily',
    counts: { vehicles: vehicles.length, snapshots: snapshots.length, audit: audit.length },
    fleet: vehicles,
    fleetDailySnapshots: snapshots,
    audit: audit
  };
}

/* ---------- (أ) النسخة اليومية الخادمية — تُستدعى بالـ trigger ---------- */
function backupDaily() {
  var payload = buildServerPayload();
  var saved = saveToDrive(payload);
  indexEntry({
    date: todayStr(),
    at: payload.exportedAt,
    name: saved.name,
    id: saved.id,
    counts: payload.counts
  });
  var p = props();
  if (p.email) {
    MailApp.sendEmail({
      to: p.email,
      subject: 'يهماء — نسخة يومية ' + todayStr(),
      body: 'تم حفظ النسخة اليومية في جوجل درايف (' + saved.name + ')\n' +
        'السيارات: ' + payload.counts.vehicles +
        '، اللقطات: ' + payload.counts.snapshots +
        '، سجل النشاط: ' + payload.counts.audit
    });
  }
  return saved;
}

/* ---------- تثبيت الـ trigger اليومي (نفّذ الدالة دي مرة واحدة) ---------- */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDaily')
    .timeBased()
    .atHour(2)             // الساعة 2 الفجر (وبتتغير لليوم اللي اخترته)
    .everyDays(1)
    .create();
  return 'Done: daily 2AM';
}

/* ---------- (ب) استقبال نسخة من التطبيق ---------- */
function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!data || typeof data !== 'object') return jsonOut({ ok: false, reason: 'bad-payload' });
    if ((data.token || '') !== props().token) return jsonOut({ ok: false, reason: 'bad-token' });
    if (!data.payload || !Array.isArray(data.payload.fleet)) return jsonOut({ ok: false, reason: 'bad-payload' });
    var saved = saveToDrive(data.payload);
    indexEntry({
      date: todayStr(),
      at: data.payload.exportedAt || new Date().toISOString(),
      name: saved.name,
      id: saved.id,
      counts: { vehicles: data.payload.fleet.length }
    });
    return jsonOut({ ok: true, name: saved.name, id: saved.id });
  } catch (err) {
    return jsonOut({ ok: false, reason: String(err && err.message || err).slice(0, 200) });
  }
}

/* ---------- (ج) الحالة + (اختياري) نسخة فورية ---------- */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || 'status';
  var callback = params.callback || '';
  try {
    if ((params.token || '') !== props().token) return jsonpOut({ ok: false, reason: 'bad-token' }, callback);
    if (action === 'backup') {
      var saved = backupDaily();
      return jsonpOut({ ok: true, name: saved.name, id: saved.id }, callback);
    }
    /* status */
    var folder = driveFolder();
    var files = folder.getFilesByName('fleet-backup-*.json');
    var last = null;
    while (files.hasNext()) {
      var f = files.next();
      var updated = f.getLastUpdated();
      if (!last || updated > last.at) last = { at: updated, name: f.getName(), id: f.getId() };
    }
    return jsonpOut({
      ok: true,
      lastBackupAt: last ? last.at.toISOString() : null,
      lastBackupName: last ? last.name : null
    }, callback);
  } catch (err) {
    return jsonpOut({ ok: false, reason: String(err && err.message || err).slice(0, 200) }, callback);
  }
}

/* ---------- مخرجات ---------- */
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonpOut(obj, callback) {
  var json = JSON.stringify(obj);
  var wrapped = callback ? (callback + '(' + json + ')') : json;
  return ContentService.createTextOutput(wrapped)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ---------- تشغيل يدوي للاختبار ---------- */
function testNow() {
  var res = backupDaily();
  return 'OK: ' + res.name;
}

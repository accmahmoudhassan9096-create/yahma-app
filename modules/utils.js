/* Shared pure helpers used by the classic-script modules. */
(function (global) {
  'use strict';

  function uid() { return 'c' + Date.now() + Math.floor(Math.random() * 10000); }

  function normalizeDateValue(value) {
    if (!value && value !== 0) return '';
    if (value && typeof value.toDate === 'function') value = value.toDate();
    if (value && typeof value === 'object' && value.seconds !== undefined) value = new Date(value.seconds * 1000);
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      const excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return excelDate.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }

  function daysFromNow(dateStr) {
    if (!dateStr) return null;
    const normalized = normalizeDateValue(dateStr);
    if (!normalized) return null;
    const d = new Date(normalized + 'T00:00:00');
    if (isNaN(d)) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  }

  function dateStatus(dateStr, soonThreshold = 30) {
    const days = daysFromNow(dateStr);
    if (days === null) return { level: 'grey', label: 'غير محدد', days: null };
    if (days < 0) return { level: 'red', label: 'منتهي منذ ' + Math.abs(days) + ' يوم', days };
    if (days <= soonThreshold) return { level: 'amber', label: 'خلال ' + days + ' يوم', days };
    return { level: 'green', label: 'ساري', days };
  }

  function licenseDisplayStatus(dateStr) {
    const status = dateStatus(dateStr);
    const labels = { green: 'نشطة', amber: 'قريبة', red: 'منتهية', grey: 'غير محددة' };
    return { level: status.level, label: labels[status.level] };
  }

  function cardDisplayStatus(dateStr, rawStatus = '') {
    const raw = String(rawStatus ?? '').trim();
    if (raw.includes('ملغ') || raw.includes('موقوف')) return { level: 'red', label: raw.includes('ملغ') ? 'ملغى' : 'موقوف' };
    const status = dateStatus(dateStr);
    const labels = { green: 'نشط', amber: 'قريب', red: 'منتهي', grey: 'غير محدد' };
    return { level: status.level, label: labels[status.level] };
  }

  function inspectionDisplayStatus(value) {
    const t = String(value ?? '').trim();
    if (!t || t === 'غير محدد') return { level: 'grey', label: 'غير محدد' };
    if (t === 'سليم' || t === 'تم الفحص' || t === 'ساري' || t.startsWith('ساري ')) return { level: 'green', label: t };
    if (t.includes('يحتاج')) return { level: 'amber', label: 'يحتاج فحص' };
    if (t.includes('لم يتم') || t.includes('منتهي') || t.includes('غير سليم')) return { level: 'red', label: 'لم يتم الفحص' };
    return { level: 'grey', label: t };
  }

  function textTag(value) {
    const t = String(value ?? '').trim();
    if (!t) return { level: 'grey', label: 'غير محدد' };
    if (t === 'نشط' || t === 'سليم' || t === 'ساري' || t.startsWith('ساري ') || t === 'موجودة' || t === 'مؤجرة') return { level: 'green', label: t };
    if (t.includes('يحتاج')) return { level: 'amber', label: t };
    if (t === 'للبيع') return { level: 'amber', label: t };
    if (t.includes('منتهي') || t.includes('ملغ') || t.includes('موقوف') || t.includes('لا يوجد') || t.includes('لم يتم') || t.includes('مسروق')) return { level: 'red', label: t };
    return { level: 'grey', label: t };
  }

  /* حالات السيارة الموحدة: موجودة/مؤجرة/تحت الصيانة/خارج الخدمة/مسروقة/للبيع (+مؤرشفة/مباعة كحالات نظام) */
  function carStatusOut(value){
    const s = String(value ?? '').trim();
    return s.includes('خارج') || s.includes('مسروق');
  }
  function carStatusActive(value){
    const s = String(value ?? '').trim();
    return !(s.includes('صيانة') || s.includes('خارج') || s.includes('مسروق') || s.includes('مباع') || s.includes('مؤرشفة'));
  }
  function carStatusMatch(value, want){
    const got = String(value ?? '').trim(), w = String(want ?? '').trim();
    if (!w) return true;
    if (got === w) return true;
    if (w === 'موجودة' && got === 'نشط') return true; // بيانات قديمة قبل التوحيد
    return false;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const normalized = normalizeDateValue(dateStr);
    if (!normalized) return '—';
    const d = new Date(normalized + 'T00:00:00');
    if (isNaN(d)) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function addDays(dateStr, n) {
    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  const api = {
    uid, normalizeDateValue, daysFromNow, dateStatus, licenseDisplayStatus,
    cardDisplayStatus, inspectionDisplayStatus, textTag, escapeHtml,
    fmtDate, addDays, todayStr, carStatusOut, carStatusActive, carStatusMatch
  };
  global.YahmaUtils = api;
  Object.assign(global, api);
})(typeof window !== 'undefined' ? window : this);

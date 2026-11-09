/*
 * modules/global-date.js — فلتر تاريخ عالمي في الهيدر
 *
 * القائمة المنسدلة فيها:
 *   - اليوم (مباشر) — القيمة الافتراضية، كل التبويبات تعرض البيانات الحالية
 *   - تواريخ اللقطات اليومية (fleet_daily_snapshots) مرتبة من الأحدث للأقدم
 *
 * عند اختيار تاريخ:
 *   - يُحفظ في localStorage (yahma-global-date-filter) و window.__yahmaGlobalDate
 *   - render-router يفلتر الأسطول على السيارات اللي اتحدثت في اليوم ده (updatedAt == التاريخ)
 *     فكل التبويبات اللي بتعرض صفوف (أسطول/فحص/رخص/تأمين/بطاقات/دفع) هتتأثر
 *   - تقرير "معدل التشغيل الزمني" بيستخدم التاريخ المختار كنهاية للفترة
 *   - لو مفيش سيارات اتحدثت في اليوم ده، الجداول هتطلع فاضية — وده مقصود عشان
 *     يفرّق بين "البيانات الحالية" و"اللي اتغيّر في يوم معيّن".
 */
(function (global) {
  'use strict';

  const KEY = 'yahma-global-date-filter';
  const SELECT_ID = 'global-date-filter';
  const BADGE_ID = 'global-date-badge';

  function getSelectedDate() {
    try {
      const v = global.localStorage.getItem(KEY);
      return v || '';
    } catch (_) {
      return (global.__yahmaGlobalDateFilter || '');
    }
  }

  function setSelectedDate(value) {
    const v = String(value || '').trim();
    try { global.localStorage.setItem(KEY, v); } catch (_) {}
    global.__yahmaGlobalDateFilter = v;
  }

  function fmtAr(iso) {
    // iso = YYYY-MM-DD → d/m/yyyy
    const parts = String(iso || '').slice(0, 10).split('-');
    if (parts.length !== 3) return iso || '';
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function distinctDatesFromSnaps(snaps) {
    const set = new Set();
    (Array.isArray(snaps) ? snaps : []).forEach((s) => {
      if (s && s.snapshot_date) set.add(String(s.snapshot_date).slice(0, 10));
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // الأحدث أولاً
  }

  function getLocalDates() {
    try {
      if (global.YahmaSnapshots && typeof global.YahmaSnapshots.readLocal === 'function') {
        return distinctDatesFromSnaps(global.YahmaSnapshots.readLocal());
      }
    } catch (_) {}
    return [];
  }

  function populate(dates, selected) {
    const sel = document.getElementById(SELECT_ID);
    if (!sel) return;
    const cur = (selected !== undefined) ? selected : sel.value;
    const opts = ['<option value="">اليوم (مباشر)</option>'];
    (dates || []).forEach((d) => {
      opts.push('<option value="' + d + '">' + fmtAr(d) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = cur || '';
    updateBadge();
  }

  function updateBadge() {
    const sel = document.getElementById(SELECT_ID);
    const badge = document.getElementById(BADGE_ID);
    const v = sel ? sel.value : getSelectedDate();
    if (badge) {
      if (v) {
        badge.hidden = false;
        badge.textContent = '📅 عرض ' + fmtAr(v);
      } else {
        badge.hidden = true;
        badge.textContent = '';
      }
    }
    const active = !!v;
    if (sel) sel.classList.toggle('is-active', active);
  }

  function bind() {
    const sel = document.getElementById(SELECT_ID);
    if (!sel || sel._bound) return;
    sel._bound = true;
    // التاريخ المحفوظ كقيمة ابتدائية
    const saved = getSelectedDate();
    populate(getLocalDates(), saved);
    // حاول تحميل تواريخ أحدث من Supabase في الخلفية
    try {
      if (global.YahmaSnapshots && typeof global.YahmaSnapshots.loadSnapshots === 'function') {
        Promise.resolve(global.YahmaSnapshots.loadSnapshots({})).then((rows) => {
          const dates = distinctDatesFromSnaps(rows);
          if (dates.length) populate(dates, sel.value);
        }).catch(() => {});
      }
    } catch (_) {}
    sel.addEventListener('change', function () {
      setSelectedDate(sel.value);
      updateBadge();
      // إعادة رسم للتبويب الحالي عشان الفلترة تتطبق على الجدول والملخصات
      try {
        if (typeof global.render === 'function') global.render();
        else if (typeof global.yahmaGoTab === 'function' && global.yahmaGetTab) global.yahmaGoTab(global.yahmaGetTab());
      } catch (_) {}
    });
    updateBadge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  global.YahmaGlobalDate = {
    getSelectedDate: getSelectedDate,
    setSelectedDate: setSelectedDate,
    getAvailableDates: getLocalDates,
    bind: bind,
    updateBadge: updateBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);

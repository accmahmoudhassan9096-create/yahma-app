/*
 * modules/global-date.js — فلتر تاريخ عالمي في كل التبويبات
 *
 * القائمة المنسدلة فيها: اليوم (مباشر) + تواريخ اللقطات اليومية.
 * الفلتر بيتحقن أعلى محتوى كل تبويب (مش في الهيدر)، واختيار يوم
 * بيأثر على فلترة الأسطول في كل التبويبات (render-router) وعلى
 * تقرير معدل التشغيل الزمني — زي ما المستخدم طلب بالظبط.
 */
(function (global) {
  'use strict';

  const KEY = 'yahma-global-date-filter';
  const SELECT_CLASS = 'global-date-select';

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

  function populateSelect(sel, dates, selected) {
    const cur = (selected !== undefined) ? selected : sel.value;
    const opts = ['<option value="">اليوم</option>'];
    (dates || []).forEach((d) => {
      opts.push('<option value="' + d + '">' + fmtAr(d) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = cur || '';
    sel.classList.toggle('is-active', !!sel.value);
  }

  function populateAll(dates) {
    const list = document.querySelectorAll('.' + SELECT_CLASS);
    list.forEach((sel) => populateSelect(sel, dates, getSelectedDate()));
  }

  function findSelects() {
    return Array.from(document.querySelectorAll('.' + SELECT_CLASS));
  }

  function bindSelect(sel) {
    if (!sel || sel._bound) return;
    sel._bound = true;
    sel.addEventListener('change', function () {
      setSelectedDate(sel.value);
      // مزامنة باقى الفلاتر الظاهرة
      findSelects().forEach((other) => {
        if (other !== sel) { other.value = sel.value; other.classList.toggle('is-active', !!sel.value); }
      });
      try {
        if (typeof global.render === 'function') global.render();
        else if (typeof global.yahmaGoTab === 'function' && global.yahmaGetTab) global.yahmaGoTab(global.yahmaGetTab());
      } catch (_) {}
    });
  }

  function bind() {
    const selects = findSelects();
    selects.forEach(bindSelect);
    // حاول تحميل تواريخ أحدث من Supabase في الخلفية
    try {
      if (global.YahmaSnapshots && typeof global.YahmaSnapshots.loadSnapshots === 'function') {
        Promise.resolve(global.YahmaSnapshots.loadSnapshots({})).then((rows) => {
          const dates = distinctDatesFromSnaps(rows);
          if (dates.length) populateAll(dates);
        }).catch(() => {});
      }
    } catch (_) {}
  }

  function updateBadge(iso) {
    var v = iso !== undefined ? String(iso || '') : getSelectedDate();
    var badge = document.getElementById('global-date-badge');
    if (!badge) {
      var tabs = document.querySelectorAll('.global-date-badge');
      tabs.forEach(function (b) {
        if (v) { b.hidden = false; b.textContent = fmtAr(v); }
        else { b.hidden = true; b.textContent = ''; }
      });
      return;
    }
    if (v) { badge.hidden = false; badge.textContent = fmtAr(v); }
    else { badge.hidden = true; badge.textContent = ''; }
  }

  // لما يحصل أي إعادة رسم للصفحة، اربط الفلاتر الجديدة
  document.addEventListener('DOMContentLoaded', bind);

  global.YahmaGlobalDate = {
    getSelectedDate: getSelectedDate,
    setSelectedDate: setSelectedDate,
    getAvailableDates: getLocalDates,
    bind: bind,
    updateBadge: updateBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);

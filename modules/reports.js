/* ===== modules/reports.js — تبويب «التقارير» =====

   التبويب ده للقراءة فقط: بيقرا الأسطول المحمّل أصلاً في الذاكرة
   (fleet) ويحوّله لتقارير جاهزة للعرض والتصدير — من غير أي طلب شبكة
   إضافي، فالأرقام هي نفس أرقام «الأسطول» بالظبط في نفس اللحظة.

   ⭐ مبدأ واحد بيحكم الملف كله:
      كل تقرير بيطلع **بيانات** (عناوين + صفوف أرقام)، وبعدين نفس
      الدالة هي اللي بترسمها على الشاشة أو تصدّرها Excel/PDF.
      يعني مفيش نسختين من نفس الحساب تفرّقوا مع الوقت.

   التقارير الثمانية:
     1) ملخص تنفيذي
     2) الجاهزية حسب الفرع
     3) الوثائق (كارت/رخصة/تأمين/فحص)
     4) الحالات وأسباب عدم الجاهزية + المناطق
     5) أعمار الأسطول
     6) الأداء التشغيلي (سعر اليوم والتشغيل والصيانة)
     7) قائمة المتابعة (السيارات اللي محتاجة إجراء)
     8) التنازلات

   ملاحظات مهمة:
   · الجاهزية بتيجي من YahmaReadiness.vehicle — نفس الدالة اللي
     الرئيسية والأسطول بيستخدموها، فمفيش تعريف تاني للجاهزية هنا.
   · «خارج الأسطول» من YahmaUtils.carStatusOut — نفس فلتر الأسطول.
   · التأمين والفحص مالهمش تاريخ انتهاء في قاعدة البيانات (بيتسجّلوا
     كحالة نصية)، فبيتعرضوا من الحالة مش من تاريخ.
*/
(function (global) {
  'use strict';

  var DAYS_IN_MONTH = 30;

  /* حالة الواجهة: التقرير المفتوح والفرع المختار.
     مش بنخزّنها في localStorage — التقارير شاشة عرض، وأول ما تدخل
     التبويب لازم تبدأ من الملخص التنفيذي. */
  var state = { report: 'overview', branch: '' };

  /* ============ أدوات صغيرة ============ */

  function esc(value) {
    var f = global.escapeHtml;
    return typeof f === 'function' ? f(value) : String(value == null ? '' : value);
  }

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n.toLocaleString('en') : '0';
  }

  function pctOf(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 1000) / 10;
  }

  function pctLabel(part, whole) {
    var p = pctOf(part, whole);
    return (p % 1 === 0 ? String(p) : p.toFixed(1)) + '%';
  }

  function daysLeft(dateStr) {
    var u = global.YahmaUtils;
    if (!u || typeof u.daysFromNow !== 'function') return null;
    try { return u.daysFromNow(dateStr); } catch (_) { return null; }
  }

  function readinessOf(car) {
    var R = global.YahmaReadiness;
    if (R && typeof R.vehicle === 'function') {
      try { return R.vehicle(car); } catch (_) { /* نكمل بالافتراضي */ }
    }
    return { ready: false, label: 'غير محددة', level: 'grey', failed: [] };
  }

  function regionLabel(id) {
    var defs = (global.YahmaUtils && global.YahmaUtils.REGION_DEFS) || [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i] && defs[i].id === id) return defs[i].label;
    }
    return 'المنطقة الوسطى';
  }

  function getFleet() {
    try {
      if (typeof global.yahmaGetFleet === 'function') {
        var list = global.yahmaGetFleet();
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (_) { /* نكمل بالمتغير */ }
    try {
      if (typeof fleet !== 'undefined' && Array.isArray(fleet)) return fleet;
    } catch (_) { /* مفيش بيانات */ }
    return [];
  }

  function sortPairs(obj) {
    return Object.keys(obj || {})
      .map(function (key) { return [key, obj[key]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
  }

  function emptyBuckets() {
    return { expired: 0, d30: 0, d60: 0, d90: 0, later: 0, none: 0 };
  }

  function bucketTotal(b) {
    return b.expired + b.d30 + b.d60 + b.d90 + b.later + b.none;
  }

  /* توزيع تاريخ الانتهاء: منتهي / خلال 30 / 31–60 / 61–90 / أبعد / بلا تاريخ */
  function bucketOf(days) {
    if (days === null || days === undefined || !isFinite(days)) return 'none';
    if (days < 0) return 'expired';
    if (days <= 30) return 'd30';
    if (days <= 60) return 'd60';
    if (days <= 90) return 'd90';
    return 'later';
  }

  function levelKey(level) {
    if (level === 'green') return 'active';
    if (level === 'amber') return 'soon';
    if (level === 'red') return 'expired';
    return 'none';
  }

  /* ============ تجميع الأرقام (مرة واحدة لكل رسم) ============ */

  function buildModel(list) {
    var u = global.YahmaUtils || {};
    var model = {
      total: list.length,
      ready: 0,
      prep: 0,
      out: 0,
      notReady: 0,
      labels: {},
      reasons: {},
      statuses: {},
      regions: {},
      branches: {},
      years: {},
      docs: { card: emptyBuckets(), license: emptyBuckets() },
      insurance: { active: 0, soon: 0, expired: 0, none: 0 },
      inspection: { active: 0, soon: 0, expired: 0, none: 0 },
      transfers: { done: 0, pending: 0, none: 0 }
    };

    list.forEach(function (car) {
      if (!car || typeof car !== 'object') return;

      var branch = String(car.branch || '').trim() || 'بدون فرع';
      var status = String(car.carStatus || '').trim() || 'بدون حالة';
      var isOut = typeof u.carStatusOut === 'function' ? !!u.carStatusOut(car.carStatus) : false;
      var read = readinessOf(car);

      model.statuses[status] = (model.statuses[status] || 0) + 1;

      var b = model.branches[branch];
      if (!b) {
        b = model.branches[branch] = {
          total: 0, ready: 0, prep: 0, out: 0,
          rateSum: 0, rateCount: 0, rentedDays: 0, maint: 0, km: 0, transferDone: 0
        };
      }
      b.total++;

      if (read.ready) {
        model.ready++;
        b.ready++;
      } else if (isOut) {
        model.out++;
        b.out++;
        model.reasons['خارج الأسطول'] = (model.reasons['خارج الأسطول'] || 0) + 1;
      } else {
        model.prep++;
        b.prep++;
        (read.failed || []).forEach(function (check) {
          if (!check || !check.label) return;
          model.reasons[check.label] = (model.reasons[check.label] || 0) + 1;
        });
      }

      var label = read.label || 'غير محددة';
      model.labels[label] = (model.labels[label] || 0) + 1;

      var region = 'central';
      if (typeof u.regionOfBranch === 'function') {
        try { region = u.regionOfBranch(branch, car.city); } catch (_) { region = 'central'; }
      }
      var reg = model.regions[region];
      if (!reg) reg = model.regions[region] = { total: 0, ready: 0 };
      reg.total++;
      if (read.ready) reg.ready++;

      model.docs.card[bucketOf(daysLeft(car.cardExpiry))]++;
      model.docs.license[bucketOf(daysLeft(car.licenseExpiry))]++;

      if (typeof u.textTag === 'function') {
        var ins = u.textTag(car.insuranceStatus);
        var insKey = levelKey(ins && ins.level);
        model.insurance[insKey]++;
      }
      if (typeof u.inspectionDisplayStatus === 'function') {
        var insp = u.inspectionDisplayStatus(car.inspectionStatus);
        var inspKey = levelKey(insp && insp.level);
        model.inspection[inspKey]++;
      }

      var year = Number(car.year);
      var yearKey = (isFinite(year) && year > 1950) ? String(year) : '';
      var yRec = model.years[yearKey];
      if (!yRec) yRec = model.years[yearKey] = { count: 0, rateSum: 0, rateCount: 0 };
      yRec.count++;

      var rate = Number(car.dailyRate);
      if (isFinite(rate) && rate > 0) {
        yRec.rateSum += rate;
        yRec.rateCount++;
        b.rateSum += rate;
        b.rateCount++;
      }

      var rented = Number(car.rentedDaysMonth);
      if (isFinite(rented) && rented > 0) b.rentedDays += rented;

      var maint = Number(car.maintenanceCost);
      if (isFinite(maint) && maint > 0) b.maint += maint;

      var km = Number(car.odometer);
      if (isFinite(km) && km > 0) b.km += km;

      var transferDone = String(car.transferDone || '').trim();
      var transferStatus = String(car.transferStatus || '').trim();
      if (transferDone === 'نعم') {
        model.transfers.done++;
        b.transferDone++;
      } else if (transferStatus === 'لم يتم التنازل' || transferStatus === 'قيد التنازل') {
        model.transfers.pending++;
      } else {
        model.transfers.none++;
      }
    });

    model.notReady = model.prep + model.out;
    return model;
  }

  function branchRows(model) {
    return Object.keys(model.branches)
      .map(function (name) {
        var b = model.branches[name];
        return {
          name: name,
          total: b.total,
          ready: b.ready,
          prep: b.prep,
          out: b.out,
          rateSum: b.rateSum,
          rateCount: b.rateCount,
          rentedDays: b.rentedDays,
          maint: b.maint,
          km: b.km,
          transferDone: b.transferDone,
          pct: pctOf(b.ready, b.total)
        };
      })
      .sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
  }

  function branchList(list) {
    var counts = {};
    list.forEach(function (car) {
      var name = String((car && car.branch) || '').trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    return sortPairs(counts).map(function (pair) { return { name: pair[0], count: pair[1] }; });
  }

  /* ============ رسم الجداول ============ */

  function barHtml(value) {
    var p = Number(value);
    if (!isFinite(p)) p = 0;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    var shown = (Math.round(p * 10) / 10);
    return '<span class="rp-bar"><i style="width:' + shown + '%"></i></span>'
      + '<b class="rp-bar-num">' + (shown % 1 === 0 ? String(shown) : shown.toFixed(1)) + '%</b>';
  }

  function cellHtml(value) {
    if (value === null || value === undefined || value === '') {
      return '<span class="rp-muted">—</span>';
    }
    if (typeof value === 'number') return num(value);
    return esc(value);
  }

  function tableHtml(section) {
    var barCol = typeof section.barCol === 'number' ? section.barCol : -1;
    var head = '<tr>' + section.headers.map(function (h) {
      return '<th>' + esc(h) + '</th>';
    }).join('') + '</tr>';

    var body = section.rows.map(function (row) {
      return '<tr>' + row.map(function (cell, i) {
        if (i === barCol) return '<td class="rp-pct">' + barHtml(cell) + '</td>';
        return '<td>' + cellHtml(cell) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var foot = '';
    if (section.foot) {
      foot = '<tfoot><tr>' + section.foot.map(function (cell, i) {
        if (i === barCol) return '<td class="rp-pct">' + barHtml(cell) + '</td>';
        return '<td>' + cellHtml(cell) + '</td>';
      }).join('') + '</tr></tfoot>';
    }

    return '<div class="rp-scroll"><table class="rp-table">'
      + '<thead>' + head + '</thead><tbody>' + body + '</tbody>' + foot
      + '</table></div>';
  }

  /* ============ التقارير ============ */

  function buildOverview(model) {
    var branches = branchRows(model);
    var weak = branches
      .filter(function (b) { return b.total >= 3; })
      .sort(function (a, b) { return a.pct - b.pct || b.total - a.total; })
      .slice(0, 8);

    var readyPct = pctOf(model.ready, model.total);

    var labelRows = sortPairs(model.labels).map(function (pair) {
      return [pair[0], pair[1], pctOf(pair[1], model.total)];
    });

    var reasonRows = sortPairs(model.reasons).map(function (pair) {
      return [pair[0], pair[1], pctOf(pair[1], model.notReady)];
    });

    return {
      title: 'ملخص تنفيذي',
      subtitle: 'صورة سريعة لحالة الأسطول: الجاهزية وأسباب التعطّل وأضعف الفروع.',
      kpis: [
        { label: 'إجمالي الأسطول', value: num(model.total) },
        { label: 'جاهزة للتأجير', value: num(model.ready), cls: 'good', hint: pctLabel(model.ready, model.total) + ' من الأسطول' },
        { label: 'تحتاج تجهيز', value: num(model.prep), cls: 'warn', hint: pctLabel(model.prep, model.total) },
        { label: 'خارج الأسطول', value: num(model.out), cls: 'bad', hint: pctLabel(model.out, model.total) },
        { label: 'مؤجرة الآن', value: num(model.statuses['مؤجرة'] || 0), hint: 'حسب حالة السيارة' },
        { label: 'نسبة الجاهزية', value: pctLabel(model.ready, model.total), cls: readyPct >= 70 ? 'good' : 'warn' }
      ],
      sections: [
        {
          title: 'توزيع الجاهزية',
          note: 'كل سيارة في خانة واحدة — من غير تكرار.',
          headers: ['الحالة', 'السيارات', 'النسبة'],
          rows: labelRows,
          foot: ['الإجمالي', model.total, model.total ? 100 : 0],
          barCol: 2
        },
        {
          title: 'أسباب عدم الجاهزية',
          note: 'السيارة تظهر تحت كل سبب ناقص فيها، فمجموع العمود أكبر من عدد السيارات.',
          headers: ['السبب', 'السيارات', 'النسبة من غير الجاهز'],
          rows: reasonRows,
          barCol: 2
        },
        {
          title: 'أضعف الفروع في الجاهزية',
          note: 'الفروع اللي فيها 3 سيارات أو أكثر — الأقل جاهزية الأول.',
          headers: ['الفرع', 'السيارات', 'جاهزة', 'نسبة الجاهزية'],
          rows: weak.map(function (b) { return [b.name, b.total, b.ready, b.pct]; }),
          barCol: 3
        }
      ]
    };
  }

  function buildReadiness(model) {
    var branches = branchRows(model);
    var readyPct = pctOf(model.ready, model.total);

    return {
      title: 'الجاهزية حسب الفرع',
      subtitle: 'كل فرع: عدده، الجاهز منه، اللي محتاج تجهيز، واللي خارج الأسطول.',
      kpis: [
        { label: 'نسبة الجاهزية', value: pctLabel(model.ready, model.total), cls: readyPct >= 70 ? 'good' : 'warn' },
        { label: 'جاهزة', value: num(model.ready), cls: 'good' },
        { label: 'تحتاج تجهيز', value: num(model.prep), cls: 'warn' },
        { label: 'خارج الأسطول', value: num(model.out), cls: 'bad' },
        { label: 'عدد الفروع', value: num(branches.length) },
        { label: 'إجمالي السيارات', value: num(model.total) }
      ],
      sections: [
        {
          title: 'جدول الفروع',
          note: 'الجاهزية = الأوراق الأربعة سليمة (كارت/رخصة/تأمين/فحص) والسيارة ليست خارج الأسطول.',
          headers: ['الفرع', 'السيارات', 'جاهزة', 'تحتاج تجهيز', 'خارج الأسطول', 'نسبة الجاهزية'],
          rows: branches.map(function (b) {
            return [b.name, b.total, b.ready, b.prep, b.out, b.pct];
          }),
          foot: ['الإجمالي', model.total, model.ready, model.prep, model.out, readyPct],
          barCol: 5
        }
      ]
    };
  }

  function buildDocs(model) {
    var card = model.docs.card;
    var license = model.docs.license;

    function docRow(label, buckets) {
      return [label, buckets.expired, buckets.d30, buckets.d60, buckets.d90, buckets.later, buckets.none, bucketTotal(buckets)];
    }

    var soonTotal = card.d30 + license.d30;

    return {
      title: 'الوثائق والتجديدات',
      subtitle: 'الكارت والرخصة بالتاريخ — والتأمين والفحص بالحالة المسجّلة.',
      kpis: [
        { label: 'كارت منتهي', value: num(card.expired), cls: 'bad' },
        { label: 'رخصة منتهية', value: num(license.expired), cls: 'bad' },
        { label: 'تنتهي خلال 30 يوم', value: num(soonTotal), cls: 'warn', hint: 'كارت + رخصة' },
        { label: 'تأمين منتهي', value: num(model.insurance.expired), cls: 'bad' },
        { label: 'فحص مطلوب', value: num(model.inspection.expired), cls: 'warn' },
        { label: 'بدون تاريخ', value: num(card.none + license.none), hint: 'كارت أو رخصة بلا تاريخ' }
      ],
      sections: [
        {
          title: 'الكارت والرخصة',
          note: 'عدد السيارات حسب أقرب تاريخ انتهاء لكل وثيقة.',
          headers: ['الوثيقة', 'منتهية', 'خلال 30 يوم', '31–60 يوم', '61–90 يوم', 'أكثر من 90 يوم', 'بدون تاريخ', 'الإجمالي'],
          rows: [docRow('كارت التشغيل', card), docRow('الرخصة', license)],
          foot: ['الإجمالي', card.expired + license.expired, card.d30 + license.d30, card.d60 + license.d60,
            card.d90 + license.d90, card.later + license.later, card.none + license.none,
            bucketTotal(card) + bucketTotal(license)]
        },
        {
          title: 'التأمين والفحص',
          note: 'مالهمش تاريخ انتهاء في النظام — بيتسجّلوا كحالة، فالعدّ من الحالة.',
          headers: ['الوثيقة', 'ساري', 'ينتهي قريبًا', 'منتهي / غير ساري', 'بدون / غير محدد'],
          rows: [
            ['التأمين', model.insurance.active, model.insurance.soon, model.insurance.expired, model.insurance.none],
            ['الفحص الدوري', model.inspection.active, model.inspection.soon, model.inspection.expired, model.inspection.none]
          ]
        }
      ]
    };
  }

  function buildStates(model) {
    var statusRows = sortPairs(model.statuses).map(function (pair) {
      return [pair[0], pair[1], pctOf(pair[1], model.total)];
    });

    var reasonRows = sortPairs(model.reasons).map(function (pair) {
      return [pair[0], pair[1], pctOf(pair[1], model.notReady)];
    });

    var regionRows = Object.keys(model.regions).map(function (id) {
      var r = model.regions[id];
      return { id: id, total: r.total, ready: r.ready, pct: pctOf(r.ready, r.total) };
    }).sort(function (a, b) { return b.total - a.total; });

    return {
      title: 'الحالات والمناطق',
      subtitle: 'توزيع السيارات على الحالات، أسباب عدم الجاهزية، والمناطق الثلاث.',
      kpis: [
        { label: 'حالة «متاحة للإيجار»', value: num(model.statuses['متاحة للإيجار'] || 0), cls: 'good' },
        { label: 'حالة «مؤجرة»', value: num(model.statuses['مؤجرة'] || 0) },
        { label: 'تحت الصيانة', value: num(model.statuses['تحت الصيانة'] || 0), cls: 'warn' },
        { label: 'أسباب مختلفة', value: num(Object.keys(model.reasons).length) },
        { label: 'عدد الحالات', value: num(Object.keys(model.statuses).length) },
        { label: 'إجمالي السيارات', value: num(model.total) }
      ],
      sections: [
        {
          title: 'توزيع حالات الأسطول',
          headers: ['الحالة', 'السيارات', 'النسبة'],
          rows: statusRows,
          foot: ['الإجمالي', model.total, model.total ? 100 : 0],
          barCol: 2
        },
        {
          title: 'أسباب عدم الجاهزية',
          note: 'السيارة تظهر تحت كل سبب ناقص فيها.',
          headers: ['السبب', 'السيارات', 'النسبة من غير الجاهز'],
          rows: reasonRows,
          barCol: 2
        },
        {
          title: 'جاهزية المناطق',
          headers: ['المنطقة', 'السيارات', 'جاهزة', 'نسبة الجاهزية'],
          rows: regionRows.map(function (r) {
            return [regionLabel(r.id), r.total, r.ready, r.pct];
          }),
          barCol: 3
        }
      ]
    };
  }

  function buildAges(model) {
    var thisYear = new Date().getFullYear();
    var yearKeys = Object.keys(model.years)
      .filter(function (k) { return !!k; })
      .sort(function (a, b) { return Number(b) - Number(a); });

    var noYear = (model.years[''] && model.years[''].count) || 0;
    var counted = 0;
    var yearSum = 0;
    var rateSum = 0;
    var rateCount = 0;

    var rows = yearKeys.map(function (key) {
      var rec = model.years[key];
      counted += rec.count;
      yearSum += Number(key) * rec.count;
      if (rec.rateCount) rateSum += rec.rateSum;
      rateCount += rec.rateCount;
      return [
        key,
        Math.max(0, thisYear - Number(key)),
        rec.count,
        pctOf(rec.count, model.total),
        rec.rateCount ? Math.round(rec.rateSum / rec.rateCount) : 0
      ];
    });

    var avgYear = counted ? Math.round((yearSum / counted) * 10) / 10 : 0;
    var avgAge = counted ? Math.round((thisYear - avgYear) * 10) / 10 : 0;

    return {
      title: 'أعمار الأسطول',
      subtitle: 'توزيع السيارات على سنة الصنع، ومتوسط سعر اليوم لكل سنة.',
      kpis: [
        { label: 'متوسط سنة الصنع', value: avgYear ? String(avgYear) : '—' },
        { label: 'متوسط العمر', value: avgAge ? avgAge + ' سنة' : '—' },
        { label: 'سيارات بسنة مسجّلة', value: num(counted), cls: 'good' },
        { label: 'بدون سنة صنع', value: num(noYear), cls: noYear ? 'warn' : '' },
        { label: 'أقدم سنة', value: yearKeys.length ? yearKeys[yearKeys.length - 1] : '—' },
        { label: 'أحدث سنة', value: yearKeys.length ? yearKeys[0] : '—' }
      ],
      sections: [
        {
          title: 'توزيع سنة الصنع',
          note: 'العمر محسوب من سنة الصنع حتى سنة ' + thisYear + '.',
          headers: ['سنة الصنع', 'العمر (سنة)', 'السيارات', 'النسبة', 'متوسط سعر اليوم'],
          rows: rows,
          foot: ['الإجمالي', '', counted, counted ? pctOf(counted, model.total) : 0, rateCount ? Math.round(rateSum / rateCount) : 0],
          barCol: 3
        }
      ]
    };
  }

  function buildOps(model) {
    var branches = branchRows(model);
    var rateSum = 0;
    var rateCount = 0;
    var rentedDays = 0;
    var maint = 0;
    var km = 0;

    branches.forEach(function (b) {
      rateSum += b.rateSum;
      rateCount += b.rateCount;
      rentedDays += b.rentedDays;
      maint += b.maint;
      km += b.km;
    });

    var avgRate = rateCount ? Math.round(rateSum / rateCount) : 0;
    var capacity = Math.round(rateSum);
    var utilization = pctOf(rentedDays, model.total * DAYS_IN_MONTH);
    var avgKm = model.total ? Math.round(km / model.total) : 0;

    return {
      title: 'الأداء التشغيلي',
      subtitle: 'سعر اليوم وقيمة الأسطول وأيام التشغيل وتكلفة الصيانة لكل فرع.',
      kpis: [
        { label: 'متوسط سعر اليوم', value: num(avgRate) + ' ر.س' },
        { label: 'قيمة الأسطول اليومية', value: num(capacity) + ' ر.س', hint: 'لو كل السيارات اتأجرت يوم' },
        { label: 'نسبة التشغيل', value: pctLabel(rentedDays, model.total * DAYS_IN_MONTH), cls: utilization >= 60 ? 'good' : 'warn', hint: 'أيام التأجير ÷ 30 يوم' },
        { label: 'إجمالي الصيانة', value: num(Math.round(maint)) + ' ر.س' },
        { label: 'متوسط العداد', value: num(avgKm) + ' كم' },
        { label: 'سيارات بسعر يوم', value: num(rateCount) }
      ],
      sections: [
        {
          title: 'الأداء حسب الفرع',
          note: 'أيام التشغيل من عمود «أيام التأجير» المسجّل على كل سيارة، والنسبة من 30 يوم.',
          headers: ['الفرع', 'السيارات', 'متوسط سعر اليوم', 'قيمة اليوم', 'أيام التشغيل', 'نسبة التشغيل', 'الصيانة', 'متوسط العداد'],
          rows: branches.map(function (b) {
            return [
              b.name,
              b.total,
              b.rateCount ? Math.round(b.rateSum / b.rateCount) : 0,
              Math.round(b.rateSum),
              b.rentedDays,
              pctOf(b.rentedDays, b.total * DAYS_IN_MONTH),
              Math.round(b.maint),
              b.total ? Math.round(b.km / b.total) : 0
            ];
          }),
          foot: ['الإجمالي', model.total, avgRate, capacity, rentedDays,
            pctOf(rentedDays, model.total * DAYS_IN_MONTH), Math.round(maint), avgKm],
          barCol: 5
        }
      ]
    };
  }

  function buildWatch(model, list) {
    var rows = [];
    var scoreCount = {};

    (list || []).forEach(function (car) {
      if (!car || typeof car !== 'object') return;
      var read = readinessOf(car);
      if (read.ready) return;
      var failed = (read.failed || []).map(function (check) { return check && check.label; }).filter(Boolean);
      if (!failed.length) failed = [read.label || 'غير جاهزة'];
      scoreCount[failed.length] = (scoreCount[failed.length] || 0) + 1;
      rows.push({
        plate: String(car.plate || 'بدون لوحة'),
        branch: String(car.branch || '').trim() || 'بدون فرع',
        status: String(car.carStatus || '').trim() || 'بدون حالة',
        reasons: failed.join(' · '),
        score: failed.length
      });
    });

    rows.sort(function (a, b) { return b.score - a.score || a.plate.localeCompare(b.plate); });

    var LIMIT = 150;
    var shown = rows.slice(0, LIMIT);
    var heavy = rows.filter(function (r) { return r.score >= 3; }).length;

    var scoreRows = Object.keys(scoreCount)
      .map(function (k) { return Number(k); })
      .sort(function (a, b) { return b - a; })
      .map(function (k) { return [k, scoreCount[k], pctOf(scoreCount[k], rows.length)]; });

    return {
      title: 'قائمة المتابعة',
      subtitle: 'السيارات اللي محتاجة إجراء فعلي — الأكثر مشاكل الأول.',
      kpis: [
        { label: 'تحتاج إجراء', value: num(rows.length), cls: rows.length ? 'warn' : 'good' },
        { label: '٣ مشاكل أو أكثر', value: num(heavy), cls: 'bad' },
        { label: 'جاهزة (مستبعدة)', value: num(model.ready), cls: 'good' },
        { label: 'معروض في القائمة', value: num(shown.length) },
        { label: 'أعلى عدد مشاكل', value: num(rows.length ? rows[0].score : 0) },
        { label: 'خارج الأسطول', value: num(model.out), cls: 'bad' }
      ],
      sections: [
        {
          title: 'أولويات الإجراء',
          note: 'أعلى ' + LIMIT + ' سيارة بعدد المشاكل — التصدير بيشمل نفس الصفوف.',
          headers: ['اللوحة', 'الفرع', 'الحالة', 'الأسباب', 'عدد المشاكل'],
          rows: shown.map(function (r) {
            return [r.plate, r.branch, r.status, r.reasons, r.score];
          })
        },
        {
          title: 'توزيع عدد المشاكل',
          note: 'كل سيارة غير جاهزة متحسوبة مرة واحدة بعدد أسبابها.',
          headers: ['عدد المشاكل', 'السيارات', 'النسبة'],
          rows: scoreRows,
          barCol: 2
        }
      ]
    };
  }

  function buildTransfers(model) {
    var branches = branchRows(model)
      .filter(function (b) { return b.transferDone > 0; })
      .sort(function (a, b) { return b.transferDone - a.transferDone; });

    var started = model.transfers.done + model.transfers.pending;

    return {
      title: 'التنازلات',
      subtitle: 'السيارات اللي اتنازلت أو قيد التنازل، موزّعة على الفروع.',
      kpis: [
        { label: 'تم التنازل', value: num(model.transfers.done), cls: 'good' },
        { label: 'قيد التنازل', value: num(model.transfers.pending), cls: 'warn' },
        { label: 'لم يبدأ', value: num(model.transfers.none) },
        { label: 'نسبة المكتمل', value: pctLabel(model.transfers.done, model.total) },
        { label: 'ملفات مفتوحة', value: num(started - model.transfers.done) },
        { label: 'إجمالي السيارات', value: num(model.total) }
      ],
      sections: [
        {
          title: 'التنازلات حسب الفرع',
          note: branches.length ? 'الفروع اللي فيها تنازلات مسجّلة فقط.' : 'لا توجد سيارات مسجّلة كتنازل حتى الآن.',
          headers: ['الفرع', 'السيارات', 'تم التنازل', 'لم يتم', 'نسبة المكتمل'],
          rows: branches.map(function (b) {
            return [b.name, b.total, b.transferDone, b.total - b.transferDone, pctOf(b.transferDone, b.total)];
          }),
          barCol: 4
        }
      ]
    };
  }

  var REPORTS = [
    { id: 'overview', label: 'ملخص تنفيذي', build: buildOverview },
    { id: 'readiness', label: 'الجاهزية حسب الفرع', build: buildReadiness },
    { id: 'docs', label: 'الوثائق', build: buildDocs },
    { id: 'states', label: 'الحالات والمناطق', build: buildStates },
    { id: 'ages', label: 'الأعمار', build: buildAges },
    { id: 'ops', label: 'التشغيل', build: buildOps },
    { id: 'watch', label: 'قائمة المتابعة', build: buildWatch },
    { id: 'transfers', label: 'التنازلات', build: buildTransfers }
  ];

  /* ============ التحويل للتصدير ============ */

  function exportRow(section, row) {
    var barCol = typeof section.barCol === 'number' ? section.barCol : -1;
    return row.map(function (cell, i) {
      if (i === barCol) {
        var p = Number(cell);
        if (!isFinite(p)) p = 0;
        return (Math.round(p * 10) / 10) + '%';
      }
      if (typeof cell === 'number') return cell;
      return cell === null || cell === undefined ? '' : String(cell);
    });
  }

  function exportData(report, section) {
    var rows = (section.rows || []).map(function (row) { return exportRow(section, row); });
    if (section.foot) rows.push(exportRow(section, section.foot));
    return { headers: (section.headers || []).slice(), rows: rows };
  }

  function fileName(report, section) {
    var u = global.YahmaUtils;
    var stamp = (u && typeof u.todayStr === 'function') ? u.todayStr() : new Date().toISOString().slice(0, 10);
    return 'تقرير-' + report.title + '-' + section.title + '-' + stamp;
  }

  function exportSection(report, index, format) {
    var section = (report.sections || [])[index];
    if (!section) return;
    var data = exportData(report, section);
    if (!data.rows.length) {
      try { global.alert('لا توجد بيانات لتصديرها في هذا الجدول.'); } catch (_) { /* ignore */ }
      return;
    }
    var api = global.YahmaExport;
    if (!api) {
      try { global.alert('وحدة التصدير لم تُحمَّل بعد — أعد تحميل الصفحة.'); } catch (_) { /* ignore */ }
      return;
    }

    if (format === 'pdf') {
      if (typeof api.exportTablePdf === 'function') {
        api.exportTablePdf({
          title: report.title + ' — ' + section.title,
          subtitle: report.subtitle,
          headers: data.headers,
          rows: data.rows,
          filename: fileName(report, section) + '.pdf',
          buttonId: 'rp-pdf-' + index
        });
      }
      return;
    }

    if (typeof api.exportRowsToExcel === 'function') {
      Promise.resolve(api.exportRowsToExcel(fileName(report, section) + '.xlsx', section.title || report.title, data.headers, data.rows))
        .catch(function (err) {
          try { global.alert('تعذر تصدير Excel: ' + ((err && err.message) || err)); } catch (_) { /* ignore */ }
        });
    }
  }

  /* ============ الواجهة ============ */

  function kpiHtml(kpi) {
    return '<div class="rp-kpi ' + esc(kpi.cls || '') + '">'
      + '<span>' + esc(kpi.label) + '</span>'
      + '<b>' + esc(kpi.value) + '</b>'
      + (kpi.hint ? '<small>' + esc(kpi.hint) + '</small>' : '')
      + '</div>';
  }

  function sectionHtml(section, index) {
    var actions = '<div class="rp-card-actions">'
      + '<button type="button" class="rp-btn" data-rp-xlsx="' + index + '">📊 Excel</button>'
      + '<button type="button" class="rp-btn" data-rp-pdf="' + index + '" id="rp-pdf-' + index + '">📄 PDF</button>'
      + '</div>';

    var body = (section.rows && section.rows.length)
      ? tableHtml(section)
      : '<div class="rp-empty">لا توجد بيانات لعرضها في هذا الجدول.</div>';

    return '<div class="rp-card">'
      + '<div class="rp-card-head">'
      + '<div class="rp-card-title"><h3>' + esc(section.title) + '</h3>'
      + (section.note ? '<span class="muted-small">' + esc(section.note) + '</span>' : '')
      + '</div>' + actions + '</div>'
      + body
      + '</div>';
  }

  function shellHtml(report, branches, model) {
    var tabs = REPORTS.map(function (r) {
      return '<button type="button" class="rp-tab' + (r.id === state.report ? ' active' : '') + '"'
        + ' data-rp-report="' + r.id + '">' + esc(r.label) + '</button>';
    }).join('');

    var options = ['<option value="">كل الفروع (' + num(model.total) + ' سيارة)</option>'];
    branches.forEach(function (b) {
      options.push('<option value="' + esc(b.name) + '"' + (state.branch === b.name ? ' selected' : '') + '>'
        + esc(b.name) + ' (' + num(b.count) + ')</option>');
    });

    return '<div class="rp-head">'
      + '<div class="rp-head-text"><h2>تقارير الأسطول</h2>'
      + '<div class="muted-small">أرقام مباشرة من بيانات الأسطول المحمّلة — بدون أي حساب على السيرفر.</div></div>'
      + '<label class="rp-filter"><span>الفرع</span>'
      + '<select id="rp-branch">' + options.join('') + '</select></label>'
      + '</div>'
      + '<div class="rp-tabs">' + tabs + '</div>'
      + '<div class="rp-kpis">' + report.kpis.map(kpiHtml).join('') + '</div>'
      + report.sections.map(function (section, i) { return sectionHtml(section, i); }).join('');
  }

  function setPdfProvider(report) {
    var section = (report.sections || [])[0];
    global._yahmaCurrentPdfData = function () {
      var data = section ? exportData(report, section) : { headers: [], rows: [] };
      return {
        title: report.title + (section ? ' — ' + section.title : ''),
        subtitle: report.subtitle,
        headers: data.headers,
        rows: data.rows
      };
    };
  }

  function bind(content, report) {
    content.querySelectorAll('[data-rp-report]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-rp-report') || '';
        if (!id || id === state.report) return;
        state.report = id;
        renderReports(document.getElementById('content'));
      });
    });

    var select = content.querySelector('#rp-branch');
    if (select) {
      select.addEventListener('change', function () {
        state.branch = String(select.value || '');
        renderReports(document.getElementById('content'));
      });
    }

    content.querySelectorAll('[data-rp-xlsx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportSection(report, Number(btn.getAttribute('data-rp-xlsx')) || 0, 'xlsx');
      });
    });

    content.querySelectorAll('[data-rp-pdf]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        exportSection(report, Number(btn.getAttribute('data-rp-pdf')) || 0, 'pdf');
      });
    });
  }

  /* نقطة الدخول من render-router */
  function renderReports(content) {
    var host = content || document.getElementById('content');
    if (!host) return;

    var title = document.getElementById('topbar-title');
    var sub = document.getElementById('topbar-sub');
    if (title) title.textContent = 'التقارير';
    if (sub) sub.textContent = 'جاهزية ووثائق وأعمار وتشغيل الأسطول — جاهزة للتصدير Excel و PDF.';

    var all = getFleet();
    if (!all.length) {
      global._yahmaCurrentPdfData = null;
      host.innerHTML = '<div class="panel"><h3>لا توجد بيانات بعد</h3>'
        + '<p class="muted-small">لم يتم تحميل أي سيارة. افتح «الأسطول» أو انتظر مزامنة البيانات ثم ارجع للتقارير.</p></div>';
      return;
    }

    var branches = branchList(all);
    if (state.branch) {
      var known = branches.some(function (b) { return b.name === state.branch; });
      if (!known) state.branch = '';
    }

    var scoped = state.branch
      ? all.filter(function (car) { return String((car && car.branch) || '').trim() === state.branch; })
      : all;

    var model = buildModel(scoped);

    var active = REPORTS[0];
    REPORTS.forEach(function (r) { if (r.id === state.report) active = r; });
    state.report = active.id;

    var report = active.build(model, scoped);

    host.innerHTML = shellHtml(report, branches, model);
    bind(host, report);
    setPdfProvider(report);
  }

  global.YahmaReports = { render: renderReports };
  global.renderReports = renderReports;
})(typeof window !== 'undefined' ? window : globalThis);

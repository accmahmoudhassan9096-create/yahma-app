/* ===== modules/reports.js — تبويب «التقارير» =====

   التبويب ده للقراءة فقط: بيقرا الأسطول المحمّل أصلاً في الذاكرة
   (fleet) ويحوّله لتقارير جاهزة للعرض والتصدير — من غير أي طلب شبكة
   إضافي، فالأرقام هي نفس أرقام «الأسطول» بالظبط في نفس اللحظة.

   ⭐ مبدأ واحد بيحكم الملف كله:
      كل تقرير بيطلع **بيانات** (عناوين + صفوف أرقام)، وبعدين نفس
      الدالة هي اللي بترسمها على الشاشة أو تصدّرها Excel/PDF.
      يعني مفيش نسختين من نفس الحساب تفرّقوا مع الوقت.

   التقارير المتاحة:
     1) ملخص تنفيذي
     2) الجاهزية حسب الفرع
     3) دورة الفحص والمدفوعات والتجديد
     4) حركة الأسطول والسيارات الراكدة
     5) الصيانة ومراكز الخدمة والورش
     6) الشركات والملاك والتأمين
     7) الوثائق (كارت/رخصة/تأمين/فحص)
     8) الحالات وأسباب عدم الجاهزية + المناطق
     9) أعمار الأسطول
     10) التسعير والعداد (سعر اليوم وقيمة الأسطول واستهلاك كل فرع)
     11) قائمة المتابعة (السيارات اللي محتاجة إجراء)
     12) التنازلات

   ملاحظات مهمة:
   · الجاهزية بتيجي من YahmaReadiness.vehicle — نفس الدالة اللي
     الرئيسية والأسطول بيستخدموها، فمفيش تعريف تاني للجاهزية هنا.
   · «خارج الأسطول» من YahmaUtils.carStatusOut — نفس فلتر الأسطول.
   · التأمين والفحص مالهمش تاريخ انتهاء في قاعدة البيانات (بيتسجّلوا
     كحالة نصية)، فبيتعرضوا من الحالة مش من تاريخ.
*/
(function (global) {
  'use strict';

  /* حالة الواجهة: التقرير المفتوح والفرع المختار.
     مش بنخزّنها في localStorage — التقارير شاشة عرض، وأول ما تدخل
     التبويب لازم تبدأ من الملخص التنفيذي. */
  var state = { report: 'weekly', branch: '', period: '30' };
  var occupancyCache = null; // لقطات محمّلة من Supabase (async) — fallback محلي synchronously
  var occupancyLoading = false;
  var occupancyLoadedOnce = false; // يمنع حلقة التحميل اللانهائي (re-render → load → re-render)

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
      kmMax: 0,
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
          rateSum: 0, rateCount: 0, rentedDays: 0, maint: 0, km: 0, kmCount: 0,
          yearSum: 0, yearCount: 0, transferDone: 0
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

      if (yearKey) {
        b.yearSum += year;
        b.yearCount++;
      }

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
      if (isFinite(km) && km > 0) {
        b.km += km;
        b.kmCount++;
        if (km > model.kmMax) model.kmMax = km;
      }

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

    /* توزيع الفروع للرسم البياني */
    model.byBranch = Object.keys(model.branches)
      .map(function (name) { return { name: name, count: model.branches[name].total }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 8);

    /* حالة الوثائق الإجمالية للرسم البياني */
    model.docStatus = {
      card: model.docs.card.expired + model.docs.card.d30,
      license: model.docs.license.expired + model.docs.license.d30,
      insurance: model.insurance.expired + model.insurance.soon,
      inspection: model.inspection.expired + model.inspection.soon
    };

    /* توزيع الأعمار للرسم البياني */
    var now = new Date().getFullYear();
    var ageMap = {};
    Object.keys(model.years).forEach(function (y) {
      var age = now - Number(y);
      var key = age <= 3 ? '0–3 سنوات' : age <= 5 ? '4–5 سنوات' : age <= 8 ? '6–8 سنوات' : 'أكثر من 8 سنوات';
      ageMap[key] = (ageMap[key] || 0) + model.years[y].count;
    });
    model.ageBrackets = Object.keys(ageMap).map(function (k) { return { label: k, count: ageMap[k] }; });

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
          kmCount: b.kmCount,
          yearCount: b.yearCount,
          avgYear: b.yearCount ? Math.round((b.yearSum / b.yearCount) * 10) / 10 : 0,
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
    var km = 0;
    var kmCars = 0;
    var yearSum = 0;
    var yearCount = 0;

    branches.forEach(function (b) {
      rateSum += b.rateSum;
      rateCount += b.rateCount;
      km += b.km;
      kmCars += b.kmCount;
      yearSum += b.avgYear * b.yearCount;
      yearCount += b.yearCount;
    });

    var avgRate = rateCount ? Math.round(rateSum / rateCount) : 0;
    var capacity = Math.round(rateSum);
    var avgKm = kmCars ? Math.round(km / kmCars) : 0;
    var avgYear = yearCount ? Math.round((yearSum / yearCount) * 10) / 10 : 0;

    return {
      title: 'التسعير والعداد',
      subtitle: 'سعر اليوم وقيمة الأسطول واستهلاك كل فرع — من بيانات مسجّلة فعلاً على السيارات.',
      kpis: [
        { label: 'متوسط سعر اليوم', value: num(avgRate) + ' ر.س' },
        { label: 'قيمة الأسطول اليومية', value: num(capacity) + ' ر.س', hint: 'لو كل السيارات اتأجرت يوم' },
        { label: 'سيارات مسعّرة', value: num(rateCount), cls: rateCount === model.total ? 'good' : 'warn', hint: pctLabel(rateCount, model.total) + ' من الأسطول' },
        { label: 'متوسط العداد', value: num(avgKm) + ' كم' },
        { label: 'أعلى عداد', value: num(model.kmMax) + ' كم' },
        { label: 'متوسط سنة الصنع', value: avgYear ? String(avgYear) : '—' }
      ],
      sections: [
        {
          title: 'التسعير والعداد حسب الفرع',
          note: 'قيمة اليوم = مجموع سعر اليوم لكل سيارات الفرع.',
          headers: ['الفرع', 'السيارات', 'مسعّرة', 'نسبة المسعّرة', 'متوسط سعر اليوم', 'قيمة اليوم', 'متوسط العداد', 'متوسط سنة الصنع'],
          rows: branches.map(function (b) {
            return [
              b.name,
              b.total,
              b.rateCount,
              pctOf(b.rateCount, b.total),
              b.rateCount ? Math.round(b.rateSum / b.rateCount) : 0,
              Math.round(b.rateSum),
              b.kmCount ? Math.round(b.km / b.kmCount) : 0,
              b.avgYear || 0
            ];
          }),
          foot: ['الإجمالي', model.total, rateCount, pctOf(rateCount, model.total),
            avgRate, capacity, avgKm, avgYear],
          barCol: 3
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

  function buildPipeline(model, list) {
    var pData = (function () {
      var p = global.YahmaPayments;
      var pending = [];
      var paid = [];
      var renewed = [];
      var carMap = {};
      try {
        if (p && typeof p.localByStatus === 'function') {
          pending = p.localByStatus('pending') || [];
        }
        if (p && typeof p.pendingList === 'function') {
          paid = p.pendingList() || [];
        } else if (p && typeof p.localByStatus === 'function') {
          var allPaid = p.localByStatus('paid') || [];
          var isRen = typeof p.isRenewed === 'function' ? p.isRenewed : function () { return false; };
          paid = allPaid.filter(function (x) { return !isRen(x); });
          renewed = allPaid.filter(isRen);
        }
        if (p && typeof p.renewedList === 'function') {
          renewed = p.renewedList() || [];
        }
      } catch (_) {}
      pending.forEach(function (x) { if (x && x.carId) carMap[String(x.carId)] = { stage: 'تحت الدفع', item: x }; });
      paid.forEach(function (x) { if (x && x.carId) carMap[String(x.carId)] = { stage: 'تم الدفع', item: x }; });
      renewed.forEach(function (x) { if (x && x.carId) carMap[String(x.carId)] = { stage: 'تم التجديد', item: x }; });
      return { pending: pending, paid: paid, renewed: renewed, carMap: carMap };
    })();

    var bMap = {};
    var stageCounts = { insp: 0, pending: 0, paid: 0, renewed: 0 };
    var activeRows = [];

    (list || []).forEach(function (car) {
      if (!car) return;
      var bName = String(car.branch || '').trim() || 'بدون فرع';
      if (!bMap[bName]) bMap[bName] = { total: 0, insp: 0, pending: 0, paid: 0, renewed: 0 };
      bMap[bName].total++;

      var payInfo = pData.carMap[String(car.id)];
      var isInspNeeded = (typeof global.YahmaUtils !== 'undefined' && typeof global.YahmaUtils.inspectionDisplayStatus === 'function')
        ? global.YahmaUtils.inspectionDisplayStatus(car.inspectionStatus).level !== 'green'
        : (car.inspectionStatus === 'لم يفحص');

      if (payInfo) {
        if (payInfo.stage === 'تحت الدفع') {
          stageCounts.pending++;
          bMap[bName].pending++;
          activeRows.push({
            plate: car.plate || '—',
            branch: bName,
            stage: 'تحت الدفع',
            date: payInfo.item.requestedAt || '—',
            notes: car.notes || '—'
          });
        } else if (payInfo.stage === 'تم الدفع') {
          stageCounts.paid++;
          bMap[bName].paid++;
          activeRows.push({
            plate: car.plate || '—',
            branch: bName,
            stage: 'تم الدفع (بانتظار التجديد)',
            date: payInfo.item.paidAt || payInfo.item.requestedAt || '—',
            notes: car.notes || '—'
          });
        } else if (payInfo.stage === 'تم التجديد') {
          stageCounts.renewed++;
          bMap[bName].renewed++;
        }
      } else if (isInspNeeded) {
        stageCounts.insp++;
        bMap[bName].insp++;
      }
    });

    var bRows = Object.keys(bMap).map(function (name) {
      var b = bMap[name];
      var inPipeline = b.insp + b.pending + b.paid + b.renewed;
      var renPct = inPipeline ? pctOf(b.renewed, inPipeline) : 100;
      return [name, b.total, b.insp, b.pending, b.paid, b.renewed, renPct];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var totalInPipeline = stageCounts.insp + stageCounts.pending + stageCounts.paid + stageCounts.renewed;
    var estPaidFees = (stageCounts.paid + stageCounts.renewed) * 115;
    var renOverallPct = totalInPipeline ? pctOf(stageCounts.renewed, totalInPipeline) : 100;

    return {
      title: 'دورة الفحص والمدفوعات والتجديد',
      subtitle: 'متابعة مسار تجديد الأسطول: من الفحص الدوري إلى سداد الرسوم وإتمام تجديد رخصة السير.',
      kpis: [
        { label: 'تحت الفحص الدوري', value: num(stageCounts.insp), cls: stageCounts.insp ? 'warn' : 'good' },
        { label: 'تحت الدفع (معلقة)', value: num(stageCounts.pending), cls: stageCounts.pending ? 'bad' : 'good' },
        { label: 'تم الدفع (بانتظار التجديد)', value: num(stageCounts.paid), cls: stageCounts.paid ? 'warn' : 'good' },
        { label: 'تم التجديد بنجاح', value: num(stageCounts.renewed), cls: 'good' },
        { label: 'رسوم تم سدادها (تقديري)', value: num(estPaidFees) + ' ر.س', hint: '115 ر.س / فحص' },
        { label: 'نسبة إتمام التجديد', value: renOverallPct + '%', cls: renOverallPct >= 70 ? 'good' : 'warn' }
      ],
      sections: [
        {
          title: 'مراحل دورة الفحص والتجديد حسب الفرع',
          note: 'توزيع السيارات في مراحل الفحص والدفع والتجديد لكل فرع.',
          headers: ['الفرع', 'إجمالي السيارات', 'تحت الفحص', 'تحت الدفع', 'تم الدفع', 'تم التجديد', 'نسبة الإنجاز'],
          rows: bRows,
          foot: ['الإجمالي', model.total, stageCounts.insp, stageCounts.pending, stageCounts.paid, stageCounts.renewed, renOverallPct],
          barCol: 6
        },
        {
          title: 'السيارات العالقة في مسار الدفع والتجديد',
          note: 'السيارات التي تم طلب سدادها أو دفعها ولم تكتمل بعد لتجديد الرخصة.',
          headers: ['اللوحة', 'الفرع', 'المرحلة الحالية', 'تاريخ الحركة', 'الملاحظات'],
          rows: activeRows.slice(0, 150).map(function (r) {
            return [r.plate, r.branch, r.stage, r.date, r.notes];
          })
        }
      ]
    };
  }

  function buildMovement(model, list) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var bMap = {};
    var idle15Count = 0;
    var idle30Count = 0;
    var idle60Count = 0;
    var rentedNowCount = 0;
    var rentedDaysTotal = 0;
    var rentedDaysCars = 0;
    var maxIdleDays = 0;
    var idleList = [];

    (list || []).forEach(function (car) {
      if (!car) return;
      var bName = String(car.branch || '').trim() || 'بدون فرع';
      if (!bMap[bName]) {
        bMap[bName] = { total: 0, rentedNow: 0, idle15: 0, idle30: 0, rentedDaysSum: 0, rentedDaysCount: 0 };
      }
      bMap[bName].total++;

      var status = String(car.carStatus || '').trim();
      var isRentedNow = (status === 'مؤجرة');
      if (isRentedNow) {
        rentedNowCount++;
        bMap[bName].rentedNow++;
      }

      var days = null;
      if (car.daysSinceMovement !== undefined && car.daysSinceMovement !== null && car.daysSinceMovement !== '') {
        var n = Number(car.daysSinceMovement);
        if (isFinite(n) && n >= 0) days = n;
      }
      if (days === null && car.lastMovementDate) {
        var d = new Date(String(car.lastMovementDate).trim());
        if (!isNaN(d.getTime())) {
          days = Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }

      if (days !== null) {
        if (days > maxIdleDays) maxIdleDays = days;
        if (days >= 15) {
          idle15Count++;
          bMap[bName].idle15++;
        }
        if (days >= 30) {
          idle30Count++;
          bMap[bName].idle30++;
        }
        if (days >= 60) idle60Count++;

        if (days >= 15 && !isRentedNow) {
          idleList.push({
            plate: car.plate || '—',
            brandType: (car.brand || '') + ' ' + (car.type || car.model || ''),
            branch: bName,
            lastDate: car.lastMovementDate || '—',
            idleDays: days,
            status: status || '—',
            rate: car.dailyRate ? num(car.dailyRate) + ' ر.س' : '—'
          });
        }
      }

      var rDays = Number(car.rentedDaysMonth);
      if (isFinite(rDays) && rDays > 0) {
        rentedDaysTotal += rDays;
        rentedDaysCars++;
        bMap[bName].rentedDaysSum += rDays;
        bMap[bName].rentedDaysCount++;
      }
    });

    idleList.sort(function (a, b) { return b.idleDays - a.idleDays; });

    var bRows = Object.keys(bMap).map(function (name) {
      var b = bMap[name];
      var avgRented = b.rentedDaysCount ? Math.round((b.rentedDaysSum / b.rentedDaysCount) * 10) / 10 : 0;
      var utilPct = b.total ? pctOf(b.rentedNow, b.total) : 0;
      return [name, b.total, b.rentedNow, b.idle15, b.idle30, avgRented, utilPct];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var avgRentedDaysOverall = rentedDaysCars ? Math.round((rentedDaysTotal / rentedDaysCars) * 10) / 10 : 0;
    var overallUtilPct = model.total ? pctOf(rentedNowCount, model.total) : 0;

    return {
      title: 'حركة وتشغيل الأسطول (الراكدة والتشغيل)',
      subtitle: 'تحليل معدلات تشغيل الأسطول، وكشف السيارات الراكدة التي لم تتحرك منذ فترات طويلة.',
      kpis: [
        { label: 'مؤجرة الآن (نشطة)', value: num(rentedNowCount), cls: 'good', hint: overallUtilPct + '% نسبة التشغيل' },
        { label: 'راكدة (+15 يوم)', value: num(idle15Count), cls: idle15Count ? 'warn' : 'good' },
        { label: 'راكدة بشدة (+30 يوم)', value: num(idle30Count), cls: idle30Count ? 'bad' : 'good' },
        { label: 'حرجة (+60 يوم)', value: num(idle60Count), cls: idle60Count ? 'bad' : '' },
        { label: 'متوسط أيام التأجير', value: avgRentedDaysOverall ? avgRentedDaysOverall + ' يوم' : '—', hint: 'شهرياً للسيارة' },
        { label: 'أعلى فترة ركود', value: maxIdleDays ? maxIdleDays + ' يوم' : '—', cls: maxIdleDays > 45 ? 'bad' : '' }
      ],
      sections: [
        {
          title: 'تحليل التشغيل والركود حسب الفرع',
          note: 'نسبة التشغيل = السيارات المؤجرة حالياً ÷ إجمالي سيارات الفرع.',
          headers: ['الفرع', 'السيارات', 'مؤجرة حالياً', 'راكدة (+15 يوم)', 'راكدة (+30 يوم)', 'متوسط أيام التأجير', 'نسبة التشغيل'],
          rows: bRows,
          foot: ['الإجمالي', model.total, rentedNowCount, idle15Count, idle30Count, avgRentedDaysOverall, overallUtilPct],
          barCol: 6
        },
        {
          title: 'قائمة أعلى السيارات ركوداً (تتطلب تدخلاً تشغيلياً أو ترويجياً)',
          note: 'السيارات غير المؤجرة التي مضى على آخر حركة لها 15 يوماً فأكثر مرتبة من الأكثر ركوداً.',
          headers: ['اللوحة', 'الماركة / الفئة', 'الفرع', 'تاريخ آخر حركة', 'أيام الركود', 'الحالة الحالية', 'سعر اليوم'],
          rows: idleList.slice(0, 150).map(function (r) {
            return [r.plate, r.brandType, r.branch, r.lastDate, r.idleDays, r.status, r.rate];
          })
        }
      ]
    };
  }

  function buildMaintenance(model, list) {
    var bMap = {};
    var shopMap = {};
    var totalCost = 0;
    var maintCarsCount = 0;
    var underMaintCount = 0;
    var maxCarCost = 0;
    var maintList = [];

    (list || []).forEach(function (car) {
      if (!car) return;
      var bName = String(car.branch || '').trim() || 'بدون فرع';
      if (!bMap[bName]) bMap[bName] = { total: 0, cost: 0, cars: 0, underMaint: 0 };
      bMap[bName].total++;

      var status = String(car.carStatus || '').trim();
      var isUnderMaint = (status === 'تحت الصيانة' || status === 'صيانة');
      if (isUnderMaint) {
        underMaintCount++;
        bMap[bName].underMaint++;
      }

      var cost = Number(car.maintenanceCost);
      var hasCost = isFinite(cost) && cost > 0;
      var shop = String(car.workshop || '').trim();
      var nextServ = String(car.nextService || '').trim();
      var lastServ = String(car.lastMaintenance || '').trim();

      if (hasCost) {
        totalCost += cost;
        maintCarsCount++;
        bMap[bName].cost += cost;
        bMap[bName].cars++;
        if (cost > maxCarCost) maxCarCost = cost;
      }

      if (shop) {
        if (!shopMap[shop]) shopMap[shop] = { count: 0, cost: 0 };
        shopMap[shop].count++;
        if (hasCost) shopMap[shop].cost += cost;
      }

      if (hasCost || shop || nextServ || isUnderMaint) {
        maintList.push({
          plate: car.plate || '—',
          branch: bName,
          shop: shop || '—',
          nextService: nextServ || '—',
          lastMaint: lastServ || '—',
          cost: hasCost ? cost : 0,
          notes: car.maintenanceNotes || car.notes || '—'
        });
      }
    });

    maintList.sort(function (a, b) { return b.cost - a.cost; });

    var bRows = Object.keys(bMap).map(function (name) {
      var b = bMap[name];
      var avgCost = b.cars ? Math.round(b.cost / b.cars) : 0;
      return [name, b.total, b.cars, b.cost, avgCost, b.underMaint];
    }).sort(function (a, b) { return b[3] - a[3] || b[1] - a[1]; });

    var shopRows = Object.keys(shopMap).map(function (name) {
      var s = shopMap[name];
      var avgBill = s.count ? Math.round(s.cost / s.count) : 0;
      var costShare = totalCost ? pctOf(s.cost, totalCost) : 0;
      return [name, s.count, s.cost, avgBill, costShare];
    }).sort(function (a, b) { return b[2] - a[2] || b[1] - a[1]; });

    var avgOverallCost = maintCarsCount ? Math.round(totalCost / maintCarsCount) : 0;

    return {
      title: 'الصيانة ومراكز الخدمة والورش',
      subtitle: 'حصر تكاليف ومصروفات الصيانة، وتوزيع الأعمال على الورش ومراكز الصيانة، وتنبيهات الخدمة الدورية.',
      kpis: [
        { label: 'إجمالي تكاليف الصيانة', value: num(totalCost) + ' ر.س', cls: totalCost ? 'warn' : 'good' },
        { label: 'متوسط تكلفة السيارة', value: num(avgOverallCost) + ' ر.س', hint: 'لكل سيارة خضعت لصيانة' },
        { label: 'سيارات تحت الصيانة', value: num(underMaintCount), cls: underMaintCount ? 'warn' : 'good' },
        { label: 'سيارات ذات صيانة مسجلة', value: num(maintCarsCount) },
        { label: 'ورش ومراكز معتمدة', value: num(Object.keys(shopMap).length) },
        { label: 'أعلى تكلفة صيانة', value: num(maxCarCost) + ' ر.س' }
      ],
      sections: [
        {
          title: 'مصروفات الصيانة حسب الفرع',
          note: 'متوسط التكلفة = إجمالي التكلفة ÷ عدد السيارات التي خضعت للصيانة.',
          headers: ['الفرع', 'إجمالي السيارات', 'سيارات خضعت للصيانة', 'إجمالي التكلفة (ر.س)', 'متوسط التكلفة', 'تحت الصيانة حالياً'],
          rows: bRows,
          foot: ['الإجمالي', model.total, maintCarsCount, totalCost, avgOverallCost, underMaintCount]
        },
        {
          title: 'توزيع الأعمال والمصروفات حسب الورشة ومراكز الخدمة',
          note: 'حصر الورش المسجلة والمبالغ المنفقة في كل مركز.',
          headers: ['الورشة / المركز', 'السيارات المخدومة', 'إجمالي التكلفة (ر.س)', 'متوسط الفاتورة (ر.س)', 'النسبة من المصروفات'],
          rows: shopRows,
          foot: ['الإجمالي', maintCarsCount, totalCost, avgOverallCost, totalCost ? 100 : 0],
          barCol: 4
        },
        {
          title: 'السيارات الأكثر تكلفة في الصيانة أو ذات مواعيد قادمة',
          note: 'أعلى السيارات تكلفة صيانة مسجلة مرتبة تنازلياً.',
          headers: ['اللوحة', 'الفرع', 'الورشة', 'موعد الصيانة القادمة', 'آخر صيانة', 'التكلفة (ر.س)', 'ملاحظات الصيانة'],
          rows: maintList.slice(0, 150).map(function (r) {
            return [r.plate, r.branch, r.shop, r.nextService, r.lastMaint, r.cost, r.notes];
          })
        }
      ]
    };
  }

  function buildCompanies(model, list) {
    var compMap = {};
    var ownerMap = {};
    var insCompMap = {};
    var compCarsCount = 0;
    var ownerCarsCount = 0;

    (list || []).forEach(function (car) {
      if (!car) return;
      var cName = String(car.companyName || '').trim();
      var oName = String(car.owner || '').trim();
      var insComp = String(car.insuranceCompany || '').trim();
      var rate = Number(car.dailyRate);
      var validRate = isFinite(rate) && rate > 0 ? rate : 0;

      if (cName) {
        compCarsCount++;
        if (!compMap[cName]) compMap[cName] = { count: 0, rateSum: 0, rateCount: 0, accounts: new Set() };
        compMap[cName].count++;
        if (validRate) {
          compMap[cName].rateSum += validRate;
          compMap[cName].rateCount++;
        }
        if (car.accountNo) compMap[cName].accounts.add(String(car.accountNo).trim());
      }

      if (oName) {
        ownerCarsCount++;
        if (!ownerMap[oName]) ownerMap[oName] = { count: 0 };
        ownerMap[oName].count++;
      }

      if (insComp) {
        if (!insCompMap[insComp]) insCompMap[insComp] = { total: 0, active: 0, soon: 0, expired: 0 };
        insCompMap[insComp].total++;
        var ins = (typeof global.YahmaUtils !== 'undefined' && typeof global.YahmaUtils.textTag === 'function')
          ? global.YahmaUtils.textTag(car.insuranceStatus) : null;
        var lvl = ins && ins.level;
        if (lvl === 'green') insCompMap[insComp].active++;
        else if (lvl === 'amber') insCompMap[insComp].soon++;
        else insCompMap[insComp].expired++;
      }
    });

    var compRows = Object.keys(compMap).map(function (name) {
      var c = compMap[name];
      var avgRate = c.rateCount ? Math.round(c.rateSum / c.rateCount) : 0;
      var pct = pctOf(c.count, model.total);
      var accStr = c.accounts.size ? Array.from(c.accounts).slice(0, 3).join(', ') + (c.accounts.size > 3 ? '...' : '') : '—';
      return [name, c.count, pct, accStr, avgRate];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var insCompRows = Object.keys(insCompMap).map(function (name) {
      var ic = insCompMap[name];
      var validPct = ic.total ? pctOf(ic.active, ic.total) : 0;
      return [name, ic.total, ic.active, ic.soon, ic.expired, validPct];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var ownerRows = Object.keys(ownerMap).map(function (name) {
      var o = ownerMap[name];
      var pct = pctOf(o.count, model.total);
      return [name, o.count, pct];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var totalInsActive = model.insurance.active;
    var totalInsAll = model.insurance.active + model.insurance.soon + model.insurance.expired + model.insurance.none;
    var overallInsPct = totalInsAll ? pctOf(totalInsActive, totalInsAll) : 0;

    return {
      title: 'الشركات والملاك وشركات التأمين',
      subtitle: 'حصر الأسطول حسب شركات التمويل والتأجير وأرقام الحسابات، وتوزيع الملاك وتغطيات شركات التأمين.',
      kpis: [
        { label: 'شركات تمويل/تأجير', value: num(Object.keys(compMap).length) },
        { label: 'سيارات تابعة لشركات', value: num(compCarsCount), hint: pctLabel(compCarsCount, model.total) + ' من الأسطول' },
        { label: 'ملاك مسجلون', value: num(Object.keys(ownerMap).length) },
        { label: 'شركات تأمين معتمدة', value: num(Object.keys(insCompMap).length) },
        { label: 'نسبة سريان التأمين', value: overallInsPct + '%', cls: overallInsPct >= 80 ? 'good' : 'warn' },
        { label: 'إجمالي الأسطول', value: num(model.total) }
      ],
      sections: [
        {
          title: 'توزيع الأسطول حسب شركة التمويل / التأجير',
          note: 'حصر الشركات الممولة والمالكة وأرقام الحسابات المسجلة ومتوسط الأسعار.',
          headers: ['اسم الشركة', 'السيارات', 'النسبة من الأسطول', 'أرقام الحاسب المسجلة', 'متوسط سعر اليوم'],
          rows: compRows,
          foot: ['الإجمالي', compCarsCount, pctOf(compCarsCount, model.total), '—', '—'],
          barCol: 2
        },
        {
          title: 'تحليل وثائق التأمين حسب شركة التأمين',
          note: 'توزيع وثائق التأمين ونسب سريانها لكل شركة تأمين.',
          headers: ['شركة التأمين', 'إجمالي الوثائق', 'سارية', 'تنتهي قريباً', 'منتهية / غير سارية', 'نسبة السريان'],
          rows: insCompRows,
          barCol: 5
        },
        {
          title: 'توزيع الأسطول حسب المالك',
          note: 'حصر السيارات المسجلة بأسماء الملاك الأفراد.',
          headers: ['اسم المالك', 'السيارات', 'النسبة من الأسطول'],
          rows: ownerRows,
          foot: ['الإجمالي', ownerCarsCount, pctOf(ownerCarsCount, model.total)],
          barCol: 2
        }
      ]
    };
  }

  /* ============ تقرير الأسبوع ============
     تقرير واحد متوقف لكل مسؤول: أوراق منتهية بالفرع + حركة
     الدفعات آخر 7 أيام + ملخص بالأرقام. كل الأرقام محسوبة
     من الأسطول المحمّل ودفاتر المخزن — مش من السيرفر. */
  function buildWeekly(model, list) {
    var u = global.YahmaUtils || {};
    var daysLeftL = daysLeft;
    var fmtDateL = function (v) {
      if (!v) return '—';
      try { var f = typeof u.fmtDate === 'function' ? u.fmtDate(v) : ''; return f && f !== '؟' ? f : String(v).slice(0, 10); } catch (_) { return String(v).slice(0, 10); }
    };
    var carById = {};
    (list || []).forEach(function (car) { if (car && car.id) carById[String(car.id)] = car; });

    /* — أوراق منتهية بالفرع — */
    var byBranch = {};
    function bRec(name) {
      if (!name || !String(name).trim()) name = 'بدون فرع';
      if (!byBranch[name]) byBranch[name] = { total: 0, card: 0, ins: 0, lic: 0, docIssue: 0, ready: 0 };
      return byBranch[name];
    }
    var needCardTotal = 0, needInsTotal = 0, needLicTotal = 0;
    (list || []).forEach(function (car) {
      if (!car) return;
      var rec = bRec(car.branch);
      rec.total++;
      if (readinessOf(car).ready) rec.ready++;

      var cardBad = !!car.cardExpiry && (daysLeftL(car.cardExpiry) < 0);
      var licBad = !!car.licenseExpiry && (daysLeftL(car.licenseExpiry) < 0);
      var insBad = false;
      if (typeof u.textTag === 'function') {
        var insTag = u.textTag(car.insuranceStatus);
        insBad = !!insTag && insTag.level === 'red';
      } else {
        insBad = !!car.insuranceExpiry && (daysLeftL(car.insuranceExpiry) < 0);
      }
      var inspectionBad = false;
      if (typeof u.inspectionDisplayStatus === 'function') {
        var inspectionTag = u.inspectionDisplayStatus(car.inspectionStatus);
        inspectionBad = !!inspectionTag && inspectionTag.level === 'red';
      }
      if (cardBad) { rec.card++; needCardTotal++; }
      if (insBad) { rec.ins++; needInsTotal++; }
      if (licBad) { rec.lic++; needLicTotal++; }
      // احسب السيارة مرة واحدة فقط حتى لو عندها أكثر من وثيقة منتهية.
      if (cardBad || insBad || licBad || inspectionBad) rec.docIssue++;
    });
    var branchRowsWeekly = Object.keys(byBranch).map(function (name) {
      var r = byBranch[name];
      return { name: name, total: r.total, card: r.card, ins: r.ins, lic: r.lic, ready: r.ready };
    }).sort(function (a, b) {
      var wa = a.card * 3 + a.ins * 2 + a.lic, wb = b.card * 3 + b.ins * 2 + b.lic;
      return wb - wa || b.total - a.total;
    });

    /* — دفعات آخر 7 أيام — */
    var weekMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var weekRows = [];
    var weekCounts = { insp: 0, pending: 0, paid: 0, renewed: 0 };
    try {
      var p = global.YahmaPayments;
      var isRen = (p && typeof p.isRenewed === 'function') ? p.isRenewed : function () { return false; };
      var doneStampL = (p && typeof p.doneStamp === 'function') ? p.doneStamp : function () { return null; };
      function weeklyPush(items, stage, tsOf) {
        (items || []).forEach(function (x) {
          if (!x) return;
          var ts = tsOf(x);
          var t = ts ? new Date(ts).getTime() : NaN;
          if (isNaN(t) || t < weekMs) return;
          var car = carById[String(x.carId)];
          weekCounts[stage]++;
          weekRows.push({
            at: t,
            plate: (car && car.plate) || '—',
            branch: (car && car.branch) || '—',
            stage: stage,
            stamp: ts
          });
        });
      }
      if (p && typeof p.localByStatus === 'function') {
        weeklyPush(p.localByStatus('pending'), 'تحت الدفع', function (x) { return x.requestedAt; });
        var allPaid = p.localByStatus('paid') || [];
        weeklyPush(allPaid.filter(function (x) { return !isRen(x); }), 'تم الدفع', function (x) { return x.paidAt || x.requestedAt; });
        weeklyPush(allPaid.filter(isRen), 'تم التجديد', function (x) { return x.renewedLicense ? x.requestedAt : (doneStampL(x) || x.paidAt || x.requestedAt); });
      }
    } catch (_) {}
    weekRows.sort(function (a, b) { return b.at - a.at; });
    var weekShown = weekRows.slice(0, 100);

    /* — ملخص بالأرقام — */
    var sumRows = [
      ['دفعات اتحرّكت آخر 7 أيام', weekRows.length],
      ['— تحت الدفع', weekCounts.pending],
      ['— تم الدفع', weekCounts.paid],
      ['— تم التجديد', weekCounts.renewed],
      ['كروت منتهية (الأسطول المفلتر)', needCardTotal],
      ['تأمين منتهي (الأسطول المفلتر)', needInsTotal],
      ['رخص منتهية (الأسطول المفلتر)', needLicTotal],
      ['جاهزة للتأجير', model.ready],
      ['تنازلات مكتملة', model.transfers.done]
    ];

    // كروت فروع تفاعلية زي التصميم الجديد (اضغط أي فرع لتمييزه في فلتر الفرع)
    var topBranchesWeekly = branchRowsWeekly.slice(0, 8);
    var weeklyCardsHtml = '<div class="rp-cards-section"><div class="rp-section-head"><h3>نظرة سريعة على الفروع</h3><span class="muted-small">اضغط على أي فرع لتمييزه في الرسم البياني</span></div>'
      + '<div class="rp-branch-cards">'
      + topBranchesWeekly.map(function (r) {
          var docs = (r.total ? Math.round(((r.total - r.docIssue) / r.total) * 100) : 0);
          var readiness = (r.total ? Math.round((r.ready / r.total) * 100) : 0);
          return '<button type="button" class="rp-branch-card" data-rp-branch="' + esc(r.name) + '">'
            + '<span class="rp-branch-name">' + esc(r.name) + '</span>'
            + '<span class="rp-branch-total">' + num(r.total) + ' سيارة</span>'
            + '<span class="rp-branch-metrics"><span>جاهزية ' + readiness + '%</span><span>وثائق ' + docs + '%</span></span>'
            + '</button>';
        }).join('')
      + '</div></div>';

    return {
      title: 'تقرير الأسبوع',
      subtitle: 'ملخص أسبوعي: الأوراق المنتهية حسب الفرع وحركة الدفعات خلال آخر 7 أيام.',
      customHtml: weeklyCardsHtml,
      kpis: [
        { label: 'إجمالي الأسطول (المقفل)', value: num(model.total), icon: '🚗', tone: 'muted', pill: 'أساسي', trend: 'هذا الأسبوع', note: 'جميع المركبات المسجلة' },
        { label: 'كارت منتهي', value: num(needCardTotal), icon: '🪪', tone: 'red', pill: 'تنبيه', trend: 'أولوية عالية', note: 'بطاقات تشغيل تحتاج تجديداً' },
        { label: 'تأمين منتهي', value: num(needInsTotal), icon: '🛡️', tone: 'red', pill: 'تنبيه', trend: 'حالة حالية', note: 'مركبات تحتاج مراجعة التأمين' },
        { label: 'رخص منتهية', value: num(needLicTotal), icon: '📄', tone: 'orange', pill: 'انتباه', trend: 'يتطلب جدولة فورية', note: 'أكبر كتلة تجديد هذا الأسبوع' },
        { label: 'دفعات الأسبوع', value: num(weekRows.length), icon: '💳', tone: 'green', pill: 'إيجابي', trend: 'آخر 7 أيام', note: 'حركات الدفع المسجلة خلال الفترة' },
        { label: 'تجديدات الأسبوع', value: num(weekCounts.renewed), icon: '🔄', tone: 'muted', pill: 'معلق', trend: 'آخر 7 أيام', note: 'عمليات التجديد المسجلة خلال الفترة' }
      ],
      sections: [
        {
          title: 'الأوراق المنتهية حسب الفرع',
          note: 'مرتّب حسب الثقل: الكارت المنتهي أثقل الحالات — التأمين بعده.',
          headers: ['الفرع', 'السيارات', 'كارت منتهي', 'تأمين منتهي', 'رخصة منتهية', 'جاهزة'],
          rows: branchRowsWeekly.map(function (r) { return [r.name, r.total, r.card, r.ins, r.lic, r.ready]; }),
          foot: ['الإجمالي', model.total, needCardTotal, needInsTotal, needLicTotal, model.ready]
        },
        {
          title: 'حركة الدفعات — آخر 7 أيام',
          note: 'آخر 100 حركة. التاريخ بالتنسيق يوم/شهر/سنة.',
          headers: ['اللوحة', 'الفرع', 'المرحلة', 'التاريخ'],
          rows: weekShown.map(function (r) { return [r.plate, r.branch, r.stage, fmtDateL(r.stamp)]; })
        },
        {
          title: 'ملخص الأسبوع بالأرقام',
          note: 'الأعداد الأساسية اللي تخص الإدارة من النظرة السريعة.',
          headers: ['البند', 'العدد'],
          rows: sumRows
        }
      ]
    };
  }

  /* ============ دوال الرسوم البيانية SVG (تقارير مرئية) ============ */
  function escAttr(v) { return String(v == null ? '' : v).replace(/"/g, '&quot;'); }

  function barValue(max, val) { return max <= 0 ? 0 : Math.round((val / max) * 1000) / 10; }

  /* رسم مخطط أعمدة (Column Chart) */
  function svgColumnChart(labels, values, title, color) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var max = Math.max.apply(null, values.concat([1]));
    var W = 320, H = 180, padL = 36, padR = 12, padT = 28, padB = 32;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotW / Math.max(1, labels.length - 1);
    var bars = '', labs = '', grid = '';
    var gid = 'cg' + Math.floor(Math.random() * 1e9);
    var baseColor = color || '#0284c7';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gy = padT + plotH - f * plotH;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#E6EAF2" stroke-width="1" stroke-dasharray="4 4"/>';
    });
    values.forEach(function (v, i) {
      var h = Math.max(6, (v / max) * plotH);
      var x = padL + i * step;
      var y = H - padB - h;
      bars += '<rect x="' + (x - step / 3) + '" y="' + y + '" width="' + (step * 0.62) + '" height="' + h + '" fill="url(#' + gid + ')" rx="7"><title>' + esc(labels[i]) + ': ' + num(v) + '</title></rect>'
        + '<text x="' + x + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10" font-weight="800" fill="#111827">' + esc(num(v)) + '</text>';
      labs += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="9.5" fill="#6B7490" font-weight="700">' + esc(String(labels[i]).slice(0, 12)) + '</text>';
    });
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:170px;display:block"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + baseColor + '"/><stop offset="100%" stop-color="' + baseColor + '" stop-opacity=".65"/></linearGradient></defs><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid + bars + labs + '</svg><div class="rp-chart-note">' + num(values.reduce(function (a, b) { return a + b; }, 0)) + ' إجمالي</div></div>';
  }

  /* رسم مخطط أعمدة أفقية (Bar Chart) */
  function svgBarChart(labels, values, title, color) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var max = Math.max.apply(null, values.concat([1]));
    var W = 320, H = 190, padL = 96, padR = 28, padT = 22, padB = 22;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotH / Math.max(1, labels.length - 1);
    var bars = '', labs = '', vals = '', grid = '';
    var gid = 'bg' + Math.floor(Math.random() * 1e9);
    var baseColor = color || '#6366f1';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gx = padL + f * plotW;
      grid += '<line x1="' + gx + '" y1="' + padT + '" x2="' + gx + '" y2="' + (H - padB) + '" stroke="#EEF2F7" stroke-width="1" stroke-dasharray="4 4"/>';
    });
    values.forEach(function (v, i) {
      var w = Math.max(4, (v / max) * plotW);
      var y = padT + i * step;
      bars += '<rect x="' + padL + '" y="' + (y - step / 3) + '" width="' + w + '" height="' + (step * 0.58) + '" fill="url(#' + gid + ')" rx="7"><title>' + esc(labels[i]) + ': ' + num(v) + '</title></rect>';
      labs += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" font-weight="700" fill="#334155" title="' + esc(labels[i]) + '">' + esc(String(labels[i]).slice(0, 16)) + '</text>';
      vals += '<text x="' + (padL + w + 7) + '" y="' + (y + 4) + '" font-size="10" fill="#111827" font-weight="900">' + num(v) + '</text>';
    });
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:180px;display:block"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="' + baseColor + '" stop-opacity=".68"/><stop offset="100%" stop-color="' + baseColor + '"/></linearGradient></defs><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid + bars + labs + vals + '</svg></div>';
  }

  /* رسم مخطط خطي (Line Chart) */
  function svgLineChart(labels, values, title, color) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var max = Math.max.apply(null, values.concat([1]));
    var W = 340, H = 180, padL = 36, padR = 14, padT = 22, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotW / Math.max(1, values.length - 1);
    var pts = '', line = '', dots = '', labs = '', grid = '', gid = 'lg' + Math.floor(Math.random() * 1e9);
    var baseColor = color || '#6366f1';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gy = padT + plotH - f * plotH;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#EEF2F7" stroke-width="1" stroke-dasharray="4 4"/>';
    });
    values.forEach(function (v, i) {
      var x = padL + i * step;
      var y = H - padB - (v / max) * plotH;
      pts.push({ x: x, y: y });
      dots += '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff" stroke="' + baseColor + '" stroke-width="2.5"><title>' + esc(labels[i]) + ': ' + num(v) + '</title></circle>';
      labs += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="9.5" fill="#6B7490" font-weight="700">' + esc(String(labels[i]).slice(0, 10)) + '</text>';
    });
    for (var i = 0; i < pts.length; i++) line += (i === 0 ? 'M' : 'L') + pts[i].x + ' ' + pts[i].y + ' ';
    var areaPath = line.trim() + ' L ' + pts[pts.length - 1].x + ' ' + (H - padB) + ' L ' + pts[0].x + ' ' + (H - padB) + ' Z';
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:170px;display:block"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + baseColor + '" stop-opacity=".28"/><stop offset="100%" stop-color="' + baseColor + '" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid + '<path d="' + areaPath + '" fill="url(#' + gid + ')" stroke="none"/><polyline points="' + line.trim() + '" fill="none" stroke="' + baseColor + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + dots + labs + '</svg></div>';
  }

  /* رسم مخطط مساحة (Area Chart) */
  function svgAreaChart(labels, values, title, color) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var max = Math.max.apply(null, values.concat([1]));
    var W = 340, H = 180, padL = 36, padR = 14, padT = 22, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotW / Math.max(1, values.length - 1);
    var pts = '', area = '', dots = '', labs = '', grid = '', gid = 'ag' + Math.floor(Math.random() * 1e9);
    var baseColor = color || '#059669';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gy = padT + plotH - f * plotH;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#EEF2F7" stroke-width="1" stroke-dasharray="4 4"/>';
    });
    values.forEach(function (v, i) {
      var x = padL + i * step;
      var y = H - padB - (v / max) * plotH;
      pts.push({ x: x, y: y });
      dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#fff" stroke="' + baseColor + '" stroke-width="2.5"><title>' + esc(labels[i]) + ': ' + num(v) + '</title></circle>';
      labs += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="9.5" fill="#6B7490" font-weight="700">' + esc(String(labels[i]).slice(0, 10)) + '</text>';
    });
    for (var i = 0; i < pts.length; i++) area += (i === 0 ? 'M' : 'L') + pts[i].x + ' ' + pts[i].y + ' ';
    area += 'L ' + pts[pts.length - 1].x + ' ' + (H - padB) + ' L ' + pts[0].x + ' ' + (H - padB) + ' Z';
    var linePath = '';
    for (var j = 0; j < pts.length; j++) linePath += (j === 0 ? 'M' : 'L') + pts[j].x + ' ' + pts[j].y + ' ';
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:170px;display:block"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + baseColor + '" stop-opacity=".32"/><stop offset="100%" stop-color="' + baseColor + '" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid + '<path d="' + area.trim() + '" fill="url(#' + gid + ')" stroke="none"/><path d="' + linePath.trim() + '" fill="none" stroke="' + baseColor + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + dots + labs + '</svg></div>';
  }

  /* رسم مخطط دائري (Pie Chart) */
  function svgPieChart(labels, values, title) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var total = values.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 220, H = 190, cx = 100, cy = 95, r = 58;
    var colors = ['#F0524D', '#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#8B5CF6', '#EC4899'];
    var gid = 'pg' + Math.floor(Math.random() * 1e9);
    var start = -90, slices = '', legend = '';
    values.forEach(function (v, i) {
      var pct = (v / total) * 360;
      var end = start + pct;
      var x1 = cx + r * Math.cos(start * Math.PI / 180);
      var y1 = cy + r * Math.sin(start * Math.PI / 180);
      var x2 = cx + r * Math.cos(end * Math.PI / 180);
      var y2 = cy + r * Math.sin(end * Math.PI / 180);
      var large = pct > 180 ? 1 : 0;
      slices += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="url(#' + gid + i + ')" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"><title>' + esc(labels[i]) + ': ' + num(v) + ' (' + Math.round(v / total * 100) + '%)</title></path>';
      legend += '<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;font-size:11px;background:rgba(15,25,60,.03);padding:4px 8px;border-radius:999px"><span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:' + colors[i % colors.length] + ';box-shadow:0 2px 6px ' + colors[i % colors.length] + '55"></span><span style="font-weight:700;color:#334155">' + esc(labels[i]) + '</span><b style="margin-left:auto;color:#111827">' + Math.round(v / total * 100) + '%</b></div>';
      start = end;
    });
    var defs = colors.map(function (c, i) {
      return '<linearGradient id="' + gid + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + c + '"/><stop offset="100%" stop-color="' + c + '" stop-opacity=".72"/></linearGradient>';
    }).join('');
    return '<div class="rp-chart-card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:150px"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:190px;display:block;margin:0 auto"><defs>' + defs + '</defs><circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 8) + '" fill="none" stroke="#F1F5F9" stroke-width="1"/>' + slices + '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="18" font-weight="900" fill="#111827">' + num(total) + '</text></svg></div><div style="flex:1;min-width:150px">' + legend + '</div></div>';
  }

  /* رسم مخطط دونات (Doughnut Chart) */
  function svgDoughnutChart(labels, values, title) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var total = values.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 220, H = 190, cx = 100, cy = 95, r = 56, inner = 36;
    var colors = ['#1FA971', '#F2B8B5', '#0EA5E9', '#F59E0B', '#6366F1', '#8B5CF6', '#EC4899'];
    var gid = 'dg' + Math.floor(Math.random() * 1e9);
    var start = -90, slices = '', legend = '';
    values.forEach(function (v, i) {
      var pct = (v / total) * 360;
      var end = start + pct;
      var x1 = cx + r * Math.cos(start * Math.PI / 180);
      var y1 = cy + r * Math.sin(start * Math.PI / 180);
      var x2 = cx + r * Math.cos(end * Math.PI / 180);
      var y2 = cy + r * Math.sin(end * Math.PI / 180);
      var xi1 = cx + inner * Math.cos(start * Math.PI / 180);
      var yi1 = cy + inner * Math.sin(start * Math.PI / 180);
      var xi2 = cx + inner * Math.cos(end * Math.PI / 180);
      var yi2 = cy + inner * Math.sin(end * Math.PI / 180);
      var large = pct > 180 ? 1 : 0;
      slices += '<path d="M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' L ' + xi2.toFixed(1) + ' ' + yi2.toFixed(1) + ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + xi1.toFixed(1) + ' ' + yi1.toFixed(1) + ' Z" fill="url(#' + gid + i + ')" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"><title>' + esc(labels[i]) + ': ' + num(v) + ' (' + Math.round(v / total * 100) + '%)</title></path>';
      legend += '<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;font-size:11px;background:rgba(15,25,60,.03);padding:4px 8px;border-radius:999px"><span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:' + colors[i % colors.length] + ';box-shadow:0 2px 6px ' + colors[i % colors.length] + '55"></span><span style="font-weight:700;color:#334155">' + esc(labels[i]) + '</span><b style="margin-left:auto;color:#111827">' + Math.round(v / total * 100) + '%</b></div>';
      start = end;
    });
    var defs = colors.map(function (c, i) {
      return '<linearGradient id="' + gid + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + c + '"/><stop offset="100%" stop-color="' + c + '" stop-opacity=".72"/></linearGradient>';
    }).join('');
    return '<div class="rp-chart-card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:150px"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:190px;display:block;margin:0 auto"><defs>' + defs + '</defs>' + slices + '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="18" font-weight="900" fill="#111827">' + num(total) + '</text></svg></div><div style="flex:1;min-width:150px">' + legend + '</div></div>';
  }

  /* رسم مخطط شلال (Waterfall Chart) */
  function svgWaterfallChart(labels, values, title) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 320, H = 150, padL = 35, padR = 15, padT = 20, padB = 25;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var step = plotW / Math.max(1, values.length);
    var maxVal = Math.max.apply(null, values.concat([Math.abs(Math.min.apply(null, values.concat([0]))) || 1, 1]));
    var scale = plotH / maxVal;
    var bars = '', line = '', labs = '', acc = 0;
    values.forEach(function (v, i) {
      var h = Math.max(3, Math.abs(v) * scale);
      var x = padL + i * step;
      var base = H - padB - acc * scale;
      var y = v >= 0 ? base - h : base;
      bars += '<rect x="' + (x - step / 3) + '" y="' + y + '" width="' + (step * 0.6) + '" height="' + h + '" fill="' + (v >= 0 ? '#10b981' : '#ef4444') + '" rx="2"><title>' + esc(labels[i]) + ': ' + num(v) + '</title></rect>';
      labs += '<text x="' + x + '" y="' + (H - padB + 13) + '" text-anchor="middle" font-size="9" fill="#64748b">' + esc(String(labels[i]).slice(0, 10)) + '</text>';
      acc += v;
    });
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:140px;display:block"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/><line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/>' + bars + labs + '</svg></div>';
  }

  /* رسم مخطط رادار (Radar Chart) */
  function svgRadarChart(labels, values, title) {
    if (!labels.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 200, H = 170, cx = 90, cy = 85, r = 50;
    var n = labels.length;
    var angles = [], pts = '', grid = '', axes = '', dots = '', labs = '';
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      angles.push(a);
      var ax = cx + r * Math.cos(a);
      var ay = cy + r * Math.sin(a);
      axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + ax + '" y2="' + ay + '" stroke="#cbd5e1" stroke-width="1"/>';
      labs += '<text x="' + (cx + (r + 14) * Math.cos(a)) + '" y="' + (cy + (r + 12) * Math.sin(a)) + '" text-anchor="' + (Math.cos(a) > 0.1 ? 'start' : Math.cos(a) < -0.1 ? 'end' : 'middle') + '" font-size="9" fill="#64748b">' + esc(String(labels[i]).slice(0, 10)) + '</text>';
    }
    for (var lvl = 0.25; lvl <= 1; lvl += 0.25) {
      var g = '';
      for (var i = 0; i < n; i++) {
        var a = angles[i];
        var x = cx + r * lvl * Math.cos(a);
        var y = cy + r * lvl * Math.sin(a);
        g += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
      }
      g += 'Z';
      grid += '<polygon points="' + g.trim() + '" fill="none" stroke="#e2e8f0" stroke-width="1"/>';
    }
    values.forEach(function (v, i) {
      var a = angles[i];
      var pct = Math.min(1, Math.max(0, v / 100));
      var x = cx + r * pct * Math.cos(a);
      var y = cy + r * pct * Math.sin(a);
      pts += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
      dots += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#8b5cf6" stroke="#fff" stroke-width="1.5"><title>' + esc(labels[i]) + ': ' + num(v) + '%</title></circle>';
    });
    pts += 'Z';
    return '<div class="rp-chart-card"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:150px;display:block"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid + axes + '<polygon points="' + pts.trim() + '" fill="#8b5cf6" opacity="0.2" stroke="#8b5cf6" stroke-width="2" stroke-linejoin="round"/>' + dots + labs + '</svg></div>';
  }

  /* رسم مؤشر عداد (Gauge Chart) — ستايل زجاجي عصري */
  function svgGaugeChart(value, title, min, max, good, warn) {
    if (min == null) min = 0;
    if (max == null) max = 100;
    var pct = (value - min) / (max - min);
    pct = Math.min(1, Math.max(0, pct));
    var W = 220, H = 150, cx = 100, cy = 115, r = 62;
    var startAngle = 180, endAngle = 360;
    var angle = startAngle + pct * (endAngle - startAngle);
    var gid = 'gg' + Math.floor(Math.random() * 1e9);
    var stops = [['#F0524D', 0], ['#F59E0B', 50], ['#10B981', 100]].map(function (s) { return '<stop offset="' + s[1] + '%" stop-color="' + s[0] + '"/>'; }).join('');
    var rad = (angle * Math.PI) / 180;
    var nx = cx + r * Math.cos(rad);
    var ny = cy + r * Math.sin(rad);
    var label = pct >= good / 100 ? 'ممتاز' : (pct >= warn / 100 ? 'مقبول' : 'يحتاج متابعة');
    var labelColor = pct >= good / 100 ? '#0E8A68' : (pct >= warn / 100 ? '#B45309' : '#DC2626');
    return '<div class="rp-chart-card" style="text-align:center"><div class="rp-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:210px;display:block;margin:0 auto"><defs><linearGradient id="' + gid + '" x1="0%" y1="0%" x2="100%" y2="0%">' + stops + '</linearGradient></defs><path d="M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" fill="none" stroke="#EEF2F7" stroke-width="16" stroke-linecap="round"/><path d="M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" fill="none" stroke="url(#' + gid + ')" stroke-width="16" stroke-linecap="round" stroke-dasharray="' + (Math.PI * r).toFixed(1) + '" stroke-dashoffset="' + (Math.PI * r * (1 - pct)).toFixed(1) + '"/><path d="M ' + cx + ' ' + cy + ' L ' + nx.toFixed(1) + ' ' + ny.toFixed(1) + '" stroke="#111827" stroke-width="3.5" stroke-linecap="round"/><circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#111827"/><text x="' + cx + '" y="' + (cy - 14) + '" text-anchor="middle" font-size="24" font-weight="900" fill="#111827">' + num(value) + '</text><text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="10" font-weight="800" fill="' + labelColor + '">' + esc(label) + '</text></svg></div>';
  }

  /* ===== تقرير: مدة الوقوف لكل سيارة (من يوم ما بقت غير مؤجرة) ===== */
  function buildIdleDuration(model, list) {
    var SNAP = global.YahmaSnapshots;
    function idleDays(car) {
      try { if (SNAP && typeof SNAP.idleDaysFor === 'function') return SNAP.idleDaysFor(car); } catch (_) {}
      var n = Number(car.daysSinceMovement || 0);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    }
    function idleSince(car) {
      try { if (SNAP && typeof SNAP.idleSinceFor === 'function') return SNAP.idleSinceFor(car); } catch (_) {}
      return car.idleSince || car.lastMovementDate || '—';
    }
    var rows = [];
    var idleCars = [];
    (list || []).forEach(function (car) {
      if (!car) return;
      var status = String(car.carStatus || '').trim();
      if (status.includes('مؤجر')) return;
      var days = idleDays(car);
      var idleCarsItem = {
        plate: car.plate || '—',
        brandType: (car.brand || '') + ' ' + (car.type || car.model || ''),
        branch: String(car.branch || '').trim() || 'غير محدد',
        status: status || '—',
        idleSinceDate: idleSince(car),
        idleDays: days,
        rate: Number(car.dailyRate) || 0,
        loss: (Number(car.dailyRate) || 0) * days
      };
      idleCars.push(idleCarsItem);
    });
    idleCars.sort(function (a, b) { return b.idleDays - a.idleDays; });
    var totalDays = idleCars.reduce(function (s, c) { return s + c.idleDays; }, 0);
    var avgDays = idleCars.length ? Math.round((totalDays / idleCars.length) * 10) / 10 : 0;
    var maxDays = idleCars.length ? idleCars[0].idleDays : 0;
    var totalLoss = idleCars.reduce(function (s, c) { return s + c.loss; }, 0);
    var rowsFormatted = idleCars.slice(0, 300).map(function (c) {
      return [c.plate, c.brandType, c.branch, c.status, c.idleSinceDate, c.idleDays, num(c.rate), num(Math.round(c.loss))];
    });
    return {
      title: 'مدة الوقوف بدون تأجير',
      subtitle: 'الوقوف من يوم ما السيارة بقت غير مؤجرة (idleSince) — مرتبة من الأطول وقوفاً',
      kpis: [
        { label: 'غير مؤجرة', value: num(idleCars.length), cls: 'warn' },
        { label: 'متوسط مدة الوقوف', value: avgDays ? avgDays + ' يوم' : '—' },
        { label: 'أطول مدة وقوف', value: maxDays ? maxDays + ' يوم' : '—', cls: maxDays > 60 ? 'bad' : 'warn' },
        { label: 'خسارة الفرص التقديرية', value: num(Math.round(totalLoss)) + ' ر.س', cls: totalLoss > 0 ? 'bad' : 'good' }
      ],
      sections: [
        {
          title: 'السيارات غير المؤجرة مرتبة بمدة الوقوف',
          note: 'المدة = النهاردة - تاريخ بداية عدم التأجير (ناقص آخر حركة كتقدير للقديم).',
          headers: ['اللوحة', 'الماركة / الفئة', 'الفرع', 'الحالة', 'من إمتى واقفة', 'واقفة كام يوم', 'سعر اليوم (ر.س)', 'خسارة تقديرية (ر.س)'],
          rows: rowsFormatted
        }
      ]
    };
  }

  /* ===== تقرير: معدل التشغيل عبر الزمن (لقطات يومية) ===== */
  function getOccupancySeries() {
    if (occupancyCache && occupancyCache.length) return occupancyCache;
    try {
      if (global.YahmaSnapshots && typeof global.YahmaSnapshots.readLocal === 'function') {
        return global.YahmaSnapshots.readLocal() || [];
      }
    } catch (_) {}
    return [];
  }

  function buildOccupancyTime(model, list) {
    var period = Number(state.period) || 30;
    if (![7, 30, 90].includes(period)) period = 30;
    // لو فيه فلتر تاريخ عالمي، الفترة تنتهي بيوم الفلتر بدل النهاردة
    var globalDate = '';
    try {
      globalDate = (typeof global.YahmaGlobalDate === 'object' && typeof global.YahmaGlobalDate.getSelectedDate === 'function')
        ? String(global.YahmaGlobalDate.getSelectedDate() || '').slice(0, 10)
        : String(global.localStorage.getItem('yahma-global-date-filter') || '').slice(0, 10);
    } catch (_) {}
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (globalDate) {
      var parsedGlobal = new Date(globalDate + 'T00:00:00');
      if (!isNaN(parsedGlobal.getTime())) today = parsedGlobal;
    }
    var from = new Date(today.getTime() - (period - 1) * 86400000);
    var fromIso = from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-' + String(from.getDate()).padStart(2, '0');
    var todayIsoForFilter = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var allSnaps = getOccupancySeries();
    var branchFilter = state.branch || 'ALL';
    var series = allSnaps.filter(function (s) {
      if (s.branch !== branchFilter) return false;
      if (s.snapshot_date < fromIso) return false;
      if (s.snapshot_date > todayIsoForFilter) return false;
      return true;
    }).sort(function (a, b) { return a.snapshot_date < b.snapshot_date ? -1 : 1; });
    // لو مفيش لقطات كفاية، نضم لقطة اليوم من البيانات الحالية عشان يظهر نقطة واحدة على الأقل
    var todayIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var hasToday = series.some(function (s) { return s.snapshot_date === todayIso; });
    if (!hasToday) {
      try {
        if (global.YahmaSnapshots && typeof global.YahmaSnapshots.computeSnapshot === 'function') {
          var snapNow = global.YahmaSnapshots.computeSnapshot(list, todayIso);
          var nowRow = branchFilter === 'ALL' ? snapNow.all : (snapNow.rows.filter(function (r) { return r.branch === branchFilter; })[0] || snapNow.all);
          series.push(Object.assign({}, nowRow));
          series.sort(function (a, b) { return a.snapshot_date < b.snapshot_date ? -1 : 1; });
        }
      } catch (_) {}
    }
    var occupancies = series.map(function (s) { return Number(s.occupancy_rate) || 0; });
    var avgOcc = series.length ? Math.round((occupancies.reduce(function (a, b) { return a + b; }, 0) / series.length) * 10) / 10 : 0;
    var minOcc = series.length ? Math.min.apply(null, occupancies) : 0;
    var maxOcc = series.length ? Math.max.apply(null, occupancies) : 0;
    var labels = series.map(function (s) { return String(s.snapshot_date).slice(5); });
    var chartHtml = '';
    if (series.length >= 2) {
      chartHtml = svgLineChart(labels, occupancies, (branchFilter === 'ALL' ? 'الشركة كلها' : branchFilter) + ' — معدل التشغيل آخر ' + period + ' يوم', '#0BAA86');
    } else if (series.length === 1) {
      chartHtml = '<div class="rp-empty">يوجد نقطة واحدة فقط (' + esc(series[0].snapshot_date) + ' — ' + esc(String(series[0].occupancy_rate)) + '%). اللقطات اليومية بتتراكم تلقائياً — ارجع بعد أيام عشان المنحنى يكتمل. برده تقدر تشوف الجدول تحت.</div>';
    } else {
      chartHtml = '<div class="rp-empty">في انتظار تراكم اللقطات اليومية. افتح لوحة التحكم مرة من الجهاز، وهتتحفظ لقطة اليوم وتظهر هنا. (الجدول المجاور بيُحدَّث تلقائياً من لوحة التحكّم.)</div>';
    }
    var rows = series.map(function (s) {
      return [
        s.snapshot_date,
        num(s.total_cars), num(s.rented_cars), num(s.idle_cars),
        num(s.available_cars), num(s.ready_cars),
        (Math.round((Number(s.occupancy_rate) || 0) * 10) / 10) + '%',
        num(Math.round(Number(s.avg_idle_days) || 0) * 10 / 10),
        num(s.max_idle_days || 0),
        num(Math.round(Number(s.idle_loss) || 0))
      ];
    });
    return {
      title: 'معدل التشغيل عبر الزمن',
      subtitle: 'النسبة = مؤجرة ÷ إجمالي (لقطات يومية محفوظة في fleet_daily_snapshots)',
      kpis: [
        { label: 'الأيام المعروضة', value: num(series.length) },
        { label: 'متوسط التشغيل', value: avgOcc + '%', cls: 'good' },
        { label: 'أدنى تشغيل', value: minOcc + '%', cls: 'bad' },
        { label: 'أعلى تشغيل', value: maxOcc + '%', cls: 'good' },
        { label: 'اليوم (' + esc(todayIso) + ')', value: (series.length && series[series.length - 1] ? (sValue(series[series.length - 1])) : '—') }
      ].filter(function (x) { return !!x.value; }),
      chartHtml: chartHtml,
      sections: [
        {
          title: 'اللقطات اليومية (' + (branchFilter === 'ALL' ? 'الشركة كلها' : esc(branchFilter)) + ' — آخر ' + period + ' يوم)',
          note: 'كل سطر هو لقطة يوم واحدة. اللقطات تُحفظ تلقائياً عند فتح اللوحة، وتُرفع لـ Supabase عشان تبقى مشتركة.',
          headers: ['التاريخ', 'الإجمالي', 'مؤجرة', 'غير مؤجرة', 'متاحة', 'جاهزة', 'نسبة التشغيل', 'متوسط ركود', 'أقصى ركود', 'خسارة تقديرية'],
          rows: rows,
          barCol: 6
        }
      ]
    };
    function sValue(sn) { return (Math.round((Number(sn.occupancy_rate) || 0) * 10) / 10) + '%'; }
  }

  /* بناء كارتات الرسوم البيانية حسب نوع التقرير */
  function buildCharts(model) {
    var total = model.total || 0;
    var ready = model.ready || 0;
    var notReady = Math.max(0, total - ready);
    var branches = model.byBranch || [];
    var docs = model.docStatus || { card: 0, license: 0, insurance: 0, inspection: 0 };

    var charts = [];

    /* 1. جاهزية الأسطول - د낮nut */
    charts.push(svgDoughnutChart(['جاهزة', 'غير جاهزة'], [ready, notReady], 'جاهزية الأسطول'));

    /* 2. توزيع الفروع - أعمدة */
    if (branches.length) {
      var bLabels = branches.map(function (b) { return b.name || '—'; });
      var bValues = branches.map(function (b) { return b.count || 0; });
      charts.push(svgColumnChart(bLabels, bValues, 'توزيع السيارات حسب الفرع', '#0284c7'));
    }

    /* 3. حالة الوثائق - مخطط دائري */
    var docTotal = docs.card + docs.license + docs.insurance + docs.inspection;
    if (docTotal > 0) {
      charts.push(svgPieChart(['كارت', 'رخصة', 'تأمين', 'فحص'], [docs.card, docs.license, docs.insurance, docs.inspection], 'حالة الوثائق'));
    }

    /* 4. مؤشر الجاهزية - عداد */
    var readyPct = total ? Math.round((ready / total) * 100) : 0;
    charts.push(svgGaugeChart(readyPct, 'مؤشر الجاهزية العامة', 0, 100, 70, 40));

    /* 5. أعمار الأسطول - أعمدة */
    if (model.ageBrackets && model.ageBrackets.length) {
      var aLabels = model.ageBrackets.map(function (a) { return a.label || '—'; });
      var aValues = model.ageBrackets.map(function (a) { return a.count || 0; });
      charts.push(svgBarChart(aLabels, aValues, 'توزيع أعمار السيارات', '#6366f1'));
    }

    /* 6. خط جاهزية شهري - خطي (إذا توفر) */
    if (model.monthlyReadiness && model.monthlyReadiness.length) {
      var mLabels = model.monthlyReadiness.map(function (m) { return m.month || '—'; });
      var mValues = model.monthlyReadiness.map(function (m) { return m.pct || 0; });
      charts.push(svgLineChart(mLabels, mValues, 'اتجاه الجاهزية الشهرية', '#6366f1'));
    }

    /* 7. مصروفات - شلال */
    if (model.finFlow && model.finFlow.length) {
      var fLabels = model.finFlow.map(function (f) { return f.label || '—'; });
      var fValues = model.finFlow.map(function (f) { return f.value || 0; });
      charts.push(svgWaterfallChart(fLabels, fValues, 'تدفق المالي'));
    }

    /* 8. توازن العمليات - رادار */
    if (model.opsBalance && model.opsBalance.length) {
      var oLabels = model.opsBalance.map(function (o) { return o.label || '—'; });
      var oValues = model.opsBalance.map(function (o) { return o.value || 0; });
      charts.push(svgRadarChart(oLabels, oValues, 'توازن العمليات'));
    }

    return '<div class="rp-charts-section">' +
      '<div class="rp-section-head"><h3>📊 الرسوم البيانية</h3><span class="muted-small">رسوم بيانية توضيحية لبيانات الأسطول الحالية</span></div>' +
      '<div class="rp-charts-grid">' + charts.join('') + '</div>' +
      '</div>';
  }

  var REPORTS = [
    { id: 'weekly', label: 'تقرير الأسبوع', build: buildWeekly },
    { id: 'overview', label: 'ملخص تنفيذي', build: buildOverview },
    { id: 'readiness', label: 'الجاهزية حسب الفرع', build: buildReadiness },
    { id: 'pipeline', label: 'دورة الفحص والمدفوعات', build: buildPipeline },
    { id: 'movement', label: 'حركة الأسطول والراكدة', build: buildMovement },
    { id: 'idleDuration', label: 'مدة الوقوف', build: buildIdleDuration },
    { id: 'occupancyTime', label: 'معدل التشغيل الزمني', build: buildOccupancyTime },
    { id: 'maintenance', label: 'الصيانة والورش', build: buildMaintenance },
    { id: 'companies', label: 'الشركات والتأمين', build: buildCompanies },
    { id: 'docs', label: 'الوثائق', build: buildDocs },
    { id: 'states', label: 'الحالات والمناطق', build: buildStates },
    { id: 'ages', label: 'الأعمار', build: buildAges },
    { id: 'ops', label: 'التسعير', build: buildOps },
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

  async function exportWholeReport(report) {
    var api = global.YahmaExport;
    if (!api || typeof api.exportReportWorkbook !== 'function') {
      try { global.alert('تصدير Excel المتقدم غير متاح — أعد تحميل الصفحة.'); } catch (_) { /* ignore */ }
      return;
    }
    var sections = (report.sections || []).map(function (section) {
      return {
        title: section.title || '',
        headers: (section.headers || []).slice(),
        rows: (section.rows || []).map(function (row) { return exportRow(section, row); }),
        foot: section.foot ? exportRow(section, section.foot) : null
      };
    });
    try {
      await api.exportReportWorkbook(fileName(report, { title: 'كامل' }) + '.xlsx', {
        title: report.title,
        subtitle: report.subtitle,
        branch: state.branch || 'كل الفروع',
        period: state.period || '',
        kpis: report.kpis || [],
        sections: sections
      });
    } catch (err) {
      try { global.alert('تعذر تصدير التقرير الكامل: ' + ((err && err.message) || err)); } catch (_) { /* ignore */ }
    }
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
          note: 'الفرع: ' + (state.branch || 'كل الفروع') + (state.report === 'occupancyTime' ? ' | الفترة: ' + state.period + ' يوم' : ''),
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
    // أيقونة تلقائية حسب كلمات العنوان — عشان كل التقارير تاخد نفس شكل الكروت الجديد
    var autoIcon = kpi.icon || '';
    if (!autoIcon) {
      var L = String(kpi.label || '');
      if (L.includes('إجمالي')) autoIcon = '🚗';
      else if (L.includes('كارت')) autoIcon = '🪪';
      else if (L.includes('تأمين')) autoIcon = '🛡️';
      else if (L.includes('رخص')) autoIcon = '📄';
      else if (L.includes('فحص')) autoIcon = '🔧';
      else if (L.includes('جاهز')) autoIcon = '✓';
      else if (L.includes('دفع')) autoIcon = '💳';
      else if (L.includes('تجديد')) autoIcon = '🔄';
      else if (L.includes('متاح')) autoIcon = '🅿️';
      else if (L.includes('مؤجر')) autoIcon = '🔑';
      else if (L.includes('راف') || L.includes('راقد')) autoIcon = '🚗';
      else if (L.includes('تشغيل')) autoIcon = '📊';
      else if (L.includes('فرع')) autoIcon = '🏢';
    }
    var tone = kpi.tone || (kpi.cls === 'good' ? 'green' : kpi.cls === 'warn' ? 'amber' : kpi.cls === 'bad' ? 'red' : 'muted');
    if (kpi.label && kpi.label.includes('رخص')) tone = 'orange';
    var tileBg = { green: '#E6F7EE', amber: '#FFF2D5', orange: '#FFE7D7', red: '#FFE0E0', muted: '#F2F5F9' }[tone] || '#F2F5F9';
    var tileColor = { green: '#0E8A68', amber: '#A86F00', orange: '#B94A13', red: '#B62E2E', muted: '#6B7490' }[tone] || '#6B7490';
    var pillText = kpi.pill || (tone === 'red' ? 'تنبيه' : tone === 'green' ? 'إيجابي' : tone === 'amber' || tone === 'orange' ? 'انتباه' : 'معلق');
    return '<article class="rp2-kpi">'
      + '<div class="rp2-kpi-top"><span class="rp2-tile" style="background:' + tileBg + ';color:' + tileColor + '">' + esc(autoIcon || '•') + '</span>'
      + '<span class="rp2-pill" style="background:' + tileBg + ';color:' + tileColor + '">' + esc(pillText) + '</span>'
      + '</div>'
      + '<p class="rp2-label">' + esc(kpi.label) + '</p>'
      + '<p class="rp2-num">' + esc(kpi.value) + '</p>'
      + (kpi.trend ? '<p class="rp2-trend" style="color:' + tileColor + '">' + esc(kpi.trend) + '</p>' : '')
      + (kpi.note ? '<p class="rp2-note">' + esc(kpi.note) + '</p>' : (kpi.hint ? '<p class="rp2-note">' + esc(kpi.hint) + '</p>' : ''))
      + '</article>';
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

    return '<style>'
      // ===== Redesigned Reports (نفس شكل الملف الجديد) =====
      + '.rp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}'
      + '.rp-head-text h2{margin:10px 0 4px;font-size:34px;font-weight:900;color:#111827;line-height:1.2}'
      + '.rp-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.rp-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:#E6F7EE;color:#0E8A68}'
      + '.rp-live{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#6B7490}'
      + '.rp-live i{width:8px;height:8px;border-radius:50%;background:#10B981;display:inline-block}'
      + '.rp-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.rp-exp-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:999px;font-size:13px;font-weight:800;cursor:pointer;border:1px solid #E6EAF2;background:#fff;color:#111827}'
      + '.rp-exp-btn.teal{background:#0E8A68;border-color:#0E8A68;color:#fff;box-shadow:0 6px 16px rgba(14,138,104,.25)}'
      + '.rp-branch-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid #E6EAF2;background:#fff}'
      + '.rp-branch-pill select{border:0;background:transparent;font-family:inherit;font-size:12.5px;font-weight:800;color:#111827;cursor:pointer;max-width:180px;outline:none}'
      + '.rp-period-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid #E6EAF2;background:#fff}'
      + '.rp-period-pill select{border:0;background:transparent;font-family:inherit;font-size:12.5px;font-weight:800;color:#111827;cursor:pointer;outline:none}'
      + '.rp-tabs{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;background:transparent;border:0;padding:0;margin-bottom:14px;scrollbar-width:none}'
      + '.rp-tab{flex:0 0 auto;border:1px solid #E6EAF2;background:#fff;padding:8px 14px;border-radius:999px;font-family:inherit;font-size:12px;font-weight:800;color:#6B7490;cursor:pointer;white-space:nowrap}'
      + '.rp-tab:hover{color:#111827;border-color:#D5DCE8}'
      + '.rp-tab.active{background:#0E8A68;border-color:#0E8A68;color:#fff;box-shadow:0 6px 16px rgba(14,138,104,.25)}'
      + '.rp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}'
      + '.rp2-kpi{background:#fff;border:1px solid #E6EAF2;border-radius:20px;padding:14px;box-shadow:0 1px 3px rgba(15,25,60,.05)}'
      + '.rp2-kpi-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}'
      + '.rp2-tile{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font-size:20px;flex:none}'
      + '.rp2-pill{font-size:10px;font-weight:900;padding:4px 8px;border-radius:999px;white-space:nowrap}'
      + '.rp2-label{margin:10px 0 2px;font-size:12px;font-weight:700;color:#6B7490;line-height:1.5}'
      + '.rp2-num{margin:0;font-size:28px;font-weight:900;color:#111827;line-height:1.2;letter-spacing:-.02em}'
      + '.rp2-trend{margin:6px 0 0;font-size:11px;font-weight:800;line-height:1.5}'
      + '.rp2-note{margin:2px 0 0;font-size:11px;color:#6B7490;line-height:1.6}'
      + '.rp-charts-section{margin:0;padding:16px;background:linear-gradient(160deg,rgba(255,255,255,.72),rgba(247,250,252,.55));border:1px solid rgba(255,255,255,.8);border-radius:20px;box-shadow:0 10px 30px rgba(15,25,60,.07);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4)}'
      + '.rp-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px}'
      + '.rp-section-head h3{margin:0;font-size:16px;font-weight:900;color:#111827;display:flex;align-items:center;gap:8px}'
      + '.rp-section-head .muted-small{font-size:11.5px;color:#64748b;margin-top:2px}'
      + '.rp-charts-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}'
      + '.rp-chart-card{background:linear-gradient(150deg,rgba(255,255,255,.92),rgba(248,250,252,.78));border:1px solid rgba(255,255,255,.9);border-radius:18px;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;min-height:240px;box-shadow:0 6px 20px rgba(15,25,60,.07),0 18px 40px rgba(15,25,60,.05);transition:transform .18s ease,box-shadow .18s ease}'
      + '.rp-chart-card:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(15,25,60,.10),0 22px 48px rgba(15,25,60,.08)}'
      + '.rp-chart-title{font-size:13px;font-weight:900;color:#111827;margin-bottom:10px;text-align:center;width:100%;letter-spacing:-.01em}'
      + '.rp-chart-note{font-size:11px;font-weight:800;color:#0E8A68;margin-top:10px;text-align:center;background:rgba(14,138,104,.08);padding:4px 10px;border-radius:999px}'
      + '.rp-card{background:#fff;border:1px solid #E6EAF2;border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,25,60,.05)}'
      + '.rp-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}'
      + '.rp-card-title h3{margin:0 0 3px;font-size:14px;font-weight:900;color:#111827}'
      + '.rp-empty{padding:20px;text-align:center;color:#94a3b8;font-size:13px}'
      + '.rp-cards-section{margin:0 0 16px}'
      + '.rp-branch-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}'
      + '.rp-branch-card{border:1px solid #E6EAF2;background:#fff;border-radius:16px;padding:14px;text-align:right;cursor:pointer;font-family:inherit}'
      + '.rp-branch-card:hover{border-color:#0E8A68;box-shadow:0 4px 14px rgba(14,138,104,.12)}'
      + '.rp-branch-name{display:block;font-weight:900;color:#111827;font-size:13px}'
      + '.rp-branch-total{display:block;margin-top:6px;font-size:20px;font-weight:900;color:#111827}'
      + '.rp-branch-metrics{display:flex;gap:10px;margin-top:6px;font-size:11px;color:#6B7490;font-weight:700}'
      + '@media(max-width:1200px){.rp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.rp-charts-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-branch-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}'
      + '@media(max-width:700px){.rp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-charts-grid{grid-template-columns:1fr}.rp-branch-cards{grid-template-columns:1fr}.rp-head-text h2{font-size:28px}}'
      + '</style>'
      + '<div class="rp-head">'
      + '<div class="rp-head-text">'
      + '<div class="rp-badges"><span class="rp-badge">القسم الحالي: التقارير</span><span class="rp-live"><i></i> بيانات محدثة من الأسطول الحالي</span></div>'
      + '<h2>تقارير الأسطول</h2>'
      + '<div class="muted-small">أرقام مباشرة من بيانات الأسطول الحالية — بدون أي حساب على السيرفر.</div></div>'
      + '<div class="rp-head-actions">'
      + '<button type="button" class="rp-exp-btn" id="rp-header-pdf">⬇ تصدير PDF</button>'
      + '<button type="button" class="rp-exp-btn teal" id="rp-header-xlsx">⬇ Excel كامل</button>'
      + '<label class="rp-branch-pill">🔎<select id="rp-branch">' + options.join('') + '</select>⌄</label>'
      + '</div></div>'
      + (report.chartHtml !== undefined || state.report === 'occupancyTime'
          ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><label class="rp-period-pill">📅<span>الفترة</span><select id="rp-period"><option value="7"' + (state.period === '7' ? ' selected' : '') + '>7 أيام</option><option value="30"' + (state.period === '30' ? ' selected' : '') + '>30 يوم</option><option value="90"' + (state.period === '90' ? ' selected' : '') + '>90 يوم</option></select>⌄</label></div>'
          : '')
      + '<div class="rp-tabs">' + tabs + '</div>'
      + '<div class="rp-kpis">' + report.kpis.map(kpiHtml).join('') + '</div>'
      + ((state.report === 'weekly' || state.report === 'overview') ? buildCharts(model) : '')
      + (report.chartHtml ? '<div class="rp-charts-section"><div class="rp-section-head"><h3>📈 ' + esc(report.title) + '</h3></div><div style="display:grid;grid-template-columns:1fr;gap:12px"><div class="rp-chart-card" style="width:100%;min-width:0">' + report.chartHtml + '</div></div></div>' : '')
      + (report.customHtml ? report.customHtml : '')
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
    content.querySelectorAll('[data-rp-branch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.branch = String(btn.getAttribute('data-rp-branch') || '');
        renderReports(document.getElementById('content'));
      });
    });
    var hpPdf = content.querySelector('#rp-header-pdf');
    if (hpPdf) hpPdf.addEventListener('click', function () { exportSection(report, 0, 'pdf'); });
    var hpXlsx = content.querySelector('#rp-header-xlsx');
    if (hpXlsx) hpXlsx.addEventListener('click', function () { exportWholeReport(report); });
    var periodSelect = content.querySelector('#rp-period');
    if (periodSelect) {
      periodSelect.addEventListener('change', function () {
        state.period = String(periodSelect.value || '30');
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
    if (sub) sub.textContent = 'جاهزية ووثائق وأعمار وتسعير الأسطول — جاهزة للتصدير Excel و PDF.';

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
    // لو تقرير التشغيل الزمني، حمّل اللقطات من Supabase وحدّث في الخلفية (مرة واحدة بس في الجلسة)
    if (active.id === 'occupancyTime' && !occupancyLoadedOnce && !occupancyLoading) {
      occupancyLoading = true;
      try {
        if (global.YahmaSnapshots && typeof global.YahmaSnapshots.loadSnapshots === 'function') {
          Promise.resolve(global.YahmaSnapshots.loadSnapshots({})).then(function (snaps) {
            occupancyCache = Array.isArray(snaps) ? snaps : occupancyCache;
            occupancyLoading = false;
            occupancyLoadedOnce = true;
            // حدّث بس لو التقرير الحالي لسه مفتوح
            if (state.report === 'occupancyTime' && document.getElementById('content') === host) {
              renderReports(host);
            }
          }).catch(function () {
            occupancyLoading = false;
            occupancyLoadedOnce = true;
          });
        } else {
          occupancyLoading = false;
          occupancyLoadedOnce = true;
        }
      } catch (_) {
        occupancyLoading = false;
        occupancyLoadedOnce = true;
      }
    }
  }

  global.YahmaReports = { render: renderReports };
  global.renderReports = renderReports;
})(typeof window !== 'undefined' ? window : globalThis);

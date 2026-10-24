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

  var REPORTS = [
    { id: 'overview', label: 'ملخص تنفيذي', build: buildOverview },
    { id: 'readiness', label: 'الجاهزية حسب الفرع', build: buildReadiness },
    { id: 'pipeline', label: 'دورة الفحص والمدفوعات', build: buildPipeline },
    { id: 'movement', label: 'حركة الأسطول والراكدة', build: buildMovement },
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
  }

  global.YahmaReports = { render: renderReports };
  global.renderReports = renderReports;
})(typeof window !== 'undefined' ? window : globalThis);

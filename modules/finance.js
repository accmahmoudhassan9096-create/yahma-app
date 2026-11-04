/* ===== modules/finance.js — تبويب «المالية» =====
   تبويب مالي متكامل لإدارة وتحليل الأسطول:
   - مؤشرات الأداء المالي وإجمالي الدخل المتوقع.
   - إيرادات التأجير اليومية والشهرية وتفصيل التسعير لكل فرع وسيارة.
   - مصروفات الصيانة ومراكز الخدمة والورش.
   - متابعة رسوم الفحص والتجديد ومراحل السداد.
   - تصدير كامل إلى Excel و PDF.
*/
(function (global) {
  'use strict';

  var state = { view: 'overview', branch: '' };

  function num(val) {
    var n = Number(val);
    if (!isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  function currency(val) {
    return num(Math.round(Number(val) || 0)) + ' ر.س';
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getFleet() {
    if (typeof fleet !== 'undefined' && Array.isArray(fleet)) return fleet;
    if (global.fleet && Array.isArray(global.fleet)) return global.fleet;
    if (global.YahmaAppContext && typeof global.YahmaAppContext.getFleet === 'function') {
      try { return global.YahmaAppContext.getFleet() || []; } catch (_) {}
    }
    return [];
  }

  function branchList(cars) {
    var counts = {};
    (cars || []).forEach(function (c) {
      var b = String((c && c.branch) || '').trim();
      if (!b) b = 'غير محدد';
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (k) {
      return { name: k, count: counts[k] };
    });
  }

  var VIEWS = [
    { id: 'overview', label: 'الملخص المالي العام' },
    { id: 'revenue', label: 'إيرادات وتسعير الأسطول' },
    { id: 'maintenance', label: 'مصروفات الصيانة والورش' },
    { id: 'fees', label: 'رسوم الفحص والخدمات' }
  ];

  function buildFinancialModel(cars) {
    var total = cars.length;
    var rentedCars = 0;
    var availableCars = 0;
    var underMaintCars = 0;
    var dailyRateSum = 0;
    var dailyPricedCount = 0;
    var rentedDailySum = 0;
    var monthlyRateSum = 0;
    var monthlyPricedCount = 0;
    var maintCostSum = 0;
    var maintCarsCount = 0;

    cars.forEach(function (car) {
      if (!car) return;
      var status = String(car.carStatus || '').trim();
      if (status === 'مؤجرة') rentedCars++;
      else if (status === 'متاحة للايجار') availableCars++;
      else if (status === 'تحت الصيانة') underMaintCars++;

      var dr = Number(car.dailyRate) || 0;
      if (dr > 0) {
        dailyRateSum += dr;
        dailyPricedCount++;
        if (status === 'مؤجرة') {
          rentedDailySum += dr;
        }
      }

      var mr = Number(car.monthlyRate) || 0;
      if (mr > 0) {
        monthlyRateSum += mr;
        monthlyPricedCount++;
      }

      var mc = Number(car.maintenanceCost) || 0;
      if (mc > 0) {
        maintCostSum += mc;
        maintCarsCount++;
      }
    });

    var avgDaily = dailyPricedCount ? Math.round(dailyRateSum / dailyPricedCount) : 0;
    var avgMonthly = monthlyPricedCount ? Math.round(monthlyRateSum / monthlyPricedCount) : (avgDaily * 30);
    var avgMaint = maintCarsCount ? Math.round(maintCostSum / maintCarsCount) : 0;
    var utilRate = total ? Math.round((rentedCars / total) * 100) : 0;
    var projectedMonthly = rentedDailySum > 0 ? (rentedDailySum * 30) : (dailyRateSum * 30);

    var pendingPayments = [];
    var paidPayments = [];
    var renewedPayments = [];
    try {
      if (typeof global.loadInspectionPayments === 'function') pendingPayments = global.loadInspectionPayments() || [];
    } catch (_) {}
    try {
      if (typeof global.loadPaidInspections === 'function') paidPayments = global.loadPaidInspections() || [];
    } catch (_) {}
    try {
      if (typeof global.loadRenewedInspections === 'function') renewedPayments = global.loadRenewedInspections() || [];
    } catch (_) {}

    return {
      total: total,
      rentedCars: rentedCars,
      availableCars: availableCars,
      underMaintCars: underMaintCars,
      utilRate: utilRate,
      dailyRateSum: dailyRateSum,
      dailyPricedCount: dailyPricedCount,
      avgDaily: avgDaily,
      rentedDailySum: rentedDailySum,
      monthlyRateSum: monthlyRateSum,
      monthlyPricedCount: monthlyPricedCount,
      avgMonthly: avgMonthly,
      projectedMonthly: projectedMonthly,
      maintCostSum: maintCostSum,
      maintCarsCount: maintCarsCount,
      avgMaint: avgMaint,
      pendingCount: pendingPayments.length,
      paidCount: paidPayments.length,
      renewedCount: renewedPayments.length,
      cars: cars
    };
  }

  function getOverviewView(model, cars) {
    var branchMap = {};
    cars.forEach(function (car) {
      if (!car) return;
      var b = String(car.branch || '').trim() || 'غير محدد';
      if (!branchMap[b]) {
        branchMap[b] = { name: b, total: 0, rented: 0, dailySum: 0, monthlySum: 0, maintSum: 0 };
      }
      var bm = branchMap[b];
      bm.total++;
      if (String(car.carStatus || '').trim() === 'مؤجرة') bm.rented++;
      bm.dailySum += (Number(car.dailyRate) || 0);
      bm.monthlySum += (Number(car.monthlyRate) || 0);
      bm.maintSum += (Number(car.maintenanceCost) || 0);
    });

    var rows = Object.keys(branchMap).sort().map(function (k) {
      var item = branchMap[k];
      var uPct = item.total ? Math.round((item.rented / item.total) * 100) : 0;
      var estMonth = item.monthlySum > 0 ? item.monthlySum : (item.dailySum * 30);
      return [
        item.name,
        num(item.total),
        num(item.rented),
        uPct + '%',
        currency(item.dailySum),
        currency(estMonth),
        currency(item.maintSum)
      ];
    });

    var foot = [
      'الإجمالي العام',
      num(model.total),
      num(model.rentedCars),
      model.utilRate + '%',
      currency(model.dailyRateSum),
      currency(model.projectedMonthly),
      currency(model.maintCostSum)
    ];

    return {
      title: 'الملخص المالي العام',
      subtitle: 'نظرة شاملة على الأداء المالي، العوائد التشغيلية، ومصروفات الصيانة عبر الفروع.',
      kpis: [
        { label: 'إجمالي القيمة اليومية', value: currency(model.dailyRateSum), hint: 'متوسط: ' + currency(model.avgDaily), cls: 'good' },
        { label: 'العائد اليومي الفعلي', value: currency(model.rentedDailySum), hint: num(model.rentedCars) + ' سيارة مؤجرة حالياً', cls: 'good' },
        { label: 'العائد الشهري المقدر', value: currency(model.projectedMonthly), hint: 'بناءً على عقود التأجير', cls: '' },
        { label: 'مصروفات الصيانة المسجلة', value: currency(model.maintCostSum), hint: num(model.maintCarsCount) + ' سيارة خضعت للصيانة', cls: model.maintCostSum ? 'warn' : '' },
        { label: 'نسبة تشغيل الأسطول', value: model.utilRate + '%', hint: num(model.rentedCars) + ' من ' + num(model.total) + ' سيارة', cls: model.utilRate >= 70 ? 'good' : 'warn' },
        { label: 'طلبات الفحص والدفع', value: num(model.pendingCount + model.paidCount + model.renewedCount), hint: num(model.pendingCount) + ' معلقة / ' + num(model.paidCount) + ' مسددة', cls: '' }
      ],
      sections: [
        {
          title: 'الأداء المالي ومؤشرات الإيرادات حسب الفروع',
          headers: ['الفرع', 'إجمالي السيارات', 'سيارات مؤجرة', 'نسبة التشغيل', 'إجمالي القيمة اليومية', 'الإيراد الشهري المقدر', 'مصروفات الصيانة'],
          rows: rows,
          foot: foot
        }
      ]
    };
  }

  function getRevenueView(model, cars) {
    var branchMap = {};
    cars.forEach(function (car) {
      if (!car) return;
      var b = String(car.branch || '').trim() || 'غير محدد';
      if (!branchMap[b]) {
        branchMap[b] = { name: b, total: 0, priced: 0, minDaily: 999999, maxDaily: 0, dailySum: 0, monthlySum: 0 };
      }
      var bm = branchMap[b];
      bm.total++;
      var dr = Number(car.dailyRate) || 0;
      if (dr > 0) {
        bm.priced++;
        bm.dailySum += dr;
        if (dr < bm.minDaily) bm.minDaily = dr;
        if (dr > bm.maxDaily) bm.maxDaily = dr;
      }
      bm.monthlySum += (Number(car.monthlyRate) || 0);
    });

    var branchRows = Object.keys(branchMap).sort().map(function (k) {
      var item = branchMap[k];
      var avg = item.priced ? Math.round(item.dailySum / item.priced) : 0;
      var minStr = item.priced ? currency(item.minDaily) : '—';
      var maxStr = item.priced ? currency(item.maxDaily) : '—';
      var estMonth = item.monthlySum > 0 ? item.monthlySum : (item.dailySum * 30);
      return [
        item.name,
        num(item.total),
        num(item.priced),
        minStr,
        currency(avg),
        maxStr,
        currency(item.dailySum),
        currency(estMonth)
      ];
    });

    var carRows = cars.slice(0, 150).map(function (c) {
      return [
        c.plate || '—',
        (c.brand || '') + ' ' + (c.model || ''),
        c.year || '—',
        c.branch || '—',
        c.carStatus || 'غير محدد',
        currency(c.dailyRate || 0),
        currency(c.monthlyRate || (Number(c.dailyRate || 0) * 30)),
        c.minDailyRate ? currency(c.minDailyRate) : '—'
      ];
    });

    return {
      title: 'إيرادات وتسعير الأسطول',
      subtitle: 'تحليل سياسات التسعير، متوسطات الأسعار اليومية والشهرية، والقيمة التعاقدية.',
      kpis: [
        { label: 'إجمالي القيمة اليومية', value: currency(model.dailyRateSum), hint: 'لكل الأسطول المتاح والمؤجر', cls: 'good' },
        { label: 'متوسط سعر اليوم', value: currency(model.avgDaily), hint: 'لكل سيارة مسعرة', cls: '' },
        { label: 'متوسط سعر الشهر', value: currency(model.avgMonthly), hint: 'لكل سيارة مسعرة', cls: '' },
        { label: 'سيارات مسعرة يومياً', value: num(model.dailyPricedCount) + ' / ' + num(model.total), hint: 'نسبة التغطية ' + (model.total ? Math.round((model.dailyPricedCount / model.total) * 100) : 0) + '%', cls: '' },
        { label: 'سيارات مؤجرة تدر دخلاً', value: num(model.rentedCars), hint: currency(model.rentedDailySum) + ' يومياً', cls: 'good' },
        { label: 'سيارات متاحة للإيجار', value: num(model.availableCars), hint: 'جاهزة للتشغيل الفوري', cls: '' }
      ],
      sections: [
        {
          title: 'متوسطات وسياسات التسعير حسب الفروع',
          headers: ['الفرع', 'إجمالي السيارات', 'المسعرة', 'أدنى سعر يوم', 'متوسط سعر اليوم', 'أعلى سعر يوم', 'القيمة اليومية للفرع', 'الدخل الشهري المتوقع'],
          rows: branchRows,
          foot: ['الإجمالي', num(model.total), num(model.dailyPricedCount), '—', currency(model.avgDaily), '—', currency(model.dailyRateSum), currency(model.projectedMonthly)]
        },
        {
          title: 'قائمة تسعير السيارات (أول 150 سيارة)',
          headers: ['اللوحة', 'الماركة والموديل', 'سنة الصنع', 'الفرع', 'الحالة', 'سعر اليوم', 'سعر الشهر', 'الحد الأدنى لليوم'],
          rows: carRows
        }
      ]
    };
  }

  function getMaintenanceView(model, cars) {
    var branchMap = {};
    var workshopMap = {};

    cars.forEach(function (car) {
      if (!car) return;
      var b = String(car.branch || '').trim() || 'غير محدد';
      if (!branchMap[b]) {
        branchMap[b] = { name: b, total: 0, maintCount: 0, costSum: 0, underMaint: 0 };
      }
      var bm = branchMap[b];
      bm.total++;
      if (String(car.carStatus || '').trim() === 'تحت الصيانة') bm.underMaint++;
      var mc = Number(car.maintenanceCost) || 0;
      if (mc > 0) {
        bm.maintCount++;
        bm.costSum += mc;
      }

      var ws = String(car.workshop || '').trim();
      if (ws && ws !== 'غير محددة' && ws !== 'غير محدد' && mc > 0) {
        if (!workshopMap[ws]) {
          workshopMap[ws] = { name: ws, count: 0, costSum: 0 };
        }
        workshopMap[ws].count++;
        workshopMap[ws].costSum += mc;
      }
    });

    var branchRows = Object.keys(branchMap).sort().map(function (k) {
      var item = branchMap[k];
      var avg = item.maintCount ? Math.round(item.costSum / item.maintCount) : 0;
      return [
        item.name,
        num(item.total),
        num(item.maintCount),
        currency(item.costSum),
        currency(avg),
        num(item.underMaint)
      ];
    });

    var wsRows = Object.keys(workshopMap).map(function (k) { return workshopMap[k]; })
      .sort(function (a, b) { return b.costSum - a.costSum; })
      .map(function (ws) {
        var avg = ws.count ? Math.round(ws.costSum / ws.count) : 0;
        var pct = model.maintCostSum ? Math.round((ws.costSum / model.maintCostSum) * 100) : 0;
        return [
          ws.name,
          num(ws.count),
          currency(ws.costSum),
          currency(avg),
          pct + '%'
        ];
      });

    return {
      title: 'مصروفات الصيانة ومراكز الخدمة',
      subtitle: 'حصر تكاليف الصيانة الدورية والطارئة، متوسط الفواتير، ومراكز الخدمة الأكثر استهلاكاً.',
      kpis: [
        { label: 'إجمالي مصروفات الصيانة', value: currency(model.maintCostSum), hint: 'المسجلة في بطاقات السيارات', cls: model.maintCostSum ? 'warn' : '' },
        { label: 'سيارات خضعت للصيانة', value: num(model.maintCarsCount), hint: 'من أصل ' + num(model.total) + ' سيارة', cls: '' },
        { label: 'متوسط تكلفة الصيانة', value: currency(model.avgMaint), hint: 'لكل سيارة مسجلة بتكلفة', cls: '' },
        { label: 'تحت الصيانة حالياً', value: num(model.underMaintCars), hint: 'خارج التشغيل المؤقت', cls: model.underMaintCars ? 'bad' : 'good' },
        { label: 'مراكز الخدمة والورش', value: num(Object.keys(workshopMap).length), hint: 'ورش مسجلة بالبيانات', cls: '' },
        { label: 'نسبة أسطول خضع للصيانة', value: (model.total ? Math.round((model.maintCarsCount / model.total) * 100) : 0) + '%', hint: 'معدل دورة الصيانة', cls: '' }
      ],
      sections: [
        {
          title: 'تكاليف الصيانة ومتوسط الفاتورة حسب الفروع',
          headers: ['الفرع', 'إجمالي السيارات', 'سيارات خضعت للصيانة', 'إجمالي التكلفة', 'متوسط التكلفة للسيارة', 'تحت الصيانة حالياً'],
          rows: branchRows,
          foot: ['الإجمالي', num(model.total), num(model.maintCarsCount), currency(model.maintCostSum), currency(model.avgMaint), num(model.underMaintCars)]
        },
        {
          title: 'توزيع المصروفات حسب الورش ومراكز الخدمة',
          headers: ['الورشة / مركز الخدمة', 'عدد السيارات', 'إجمالي التكلفة', 'متوسط الفاتورة', 'النسبة من المصروفات'],
          rows: wsRows.length ? wsRows : [['لا توجد ورش مسجلة بتكاليف صيانة بعد', '—', '—', '—', '—']]
        }
      ]
    };
  }

  function getFeesView(model, cars) {
    var branchMap = {};
    cars.forEach(function (car) {
      if (!car) return;
      var b = String(car.branch || '').trim() || 'غير محدد';
      if (!branchMap[b]) {
        branchMap[b] = { name: b, total: 0, needInsp: 0, needLic: 0, needIns: 0 };
      }
      var bm = branchMap[b];
      bm.total++;
      var st = String(car.inspectionStatus || '').trim();
      if (st.includes('مطلوب') || st.includes('تحتاج') || st.includes('منتهي')) bm.needInsp++;
      var lst = String(car.licenseStatus || '').trim();
      if (lst.includes('منتهي') || lst.includes('تجديد')) bm.needLic++;
      var ist = String(car.insuranceStatus || '').trim();
      if (ist.includes('منتهي') || ist.includes('ساري قريباً')) bm.needIns++;
    });

    var rows = Object.keys(branchMap).sort().map(function (k) {
      var item = branchMap[k];
      var estFee = item.needInsp * 100;
      return [
        item.name,
        num(item.total),
        num(item.needInsp),
        num(item.needLic),
        num(item.needIns),
        currency(estFee)
      ];
    });

    return {
      title: 'رسوم الفحص وتجديد الوثائق',
      subtitle: 'حصر ومتابعة رسوم الفحص الدوري، رخص السير، ووثائق الأسطول المتطلبة للسداد.',
      kpis: [
        { label: 'معاملات تحت الدفع', value: num(model.pendingCount), hint: 'بانتظار سداد الرسوم', cls: model.pendingCount ? 'warn' : 'good' },
        { label: 'معاملات تم سدادها', value: num(model.paidCount), hint: 'جاهزة لإكمال التجديد', cls: 'good' },
        { label: 'معاملات تم تجديدها', value: num(model.renewedCount), hint: 'مكتملة ومؤكدة بالكامل', cls: 'good' },
        { label: 'رسوم الفحص المسددة (تقديري)', value: currency(model.paidCount * 100), hint: 'بمعدل 100 ر.س للفحص', cls: 'good' },
        { label: 'رسوم الفحص المعلقة (تقديري)', value: currency(model.pendingCount * 100), hint: 'بانتظار السداد', cls: model.pendingCount ? 'warn' : '' },
        { label: 'إجمالي المعاملات الإجرائية', value: num(model.pendingCount + model.paidCount + model.renewedCount), hint: 'دورة الفحص والدفع الكاملة', cls: '' }
      ],
      sections: [
        {
          title: 'الوثائق المتطلبة للمتابعة والرسوم التقديرية حسب الفروع',
          headers: ['الفرع', 'إجمالي السيارات', 'تحتاج فحص دوري', 'رخص منتهية', 'تأمين للمتابعة', 'رسوم الفحص التقديرية'],
          rows: rows
        }
      ]
    };
  }

  function exportData(title, headers, rows, format) {
    if (!rows || !rows.length) {
      try { global.alert('لا توجد بيانات لتصديرها في هذا الجدول.'); } catch (_) {}
      return;
    }
    var api = global.YahmaExport;
    if (!api) {
      try { global.alert('وحدة التصدير لم تُحمَّل بعد — أعد تحميل الصفحة.'); } catch (_) {}
      return;
    }
    var cleanTitle = String(title || 'تقرير مالي').replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, '_');
    var filename = 'المالية_' + cleanTitle + '_' + (new Date().toISOString().slice(0, 10));

    if (format === 'pdf') {
      if (typeof api.exportTablePdf === 'function') {
        api.exportTablePdf({
          title: 'المالية — ' + title,
          subtitle: 'تقرير مالي مستخرج من نظام إدارة أسطول يهماء',
          headers: headers,
          rows: rows,
          filename: filename + '.pdf'
        });
      }
      return;
    }

    if (typeof api.exportRowsToExcel === 'function') {
      Promise.resolve(api.exportRowsToExcel(filename + '.xlsx', title, headers, rows))
        .catch(function (err) {
          try { global.alert('تعذر تصدير Excel: ' + ((err && err.message) || err)); } catch (_) {}
        });
    }
  }

  function renderFinance(content) {
    var host = content || document.getElementById('content');
    if (!host) return;

    var title = document.getElementById('topbar-title');
    var sub = document.getElementById('topbar-sub');
    if (title) title.textContent = 'المالية';
    if (sub) sub.textContent = 'مؤشرات الإيرادات المتوقعة، إيجارات الأسطول، وتكاليف الصيانة والرسوم.';

    var all = getFleet();
    if (!all.length) {
      global._yahmaCurrentPdfData = null;
      host.innerHTML = '<div class="panel"><h3>لا توجد بيانات بعد</h3>'
        + '<p class="muted-small">لم يتم تحميل أي سيارة. افتح «الأسطول» أو انتظر اكتمال المزامنة ثم ارجع لقسم المالية.</p></div>';
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

    var model = buildFinancialModel(scoped);

    var viewData;
    if (state.view === 'revenue') viewData = getRevenueView(model, scoped);
    else if (state.view === 'maintenance') viewData = getMaintenanceView(model, scoped);
    else if (state.view === 'fees') viewData = getFeesView(model, scoped);
    else viewData = getOverviewView(model, scoped);

    /* بناء رأس الصفحة والأزرار */
    var tabsHtml = VIEWS.map(function (v) {
      return '<button type="button" class="rp-tab' + (v.id === state.view ? ' active' : '') + '" data-fn-tab="' + v.id + '">'
        + esc(v.label) + '</button>';
    }).join('');

    var optionsHtml = ['<option value="">كل الفروع (' + num(all.length) + ' سيارة)</option>'];
    branches.forEach(function (b) {
      optionsHtml.push('<option value="' + esc(b.name) + '"' + (state.branch === b.name ? ' selected' : '') + '>'
        + esc(b.name) + ' (' + num(b.count) + ')</option>');
    });

    var kpisHtml = (viewData.kpis || []).map(function (kpi) {
      return '<div class="rp-kpi ' + esc(kpi.cls || '') + '">'
        + '<span>' + esc(kpi.label) + '</span>'
        + '<b>' + esc(kpi.value) + '</b>'
        + (kpi.hint ? '<small>' + esc(kpi.hint) + '</small>' : '')
        + '</div>';
    }).join('');

    var sectionsHtml = (viewData.sections || []).map(function (sec, idx) {
      var headers = sec.headers || [];
      var rows = sec.rows || [];
      var foot = sec.foot;

      var thHtml = headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('');
      var trHtml = rows.map(function (row) {
        return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>';
      }).join('');

      var tfHtml = '';
      if (foot && foot.length) {
        tfHtml = '<tfoot><tr>' + foot.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr></tfoot>';
      }

      return '<div class="rp-card">'
        + '<div class="rp-card-head">'
        + '<div class="rp-card-title"><h3>' + esc(sec.title) + '</h3></div>'
        + '<div class="rp-card-actions">'
        + '<button type="button" class="rp-btn" data-fn-xlsx="' + idx + '">تصدير Excel</button>'
        + '<button type="button" class="rp-btn" data-fn-pdf="' + idx + '">تصدير PDF</button>'
        + '</div>'
        + '</div>'
        + '<div class="rp-scroll">'
        + '<table class="rp-table">'
        + '<thead><tr>' + thHtml + '</tr></thead>'
        + '<tbody>' + trHtml + '</tbody>'
        + tfHtml
        + '</table>'
        + '</div>'
        + '</div>';
    }).join('');

    host.innerHTML = '<div class="rp-head">'
      + '<div class="rp-head-text"><h2>المالية والتحصيل</h2>'
      + '<div class="muted-small">' + esc(viewData.subtitle) + '</div></div>'
      + '<label class="rp-filter"><span>الفرع</span>'
      + '<select id="fn-branch">' + optionsHtml.join('') + '</select></label>'
      + '</div>'
      + '<div class="rp-tabs">' + tabsHtml + '</div>'
      + '<div class="rp-kpis">' + kpisHtml + '</div>'
      + sectionsHtml;

    /* ربط الأحداث */
    host.querySelectorAll('[data-fn-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-fn-tab');
        if (tabId && tabId !== state.view) {
          state.view = tabId;
          renderFinance(host);
        }
      });
    });

    var branchSelect = host.querySelector('#fn-branch');
    if (branchSelect) {
      branchSelect.addEventListener('change', function () {
        state.branch = String(branchSelect.value || '');
        renderFinance(host);
      });
    }

    host.querySelectorAll('[data-fn-xlsx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-fn-xlsx')) || 0;
        var sec = (viewData.sections || [])[idx];
        if (sec) exportData(sec.title, sec.headers, sec.rows, 'xlsx');
      });
    });

    host.querySelectorAll('[data-fn-pdf]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-fn-pdf')) || 0;
        var sec = (viewData.sections || [])[idx];
        if (sec) exportData(sec.title, sec.headers, sec.rows, 'pdf');
      });
    });

    /* مزود PDF العام للشريط العلوي */
    var primarySection = (viewData.sections || [])[0];
    if (primarySection) {
      global._yahmaCurrentPdfData = function () {
        return {
          title: 'المالية — ' + primarySection.title,
          subtitle: viewData.subtitle,
          headers: primarySection.headers || [],
          rows: primarySection.rows || []
        };
      };
    }
  }

  global.YahmaFinance = { render: renderFinance };
  global.renderFinance = renderFinance;
})(typeof window !== 'undefined' ? window : globalThis);

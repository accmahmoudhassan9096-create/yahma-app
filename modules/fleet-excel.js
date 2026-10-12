(function (global) {
  'use strict';

  const EXCEL_HEADERS = ['رقم اللوحة','الماركة','الطراز','سنة الصنع','اللون','الرقم التسلسلي','رقم البطاقة','حالة البطاقة','تاريخ نهاية البطاقة','حالة الرخصة','تاريخ نهاية الرخصة','حالة الفحص','حالة التامين','شركة التأمين','تاريخ انتهاء التأمين','المالك','رقم المالك','الفرع','المدينة','حالة السيارة','العداد','موعد الصيانة القادمة','آخر صيانة','تكلفة الصيانة','الورشة','رابط المستند','ملاحظات الصيانة','ملاحظات','تنازل','تاريخ التنازل','المالك السابق','حالة التنازل','ملاحظات التنازل'];
  const FIELD_ALIASES = {
    plate: ['رقم اللوحة','اللوحة','رقم السيارة','plate'],
    code: ['الكود','كود السيارة','رقم الكود','الرقم','code'],
    gps: ['GPS','جي بي اس','احداثيات','gps'],
    brand: ['الشركة','الماركة','ماركة','brand','make','company'],
    type: ['النوع','نوع السيارة','نوع المركبة','نوع العربية','الفئة','فئة السيارة','الشكل','type','vehicle type'],
    model: ['الموديل','موديل السيارة','سنة الصنع','سنة الموديل','السنة','model'],
    serial: ['الرقم التسلسلي','رقم الشاسيه','serial','serial number','chassis'],
    cardNumber: ['رقم البطاقة','رقم الكارت','card number'],
    cardStatus: ['حالة الكارت','حالة البطاقة','card status'],
    cardExpiry: ['تاريخ انتهاء الكارت','انتهاء الكارت','تاريخ نهاية الكارت','نهاية الكارت','تاريخ نهاية البطاقة','نهاية البطاقة','انتهاء البطاقة','card expiry'],
    licenseStatus: ['حالة الرخصة','license status'],
    licenseExpiry: ['تاريخ انتهاء الرخصة','انتهاء الرخصة','تاريخ نهاية الرخصة','نهاية الرخصة','license expiry','تاريخ انتهاء الاستمارة'],
    inspectionStatus: ['حالة الفحص','inspection status'],
    insuranceStatus: ['حالة التامين','حالة التأمين','insurance status'],
    insuranceCompany: ['شركة التأمين','شركة التامين','insurance company','insurer'],
    insuranceExpiry: ['تاريخ انتهاء التأمين','انتهاء التأمين','تاريخ نهاية التأمين','نهاية التأمين','insurance expiry'],
    owner: ['المالك','owner'],
    ownerNumber: ['رقم المالك','owner number'],
    odometer: ['العداد','كم الحالي','كم','الممشى','العداد الحالي','odometer','mileage'],
    dailyRate: ['سعر اليوم','سعر يومي','السعر اليومي','daily rate','dailyRate'],
    minDailyRate: ['السعر الأدنى','سعر اليوم الأدنى','سعر اليوم الادنى','السعر الادنى','الحد الأدنى','أقل سعر','min daily rate','minDailyRate'],
    monthlyRate: ['سعر الشهر','السعر الشهري','سعر الشهري','شهريًا','monthly rate','monthlyRate'],
    minMonthlyRate: ['السعر الأدنى __2','السعر الأدنى الشهري','الحد الأدنى الشهري','أقل سعر شهري','min monthly rate','minMonthlyRate'],
    lastMovementDate: ['تاريخ اخر حركة','تاريخ آخر حركة','اخر حركة','آخر حركة','تاريخ آخر تحرك','last movement','lastMovementDate'],
    daysSinceMovement: ['عدد الإيام','عدد الايام','عدد الأيام','أيام من آخر حركة','days since movement','daysSinceMovement'],
    rentedDaysMonth: ['أيام التأجير','أيام الإيجار','عدد أيام التأجير','أيام التأجير هذا الشهر','rented days'],
    city: ['المدينة','city'],
    color: ['اللون','اللون الأساسي','color','اللون الاساسي'],
    chassisNo: ['رقم الهيكل','الهيكل','رقم الشاسيه','chassis no','vin'],
    vehicleCondition: ['وضع المركبة','حالة المركبة','vehicle condition'],
    registrationType: ['نوع التسجيل','التسجيل','registration type'],
    bodyType: ['نوع الهيكل','body type'],
    nextService: ['موعد الصيانة القادمة','الصيانة القادمة','next service'],
    lastMaintenance: ['آخر صيانة','اخر صيانة','last maintenance'],
    maintenanceCost: ['تكلفة الصيانة','maintenance cost'],
    workshop: ['الورشة','مركز الصيانة','workshop'],
    documentUrl: ['رابط المستند','رابط الوثيقة','document url'],
    maintenanceNotes: ['ملاحظات الصيانة','maintenance notes'],
    branch: ['اسم الفرع','الفرع','branch'],
    carStatus: ['حالة السيارة','car status'],
    notes: ['ملاحظات','notes'],
    transferDone: ['تنازل','نقل الملكية','تم التنازل','transfer'],
    transferDate: ['تاريخ التنازل','تاريخ النقل','transfer date'],
    transferFrom: ['المالك السابق','المتنازل','المالك القديم','previous owner'],
    transferStatus: ['حالة التنازل','حالة النقل','transfer status'],
    transferNotes: ['ملاحظات التنازل','ملاحظات النقل','transfer notes']
  };

  function normalizeHeader(value) {
    return String(value).replace(/[\u064B-\u0652]/g, '').replace(/[إأآٱ]/g, 'ا')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findField(header) {
    const normalized = normalizeHeader(header);
    if (!normalized) return null;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(alias => normalizeHeader(alias) === normalized)) return field;
    }
    const has = keyword => normalized.includes(normalizeHeader(keyword));
    if (has('كارت')) {
      if (has('تاريخ') || has('انتهاء')) return 'cardExpiry';
      if (has('حاله')) return 'cardStatus';
      return 'cardNumber';
    }
    // صيغ «البطاقة» (ترويسة القالب نفسه: تاريخ نهاية البطاقة / حالة البطاقة)
    if (has('بطاقه')) {
      if (has('تاريخ') || has('انتهاء') || has('نهايه')) return 'cardExpiry';
      if (has('حاله')) return 'cardStatus';
      return 'cardNumber';
    }
    if (has('رخصه')) return has('حاله') ? 'licenseStatus' : 'licenseExpiry';
    if (has('سياره') && has('حاله')) return 'carStatus';
    if (has('فحص')) return 'inspectionStatus';
    if (has('تامين')) {
      if (has('شركه')) return 'insuranceCompany';
      if (has('تاريخ') || has('انتهاء') || has('نهايه')) return 'insuranceExpiry';
      return 'insuranceStatus';
    }
    if (has('فرع')) return 'branch';
    if (has('لوحه')) return 'plate';
    if (has('شركه') || has('ماركه')) return 'brand';
    /* «الطراز» ملتبس: في ملف الأسطول فهو النوع (صني/يارس)، وفي شيت الأسعار فهو الماركة.
       يُحسم مسبقًا في headerFieldMap حسب وجود عمود «النوع» مع «الطراز» */
    if (has('طراز')) return window.__yahmaTrazzIsBrand ? 'brand' : 'type';
    if (has('موديل')) return 'model';
    if (has('نوع') && !has('وقود')) return 'type';
    if (has('سنه')) return 'model';
    if (has('تسلسلي') || has('شاسيه')) return 'serial';
    if (has('هيكل')) return 'chassisNo';
    if (has('لون')) return 'color';
    if (has('وضع') && has('مركبه')) return 'vehicleCondition';
    if (has('المالك')) return has('رقم') ? 'ownerNumber' : 'owner';
    if (has('تسجيل')) return 'registrationType';
    if (has('ملاحظات')) return 'notes';
    return null;
  }

  function islamicToJD(year, month, day) {
    return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + 1948440 - 1;
  }

  function hijriToGregorianStr(year, month, day) {
    const jd = islamicToJD(year, month, day);
    const date = new Date(Math.round((jd - 2440587.5) * 86400000));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function toDateStr(value) {
    if (!value && value !== 0) return '';
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      const excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return excelDate.toISOString().slice(0, 10);
    }
    if (value instanceof Date && !isNaN(value)) {
      if (value.getFullYear() < 1970) return '';
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return +match[1] < 1500 ? hijriToGregorianStr(+match[1], +match[2], +match[3]) : text;
    match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      const year = +match[3];
      if (year < 1500) return hijriToGregorianStr(year, +match[2], +match[1]);
      return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const year = +match[3];
      if (year < 1500) return hijriToGregorianStr(year, +match[2], +match[1]);
      return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    const date = new Date(text);
    if (isNaN(date)) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const IMPORT_FIELDS = [
    'plate','code','gps','brand','type','model','color','serial','chassisNo','vehicleCondition','registrationType','bodyType',
    'cardNumber','cardStatus','cardExpiry',
    'licenseStatus','licenseExpiry','inspectionStatus','insuranceStatus','insuranceCompany','insuranceExpiry','owner','ownerNumber',
    'odometer','dailyRate','minDailyRate','monthlyRate','minMonthlyRate','lastMovementDate','daysSinceMovement','rentedDaysMonth',
    'nextService','lastMaintenance','maintenanceCost','workshop','documentUrl',
    'maintenanceNotes','branch','city','carStatus','notes',
    'transferDone','transferDate','transferFrom','transferStatus','transferNotes'
  ];

  function isSoldStatus(value) {
    const status = normalizeHeader(value);
    return status.includes('مباع') || status.includes('هلاك') || status.includes('هالك') ||
      status.includes('تالف') || status.includes('للبيع') || status === 'بيع' || /^sold\b/.test(status);
  }

  function normalizeImportValue(field, value) {
    if (value === undefined || value === null) return '';
    if (typeof canonicalBrand === 'function' && field === 'brand') return canonicalBrand(value);
    if (field === 'insuranceStatus' && String(value).trim() === '0') return '';
    /* توحيد الفحص ثنائيًا: تم الفحص، وغيره (بما فيه 0/فارغ) لم يفحص */
    if (field === 'inspectionStatus') {
      const t = String(value).trim();
      return (t === 'تم الفحص' || t === 'سليم' || t === 'ساري' || t === 'ساري المفعول') ? 'تم الفحص' : 'لم يفحص';
    }
    /* التنازل: نعم صريحة فقط تُعتمد، وغيره فارغ */
    if (field === 'transferDone') {
      const t = String(value).trim();
      return (t === 'نعم' || t === '✓' || t === 'تم' || t.toLowerCase() === 'yes' || t === '1') ? 'نعم' : '';
    }
    return ['cardExpiry','licenseExpiry','insuranceExpiry','nextService','lastMaintenance','transferDate','lastMovementDate'].includes(field)
      ? toDateStr(value)
      : String(value).trim();
  }

  function parseImportRows(rows, uid) {
    let skipped = 0;
    const records = [];
    const unknown = new Set();
    /* حسم الالتباس: «الطراز» = الماركة إذا وُجد عمود «النوع» بجانبه (شيت الأسعار)،
       وإلا فهو النوع (قالب الأسطول الداخلي). */
    const firstRow = (Array.isArray(rows) && rows.length) ? (rows[0] || {}) : {};
    const headKeys = Object.keys(firstRow).map(k => normalizeHeader(k));
    const hasCol = (name) => headKeys.includes(normalizeHeader(name));
    const trazIsBrand = hasCol('الطراز') && hasCol('النوع');
    global.__yahmaTrazzIsBrand = trazIsBrand;
    rows.forEach(row => {
      const values = {};
      const provided = new Set();
      Object.keys(row).forEach(header => {
        const field = findField(header);
        if (field) {
          provided.add(field);
          values[field] = normalizeImportValue(field, row[header]);
        } else if (header && !/^__EMPTY/.test(header)) {
          unknown.add(String(header).trim().replace(/\s+__\d+$/, ''));
        }
      });
      if (!values.plate) { skipped++; return; }
      const car = Object.fromEntries(IMPORT_FIELDS.map(field => [field, values[field] || '']));
      car.id = uid();
      records.push({ car, provided: Array.from(provided) });
    });

    const soldKeys = new Set(records.filter(record => isSoldStatus(record.car.carStatus))
      .map(record => normalizeHeader(record.car.plate).replace(/[^\p{L}\p{N}]/gu, '')));
    const sold = records.filter(record => isSoldStatus(record.car.carStatus));
    const active = records.filter(record => !isSoldStatus(record.car.carStatus)
      && !soldKeys.has(normalizeHeader(record.car.plate).replace(/[^\p{L}\p{N}]/gu, '')));
    return { active, sold, skipped, unknown: [...unknown].filter(Boolean) };
  }

  function mergeImportRecord(existing, record) {
    const next = { ...existing };
    let changed = false;
    record.provided.forEach(field => {
      if (field === 'plate' || !Object.prototype.hasOwnProperty.call(record.car, field)) return;
      const value = record.car[field];
      if (value === '') return;
      if (String(next[field] ?? '') !== String(value)) {
        next[field] = value;
        changed = true;
      }
    });
    return { car: next, changed };
  }

  /* ورقة تحديثات الكروت (الورقة الثانية في ملف كروت التشغيل): نفس اللوحات ببيانات
     أحدث للحالة/الفرع/المالك. تُتجاهل حقول الكارت منها عمدًا (بيانات الورقة
     الأساسية أحدث: تواريخ انتهاء أبعد). المفتاح = رقم اللوحة كما هو (يُطبَّع عند الدمج). */
  function parseCardUpdateRows(rows) {
    const updates = new Map();
    if (!Array.isArray(rows) || !rows.length) return updates;
    const headers = Object.keys(rows[0] || {});
    const norm = headers.map(h => normalizeHeader(h));
    const hasH = key => norm.includes(normalizeHeader(key));
    if (!hasH('رقم اللوحة') || !(hasH('الحالة') || hasH('تاريخ الانتهاء'))) return updates;
    const col = (...keys) => headers.find(h => keys.some(k => normalizeHeader(k) === normalizeHeader(h))) || null;
    const cPlate = col('رقم اللوحة'), cBrand = col('الماركة'), cType = col('الطراز'),
      cYear = col('سنة الصنع'), cSerial = col('الرقم التسلسلي'),
      cCarSt = col('حالة السيارة'), cBranch = col('الفرع'), cOwner = col('المالك'), cInsp = col('الفحص');
    if (!cPlate) return updates;
    rows.forEach(row => {
      const plate = String(row[cPlate] ?? '').trim();
      if (!plate) return;
      const get = c => (c ? String(row[c] ?? '').trim() : '');
      const insp = get(cInsp);
      const u = {
        brand: get(cBrand), type: get(cType), model: get(cYear), serial: get(cSerial),
        carStatus: get(cCarSt), branch: get(cBranch), owner: get(cOwner),
        renewedLicense: insp === 'تم تجديد الاستمارة'
      };
      updates.set(plate, u);
    });
    return updates;
  }

  /* متغيرات مطابقة اللوحة لملف التنازلات (بعض اللوحات معكوسة: «8842 ر ح ط» بدل «ر ح ط 8842») */
  function transferPlateVariants(plate){
    const norm = String(plate ?? '').replace(/[ً-ْ]/g, '').replace(/[إأآٱ]/g, 'ا')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ی/g, 'ي')
      .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/\s+/g, '').replace(/[-_]/g, '').trim().toLowerCase();
    const out = [norm];
    let m = norm.match(/^(\d+)(.+)$/);
    if (m) out.push(m[2] + m[1]);
    m = norm.match(/^(.+?)(\d+)$/);
    if (m) out.push(m[2] + m[1]);
    return [...new Set(out)].filter(Boolean);
  }

  /* تحليل ملف التنازلات المخصص (التسلسل/رقم السيارة/الماركه/النوع/الموديل/الشركه):
     الشركة «0» تعني الأمثل (ملخص الملف نفسه: الامثل = 128 = مجموعة الصفر).
     سنة الصنع تُقبل 1990–2027 فقط (العمود ملوث بقيم 2028–2122 متسلسلة). */
  function parseTransferFileRows(rows, uid){
    const out = { detected: false, active: [], skipped: 0, byCompany: {} };
    if (!Array.isArray(rows) || !rows.length) return out;
    const headers = Object.keys(rows[0] || {});
    const norm = headers.map(h => normalizeHeader(h));
    const hasH = key => norm.includes(normalizeHeader(key));
    if (!(hasH('رقم السيارة') && hasH('الماركه') && hasH('الشركه'))) return out;
    out.detected = true;
    const col = (...keys) => headers.find(h => keys.some(k => normalizeHeader(k) === normalizeHeader(h))) || null;
    const cPlate = col('رقم السيارة'), cBrand = col('الماركه'), cType = col('النوع'),
      cYear = col('الموديل'), cCompany = col('الشركه');
    const yearOk = v => /^\d{4}$/.test(String(v ?? '').trim()) && +String(v).trim() >= 1990 && +String(v).trim() <= 2027;
    rows.forEach(row => {
      const plate = String(row[cPlate] ?? '').trim();
      if (!plate) { out.skipped++; return; }
      let company = cCompany ? String(row[cCompany] ?? '').trim() : '';
      if (company === '0') company = 'الأمثل';
      const brand = cBrand ? String(row[cBrand] ?? '').trim() : '';
      const car = {
        id: uid(), plate,
        brand: (typeof canonicalBrand === 'function' && brand) ? canonicalBrand(brand) : brand,
        type: cType ? String(row[cType] ?? '').trim() : '',
        model: (cYear && yearOk(row[cYear])) ? String(row[cYear]).trim() : '',
        transferDone: 'نعم', transferFrom: company,
        transferDate: '', transferStatus: '', transferNotes: ''
      };
      out.active.push(car);
      if (company) out.byCompany[company] = (out.byCompany[company] || 0) + 1;
    });
    return out;
  }

  async function downloadTemplate(context) {
    if (!(await context.ensureXlsxReady())) {
      context.alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.');
      return;
    }
    const example = ['ر ن س 6724','هيونداي','سونت','2026','فضي','82433120','14-00719121','نشط','24/10/2026','نشط','24/10/2027','تم الفحص','ساري','التعاونية','24/10/2027','أحمد سعيد','10001','الفرع الرئيسي','الرياض','متاحة للايجار','','','','','','','','','','','','',''];
    const worksheet = global.XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, example]);
    worksheet['!cols'] = EXCEL_HEADERS.map(() => ({ wch: 20 }));
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, worksheet, 'الأسطول');
    global.XLSX.writeFile(workbook, 'نموذج-بيانات-الأسطول.xlsx');
  }

  async function exportFleet(context) {
    if (!context.fleet.length) {
      context.alert('لا توجد بيانات لتصديرها.');
      return;
    }
    if (!(await context.ensureXlsxReady())) {
      context.alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.');
      return;
    }
    const rows = context.fleet.map(car => [
      car.plate, car.brand, car.type, car.model, car.color, car.serial, car.cardNumber, car.cardStatus, car.cardExpiry,
      car.licenseStatus, car.licenseExpiry, car.inspectionStatus, car.insuranceStatus, car.insuranceCompany, car.insuranceExpiry, car.owner,
      car.ownerNumber, car.branch, car.city, car.carStatus, car.odometer, car.nextService, car.lastMaintenance,
      car.maintenanceCost, car.workshop, car.documentUrl, car.maintenanceNotes, car.notes,
      car.transferDone, car.transferDate, car.transferFrom, car.transferStatus, car.transferNotes
    ]);
    const worksheet = global.XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows]);
    worksheet['!cols'] = EXCEL_HEADERS.map(() => ({ wch: 20 }));
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, worksheet, 'الأسطول');
    global.XLSX.writeFile(workbook, `بيانات-الأسطول-${context.todayStr()}.xlsx`);
  }

  global.YahmaFleetExcel = {
    EXCEL_HEADERS, FIELD_ALIASES, normalizeHeader, findField, toDateStr,
    isSoldStatus, parseImportRows, parseCardUpdateRows, parseTransferFileRows, transferPlateVariants, mergeImportRecord,
    downloadTemplate, exportFleet
  };
})(window);

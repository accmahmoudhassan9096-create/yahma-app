(function (global) {
  'use strict';

  const EXCEL_HEADERS = ['رقم اللوحة','الماركة','النوع','الموديل','سنة الصنع','الرقم التسلسلي','رقم البطاقة','حالة البطاقة','تاريخ نهاية البطاقة','حالة الرخصة','تاريخ نهاية الرخصة','حالة الفحص','حالة التامين','المالك','رقم المالك','الفرع','حالة السيارة','العداد','موعد الصيانة القادمة','آخر صيانة','تكلفة الصيانة','الورشة','رابط المستند','ملاحظات الصيانة','ملاحظات'];
  const FIELD_ALIASES = {
    plate: ['رقم اللوحة','اللوحة','رقم السيارة','plate'],
    brand: ['الشركة','الماركة','ماركة','brand','make','company'],
    type: ['النوع','نوع السيارة','type','vehicle type'],
    model: ['الموديل','الطراز','موديل السيارة','model'],
    year: ['سنة الصنع','سنة الصنع ','year'],
    serial: ['الرقم التسلسلي','رقم الشاسيه','serial','serial number','chassis'],
    cardNumber: ['رقم البطاقة','رقم الكارت','card number'],
    cardStatus: ['حالة الكارت','حالة البطاقة','card status'],
    cardExpiry: ['تاريخ انتهاء الكارت','انتهاء الكارت','تاريخ نهاية الكارت','نهاية الكارت','تاريخ نهاية البطاقة','نهاية البطاقة','انتهاء البطاقة','card expiry'],
    licenseStatus: ['حالة الرخصة','license status'],
    licenseExpiry: ['تاريخ انتهاء الرخصة','انتهاء الرخصة','تاريخ نهاية الرخصة','نهاية الرخصة','license expiry','تاريخ انتهاء الاستمارة'],
    inspectionStatus: ['حالة الفحص','inspection status'],
    insuranceStatus: ['حالة التامين','حالة التأمين','insurance status'],
    owner: ['المالك','owner'],
    ownerNumber: ['رقم المالك','owner number'],
    odometer: ['العداد','odometer','mileage'],
    nextService: ['موعد الصيانة القادمة','الصيانة القادمة','next service'],
    lastMaintenance: ['آخر صيانة','اخر صيانة','last maintenance'],
    maintenanceCost: ['تكلفة الصيانة','maintenance cost'],
    workshop: ['الورشة','مركز الصيانة','workshop'],
    documentUrl: ['رابط المستند','رابط الوثيقة','document url'],
    maintenanceNotes: ['ملاحظات الصيانة','maintenance notes'],
    branch: ['الفرع','branch'],
    carStatus: ['حالة السيارة','car status'],
    notes: ['ملاحظات','notes']
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
    if (has('تامين')) return 'insuranceStatus';
    if (has('فرع')) return 'branch';
    if (has('لوحه')) return 'plate';
    if (has('شركه') || has('ماركه')) return 'brand';
    if (has('طراز') || has('موديل')) return 'model';
    if (has('سنه')) return 'year';
    if (has('تسلسلي') || has('شاسيه')) return 'serial';
    if (has('المالك')) return has('رقم') ? 'ownerNumber' : 'owner';
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
    'plate','brand','type','model','year','serial','cardNumber','cardStatus','cardExpiry',
    'licenseStatus','licenseExpiry','inspectionStatus','insuranceStatus','owner','ownerNumber',
    'odometer','nextService','lastMaintenance','maintenanceCost','workshop','documentUrl',
    'maintenanceNotes','branch','carStatus','notes'
  ];

  function isSoldStatus(value) {
    const status = normalizeHeader(value);
    return status.includes('مباع') || /^sold\b/.test(status);
  }

  function normalizeImportValue(field, value) {
    if (value === undefined || value === null) return '';
    return ['cardExpiry','licenseExpiry','nextService','lastMaintenance'].includes(field)
      ? toDateStr(value)
      : String(value).trim();
  }

  function parseImportRows(rows, uid) {
    let skipped = 0;
    const records = [];
    rows.forEach(row => {
      const values = {};
      const provided = new Set();
      Object.keys(row).forEach(header => {
        const field = findField(header);
        if (field) {
          provided.add(field);
          values[field] = normalizeImportValue(field, row[header]);
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
    return { active, sold, skipped };
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

  async function downloadTemplate(context) {
    if (!(await context.ensureXlsxReady())) {
      context.alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.');
      return;
    }
    const example = ['ر ن س 6724','هيونداي','سيدان','اكسنت','2025','82433120','14-00719121','نشط','24/10/2026','نشط','24/10/2027','سليم','ساري','أحمد سعيد','10001','الفرع الرئيسي','نشط','','','','','','','',''];
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
      car.plate, car.brand, car.type, car.model, car.year, car.serial, car.cardNumber, car.cardStatus, car.cardExpiry,
      car.licenseStatus, car.licenseExpiry, car.inspectionStatus, car.insuranceStatus, car.owner,
      car.ownerNumber, car.branch, car.carStatus, car.odometer, car.nextService, car.lastMaintenance,
      car.maintenanceCost, car.workshop, car.documentUrl, car.maintenanceNotes, car.notes
    ]);
    const worksheet = global.XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows]);
    worksheet['!cols'] = EXCEL_HEADERS.map(() => ({ wch: 20 }));
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, worksheet, 'الأسطول');
    global.XLSX.writeFile(workbook, `بيانات-الأسطول-${context.todayStr()}.xlsx`);
  }

  global.YahmaFleetExcel = {
    EXCEL_HEADERS, FIELD_ALIASES, normalizeHeader, findField, toDateStr,
    isSoldStatus, parseImportRows, mergeImportRecord,
    downloadTemplate, exportFleet
  };
})(window);

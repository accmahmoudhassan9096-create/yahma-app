/* Shared pure helpers used by the classic-script modules. */
(function (global) {
  'use strict';

  function uid() { return 'c' + Date.now() + Math.floor(Math.random() * 10000); }

  function islamicToJD(year, month, day) {
    return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + 1948440 - 1;
  }

  function hijriToGregorianStr(year, month, day) {
    const jd = islamicToJD(year, month, day);
    const date = new Date(Math.round((jd - 2440587.5) * 86400000));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function normalizeDateValue(value) {
    if (!value && value !== 0) return '';
    if (value && typeof value.toDate === 'function') value = value.toDate();
    if (value && typeof value === 'object' && value.seconds !== undefined) value = new Date(value.seconds * 1000);
    if (value instanceof Date && !isNaN(value)) {
      const y = value.getFullYear();
      if (y >= 1300 && y <= 1500) return hijriToGregorianStr(y, value.getMonth() + 1, value.getDate());
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      const excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return excelDate.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const y = +m[3];
      if (y >= 1300 && y <= 1500) return hijriToGregorianStr(y, +m[2], +m[1]);
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      const y = +m[1];
      if (y >= 1300 && y <= 1500) return hijriToGregorianStr(y, +m[2], +m[3]);
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/);
    if (m) {
      const y = +m[1];
      if (y >= 1300 && y <= 1500) return hijriToGregorianStr(y, +m[2], +m[3]);
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return '';
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

  /* ينتهي خلال N شهر من النهاردة (شهر تقويمي، مش 30 يوم × N).
     بترجع true لو التاريخ فات أو داخل نفس الفترة — ده اللي بنحتاجه
     لقاعدة «الرخصة بتخلص قريب = السيارة محتاجة فحص». */
  function expiresWithinMonths(dateStr, months) {
    const days = daysFromNow(dateStr);
    if (days === null) return false;
    if (days < 0) return true;                    // انتهت خلاص
    const n = Number(months) || 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const limit = new Date(now.getTime());
    limit.setMonth(limit.getMonth() + n);        // 3 شهور = ~90–92 يوم حسب الشهر
    const end = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
    const target = new Date(normalizeDateValue(dateStr) + 'T00:00:00');
    return target <= end;
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
    if (t === 'سليم' || t === 'تم الفحص' || t === 'ساري' || t.startsWith('ساري ') || t === 'مفحوص' || t === 'مفحوصة' || t === 'ناجح' || t === 'اجتاز') return { level: 'green', label: t };
    if (t.includes('يحتاج') || t.includes('تحتاج')) return { level: 'amber', label: 'يحتاج فحص' };
    // لم يفحص / لم تفحص / لم تُفحص — كل صيغ "لم + فحص" تُعامل لم يفحص
    if (t === 'لم يفحص' || t === 'لم تفحص' || (t.includes('لم') && (t.includes('فحص') || t.includes('تفحص')))) return { level: 'red', label: 'لم يفحص' };
    if (t.includes('لم يتم') || t.includes('منتهي') || t.includes('غير سليم')) return { level: 'red', label: 'لم يتم الفحص' };
    if ((t.includes('غير') || t.includes('بدون')) && (t.includes('فحص') || t.includes('مفحوص') || t.includes('تفحص'))) return { level: 'red', label: 'لم يتم الفحص' };
    return { level: 'grey', label: t };
  }

  function textTag(value) {
    const t = String(value ?? '').trim();
    if (!t) return { level: 'grey', label: 'غير محدد' };
    const tn = t.replace(/[إأآ]/g, 'ا');
    if (t === 'نشط' || t === 'سليم' || t === 'ساري' || t.startsWith('ساري ') || t === 'موجودة' || t === 'مؤجرة' || t === 'خدمة' || tn === 'متاحة للايجار' || tn === 'متاحه للايجار') return { level: 'green', label: t };
    if (t.includes('يحتاج')) return { level: 'amber', label: t };
    if (t === 'للبيع' || t === 'حجز') return { level: 'amber', label: t };
    if (t.includes('منتهي') || t.includes('ملغ') || t.includes('موقوف') || t.includes('لا يوجد') || t.includes('لم يتم') || t.includes('مسروق') || t.includes('محول') || t.includes('مفقود') || t.includes('خارج')) return { level: 'red', label: t };
    return { level: 'grey', label: t };
  }

  /* المناطق الجغرافية للفروع: غربية (جدة/مكة/المدينة/الطائف/أبها/تبوك...)، شرقية (الدمام/الخبر/الأحساء...)، والباقي وسطى */
  const REGION_DEFS = [
    { id: 'west', label: 'المنطقة الغربية', lat: 21.9, lng: 39.6, color: '#3B82C4',
      keys: ['ابحر','ابها','تبوك','فلسطين','جدة','جده','مكة','مكه','المدينة','المدينه','الطائف','الطايف','ينبع','جيزان','جازان','نجران','القنفذة','رابغ','الليث','الغربية','الغربيه'] },
    { id: 'east', label: 'المنطقة الشرقية', lat: 26.2, lng: 49.9, color: '#0BAA86',
      keys: ['دمام','الدمام','خبر','الخبر','الاحساء','الأحساء','الهفوف','الجبيل','القطيف','الخفجي','حفر','الشرقية','الشرقيه'] },
    { id: 'central', label: 'المنطقة الوسطى', lat: 24.4, lng: 46.2, color: '#E6A23C', keys: [] }
  ];
  function regionOfBranch(branch, city){
    /* المدينة أصدق من اسم الفرع (فروع مثل «فرع 8» لا تحمل اسم مدينة) */
    const probe = [city, branch].map(v => ' ' + String(v ?? '').replace(/[أإآ]/g, 'ا') + ' ');
    for (const t of probe) {
      if (!t.trim()) continue;
      const hit = REGION_DEFS.find(r => r.id !== 'central' && r.keys.some(k => t.includes(k)));
      if (hit) return hit.id;
    }
    return (REGION_DEFS[2]).id;
  }

  /* إحداثيات المدن لفروع الخريطة (تقريبية لمراكز المدن) */
  const CITY_COORDS = [
    { keys: ['ابحر', 'فلسطين', 'جدة', 'جده', 'رابغ'], name: 'جدة', lat: 21.54, lng: 39.17 },
    { keys: ['مكة', 'مكه'], name: 'مكة', lat: 21.39, lng: 39.86 },
    { keys: ['المدينة', 'المدينه'], name: 'المدينة', lat: 24.47, lng: 39.61 },
    { keys: ['الطائف', 'الطايف'], name: 'الطائف', lat: 21.28, lng: 40.42 },
    { keys: ['ابها'], name: 'أبها', lat: 18.22, lng: 42.51 },
    { keys: ['تبوك'], name: 'تبوك', lat: 28.39, lng: 36.57 },
    { keys: ['جيزان', 'جازان'], name: 'جازان', lat: 16.89, lng: 42.55 },
    { keys: ['نجران'], name: 'نجران', lat: 17.49, lng: 44.13 },
    { keys: ['ينبع'], name: 'ينبع', lat: 24.09, lng: 38.06 },
    { keys: ['الباحة', 'الباحه'], name: 'الباحة', lat: 20.01, lng: 41.47 },
    { keys: ['الدمام', 'دمام'], name: 'الدمام', lat: 26.42, lng: 50.1 },
    { keys: ['خبر', 'الخبر'], name: 'الخبر', lat: 26.22, lng: 50.21 },
    { keys: ['الاحساء', 'الأحساء', 'الهفوف'], name: 'الأحساء', lat: 25.36, lng: 49.59 },
    { keys: ['الجبيل'], name: 'الجبيل', lat: 27.01, lng: 49.65 },
    { keys: ['القطيف'], name: 'القطيف', lat: 26.92, lng: 50.01 },
    { keys: ['الخفجي'], name: 'الخفجي', lat: 28.42, lng: 48.5 },
    { keys: ['حفر'], name: 'حفر الباطن', lat: 28.43, lng: 45.96 },
    { keys: ['القصيم', 'بريدة', 'بريده', 'عنيزة', 'عنيزه'], name: 'القصيم', lat: 26.33, lng: 43.97 },
    { keys: ['حائل'], name: 'حائل', lat: 27.51, lng: 41.72 },
    { keys: ['عرعر'], name: 'عرعر', lat: 30.98, lng: 41.03 },
    { keys: ['سكاكا', 'الجوف'], name: 'سكاكا', lat: 29.97, lng: 40.2 },
    { keys: ['الخرج'], name: 'الخرج', lat: 24.15, lng: 47.31 },
    { keys: ['الدوادمي'], name: 'الدوادمي', lat: 24.5, lng: 44.4 },
    { keys: ['المجمعة', 'المجمعه'], name: 'المجمعة', lat: 25.91, lng: 45.35 },
    { keys: ['الزلفي'], name: 'الزلفي', lat: 26.3, lng: 44.81 },
    { keys: ['عفيف'], name: 'عفيف', lat: 24.73, lng: 42.88 },
    { keys: ['وادي الدواسر'], name: 'وادي الدواسر', lat: 20.46, lng: 44.89 },
    { keys: ['شقراء'], name: 'شقراء', lat: 25.24, lng: 45.25 }
  ];
  function cityOfBranch(branch, city){
    /* إن كانت المدينة معروفة نستخدمها، وإلا نستنتجها من اسم الفرع */
    const probe = [city, branch].map(v => ' ' + String(v ?? '').replace(/[أإآ]/g, 'ا') + ' ');
    for (const t of probe) {
      if (!t.trim()) continue;
      const hit = CITY_COORDS.find(c => c.keys.some(k => t.includes(k)));
      if (hit) return hit;
    }
    return { name: 'الرياض', lat: 24.63, lng: 46.68 };
  }
  /* ===== توقّع دوران الأسطول: أقرب انتهاء بين الكارت والرخصة والتأمين ===== */
  const CHURN_DOCS = [
    { key: 'cardExpiry', label: 'كارت', icon: '🪪' },
    { key: 'licenseExpiry', label: 'رخصة', icon: '📄' },
    { key: 'insuranceExpiry', label: 'تأمين', icon: '🛡️' }
  ];
  /* CHURN_BUCKETS بالترتيب: كل بند يغطي (من، إلى] بالأيام؛ null = بلا تاريخ */
  const CHURN_BUCKETS = [
    { id: 'expired', label: 'منتهية بالفعل', color: '#E64B4B', min: -99999, max: -1 },
    { id: 'd30', label: 'خلال 30 يوم', color: '#E6A23C', min: 0, max: 30 },
    { id: 'd60', label: '31 – 60 يوم', color: '#D6952A', min: 31, max: 60 },
    { id: 'd90', label: '61 – 90 يوم', color: '#3B82C4', min: 61, max: 90 },
    { id: 'd180', label: '91 – 180 يوم', color: '#0E8F8D', min: 91, max: 180 },
    { id: 'later', label: 'بعد 180 يوم', color: '#9AA5B1', min: 181, max: 99999 },
    { id: 'nodate', label: 'بلا تاريخ', color: '#C9CEDA', min: null, max: null }
  ];
  function carChurn(car) {
    let best = null, docs = [];
    CHURN_DOCS.forEach(d => {
      const days = daysFromNow(car && car[d.key]);
      docs.push({ key: d.key, label: d.label, icon: d.icon, days });
      if (days !== null && (best === null || days < best)) best = days;
    });
    const bucket = CHURN_BUCKETS.find(b => b.min !== null && best !== null && best >= b.min && best <= b.max)
      || CHURN_BUCKETS[CHURN_BUCKETS.length - 1];
    return { days: best, bucket: bucket.id, label: bucket.label, docs };
  }
  function churnStats(cars) {
    const list = Array.isArray(cars) ? cars : [];
    const out = { total: list.length, buckets: {}, docs: {}, riskBranches: {} };
    CHURN_BUCKETS.forEach(b => { out.buckets[b.id] = { cars: 0, docs: 0 }; });
    CHURN_DOCS.forEach(d => { out.docs[d.key] = { expired: 0, d30: 0, d90: 0, total: 0 }; });
    list.forEach(c => {
      const r = carChurn(c);
      if (out.buckets[r.bucket]) out.buckets[r.bucket].cars++;
      r.docs.forEach(d => {
        if (d.days === null) return;
        const b = CHURN_BUCKETS.find(x => x.min !== null && d.days >= x.min && d.days <= x.max);
        if (!b) return;
        out.buckets[b.id].docs++;
        const t = out.docs[d.key];
        t.total++;
        if (d.days < 0) t.expired++;
        else if (d.days <= 30) t.d30++;
        else if (d.days <= 90) t.d90++;
      });
      /* خBranch-level risk: منتهية أو خلال 30 يوم */
      if (r.days !== null && r.days <= 30) {
        const b = (c.branch || 'غير محدد').trim() || 'غير محدد';
        out.riskBranches[b] = (out.riskBranches[b] || 0) + 1;
      }
    });
    out.riskList = Object.entries(out.riskBranches).sort((a, b) => b[1] - a[1]);
    out.risk30 = (out.buckets.expired.cars + out.buckets.d30.cars);
    return out;
  }

  /* توحيد أسماء الماركات: هونداي/هيونداى/هيونداي ← هيونداي ... */
  function brandKey(value){
    return String(value ?? '').replace(/[ً-ْ]/g, '').replace(/[إأآٱ]/g, 'ا')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ی/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  const BRAND_ALIASES = {
    'هيونداي': ['هونداي', 'هيونداي', 'هونداي', 'هيونداى', 'hyundai'],
    'تويوتا': ['تيوتا', 'تويوتا', 'toyota'],
    'كيا': ['kia'],
    'نيسان': ['نيسان', 'nissan'],
    'هوندا': ['هوندا', 'honda'],
    'فورد': ['فورد', 'ford'],
    'شيفروليه': ['شفروليه', 'شيفورليه', 'شيفروليه', 'شيفورلية', 'chevrolet'],
    'جيه ام سي': ['j m c', 'jmc'],
    'جي ام سي': ['جي ام سي', 'جى ام سى', 'gmc'],
    'ام جي': ['ام جي', 'mg'],
    'ايسوزو': ['ايسوزو', 'isuzu'],
    'سوزوكي': ['سوزوكي', 'سوزوكى', 'suzuki'],
    'ميتسوبيشي': ['متسوبيشي', 'ميتسوبيشي', 'mitsubishi'],
    'مازدا': ['مازدا', 'mazda'],
    'لكزس': ['لكزس', 'ليكزس', 'lexus'],
    'لاند روفر': ['لاند روفر', 'لاندروفر', 'land rover', 'landrover'],
    'رنج روفر': ['رنج روفر', 'رانج روفر', 'رينج روفر', 'range rover'],
    'مرسيدس': ['مرسيدس', 'مرسيدس بنز', 'benz', 'mercedes'],
    'بي ام دبليو': ['بي ام', 'بي ام دبليو', 'bmw'],
    'اودي': ['اودي', 'audi'],
    'فولكس واجن': ['فولكس واجن', 'volkswagen', 'vw'],
    'رينو': ['رينو', 'renault'],
    'بيجو': ['بيجو', 'peugeot'],
    'ستروين': ['ستروين', 'citroen'],
    'فيات': ['فيات', 'fiat'],
    'سكودا': ['سكودا', 'skoda'],
    'سيات': ['سيات', 'seat'],
    'شانجان': ['شانجان', 'شنجان', 'changan'],
    'شيري': ['شيري', 'chery'],
    'جيلي': ['جيلي', 'geely'],
    'هافال': ['هافال', 'haval'],
    'جريت وول': ['جريت وول', 'great wall', 'gwm'],
    'فوتون': ['فوتون', 'foton'],
    'جاك': ['جاك', 'jac'],
    'دونج فينج': ['دونج فينج', 'dongfeng'],
    'بايك': ['بايك', 'baic'],
    'هونشي': ['هونشي', 'hongqi'],
    'بيستون': ['بيستون', 'bestune'],
    'فاو': ['فاو', 'faw'],
    'سايك': ['سايك', 'saic'],
    'رووي': ['رووي', 'roewe'],
    'ماكسوس': ['ماكسوس', 'maxus'],
    'لينك اند كو': ['لينك اند كو', 'lynk'],
    'لينكون': ['لينكون', 'lincoln'],
    'كاديلاك': ['كاديلاك', 'cadillac'],
    'كرايسلر': ['كرايسلر', 'chrysler'],
    'دودج': ['دودج', 'dodge'],
    'جيب': ['جيب', 'jeep'],
    'انفينيتي': ['انفينيتي', 'infiniti'],
    'جينيسيس': ['جينيسيس', 'جنيسيس', 'genesis'],
    'اكورا': ['اكورا', 'acura'],
    'تسلا': ['تسلا', 'tesla'],
    'دايهاتسو': ['دايهاتسو', 'daihatsu'],
    'سوبارو': ['سوبارو', 'subaru'],
    'سانج يونج': ['سانج يونج', 'ssangyong', 'kgm'],
    'بروتون': ['بروتون', 'proton'],
    'لادا': ['لادا', 'lada'],
    'زوتي': ['زوتي', 'zotye']
  };
  const BRAND_LOOKUP = {};
  Object.entries(BRAND_ALIASES).forEach(([canon, variants]) => {
    BRAND_LOOKUP[brandKey(canon)] = canon;
    (variants || []).forEach(v => { BRAND_LOOKUP[brandKey(v)] = canon; });
  });
  function canonicalBrand(value){
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return BRAND_LOOKUP[brandKey(raw)] || raw;
  }
  function normStatus(s){
    return String(s ?? '').replace(/[ً-ْ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ة/g, 'ه').trim();
  }
  function carStatusOut(value){
    const s = String(value ?? '').trim();
    return s.includes('خارج') || s.includes('مسروق') || s.includes('محول') || s.includes('مفقود');
  }
  function carStatusActive(value){
    const s = String(value ?? '').trim();
    return !(s.includes('صيانة') || s.includes('خارج') || s.includes('مسروق') || s.includes('محول') || s.includes('مفقود') || s.includes('مباع') || s.includes('مؤرشفة'));
  }
  function carStatusReady(value){
    const s = normStatus(value);
    return s === 'نشط' || s === 'موجوده' || s === 'متاحه للايجار';
  }
  function carStatusMatch(value, want){
    const got = normStatus(value), w = normStatus(want);
    if (!w) return true;
    if (got === w) return true;
    if (w === 'متاحه للايجار' && (got === 'موجوده' || got === 'نشط')) return true; // قيم قديمة قبل التوحيد
    if (w === 'للبيع' && got === 'معروضه للبيع') return true; // صيغة بهاء بدل التاء المربوطة
    if (w === 'موجوده' && got === 'نشط') return true;
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

  /* رخصة السيارة في مصر صالحة 3 سنوات — بنحسب بالسنة مش بالأيام
     عشان 365*3 يتخطى سنة كاملة في Leap years. */
  const LICENSE_YEARS = 3;
  function addYears(dateStr, n) {
    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    d.setFullYear(d.getFullYear() + n);
    return d.toISOString().slice(0, 10);
  }
  function defaultLicenseExpiry(from) {
    return addYears(from || todayStr(), LICENSE_YEARS);
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  /* ===== إعادة المحاولة =====

     أول تحميل بعد الدخول كان أحيانًا يطلع «لم تظهر البيانات»: الجلسة
     بتترجّع من التخزين بشكل غير متزامن، أو الشبكة بتقطع لحظة، فطلب
     السيارات بيرجع فاضي/بيفشل مرة واحدة — والتطبيق كان بيستسلم
     ويفضل على الشاشة الفاضية لحد ما المستخدم يعمل ريفرش بنفسه.

     retryAsync بتعيد تنفيذ المهمة بعدد محاولات وبتأخير متزايد،
     وبتقبل shouldRetry عشان نقرر نعيد ولا لأ حسب النتيجة أو الخطأ. */
  function retryAsync(task, options) {
    const opts = options || {};
    const attempts = Math.max(1, Number(opts.attempts) || 3);
    const delays = (Array.isArray(opts.delays) && opts.delays.length) ? opts.delays : [600, 1500];
    const shouldRetry = typeof opts.shouldRetry === 'function'
      ? opts.shouldRetry
      : function (info) { return !!info.error; };
    let attempt = 0;
    function wait(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
    function run() {
      attempt += 1;
      return Promise.resolve().then(task).then(function (value) {
        if (attempt < attempts && shouldRetry({ error: null, value: value, attempt: attempt })) {
          return wait(delays[Math.min(attempt - 1, delays.length - 1)]).then(run);
        }
        return value;
      }, function (error) {
        if (attempt < attempts && shouldRetry({ error: error, value: undefined, attempt: attempt })) {
          return wait(delays[Math.min(attempt - 1, delays.length - 1)]).then(run);
        }
        throw error;
      });
    }
    return run();
  }

  /* ===== البحث في الجداول =====

     المشكلة: البحث كان بيجمع كل الحقول (ومنها الرقم التسلسلي ورقم
     البطاقة) في نص واحد ويعمل عليه `includes`. فكتابة «7615» كانت
     بترجّع أي سيارة رقمها التسلسلي فيه 7615 (زي 376157020) — وده
     اللي المستخدم شافه: نتائج بأرقام لوحات تانية.

     القاعدة الجديدة:
       • أرقام أقل من 6 خانات = بحث في أرقام اللوحة بس.
       • أرقام 6 خانات أو أكتر = ممكن تكون تسلسلي/بطاقة، فنسمح
         بمطابقة جزئية فيهم كمان.
       • حروف = اللوحة (بالترتيب أو معكوسة) أو أي حقل نصي.
       • الرقم التسلسلي/البطاقة بالكامل بيتطابقوا دايمًا. */
  const SEARCH_TEXT_FIELDS = ['brand','type','model','city','owner','branch','carStatus','inspectionStatus','insuranceCompany'];
  const AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .replace(/[٠-٩]/g, d => AR_DIGITS[d])
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[\u064B-\u0652\u0640]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  function plateSearchParts(plate) {
    const norm = normalizeSearchText(plate).replace(/[^0-9a-z\u0600-\u06ff]+/g, ' ').trim();
    const parts = norm ? norm.split(' ') : [];
    const digits = [], letters = [];
    parts.forEach(part => { (/\d/.test(part) ? digits : letters).push(part); });
    return { compact: parts.join(''), digits, letters };
  }
  function plateMatchesQuery(plate, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    const parts = plateSearchParts(plate);
    if (!parts.compact) return false;
    if (/^\d+$/.test(q)) return parts.digits.some(d => d.indexOf(q) > -1);
    const qCompact = q.replace(/[^0-9a-z\u0600-\u06ff]+/g, '');
    if (!qCompact) return true;
    if (parts.compact.indexOf(qCompact) > -1) return true;
    /* «8842 ر ح ط» = «ر ح ط 8842» */
    return (parts.digits.join('') + parts.letters.join('')).indexOf(qCompact) > -1;
  }
  function onlyDigits(value) { return normalizeSearchText(value).replace(/\D+/g, ''); }
  function carMatchesSearch(car, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    if (plateMatchesQuery(car.plate, q)) return true;
    if (/^\d+$/.test(q)) {
      // أقل من 6 أرقام = لوحات فقط؛ 6+ = تسلسل/بطاقة مسموح به
      if (q.length < 6) return plateMatchesQuery(car.plate, query);
      const serial = onlyDigits(car.serial);
      const card = onlyDigits(car.cardNumber);
      return (!!serial && (serial === q || serial.indexOf(q) > -1)) || (!!card && (card === q || card.indexOf(q) > -1));
    }
    if (!car._searchHayN) {
      car._searchHayN = SEARCH_TEXT_FIELDS.map(f => normalizeSearchText(car[f])).join(' ');
    }
    if (car._searchHayN.indexOf(q) > -1) return true;
    return normalizeSearchText(car.serial) === q || normalizeSearchText(car.cardNumber) === q;
  }

  const api = {
    uid, normalizeDateValue, daysFromNow, expiresWithinMonths, dateStatus, licenseDisplayStatus,
    cardDisplayStatus, inspectionDisplayStatus, textTag, escapeHtml,
    fmtDate, addDays, addYears, defaultLicenseExpiry, LICENSE_YEARS, todayStr,
    carStatusOut, carStatusActive, carStatusMatch, carStatusReady, normStatus,
    brandKey, canonicalBrand, REGION_DEFS, regionOfBranch, CITY_COORDS, cityOfBranch,
    CHURN_DOCS, CHURN_BUCKETS, carChurn, churnStats,
    normalizeSearchText, plateMatchesQuery, carMatchesSearch,
    retryAsync
  };
  global.YahmaUtils = api;
  Object.assign(global, api);
})(typeof window !== 'undefined' ? window : this);

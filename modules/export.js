/**
 * modules/export.js — تصدير Excel/PDF مع Lazy Loading للمكتبات الثقيلة
 */
(function (global) {
  'use strict';

  /* المكتبات محلية أولًا (vendor/) والنسخة الثانية (vendor/fallback/) احتياط.
     السبب: على شبكات بتحجب ملفاتنا، التصدير كان بيفشل بصمت.

     ⚠️ مفيش CDN هنا عن قصد: التبعية على شبكة خارجية كانت بتخلّي
     التصدير يفشل صامت على أي شبكة بتقطع jsdelivr/cdnjs. البديل
     كله local — النسخة الأولى، ولو فشلت النسخة التانية. */
  const CDN = {
    xlsx: 'vendor/xlsx.full.min.js',
    html2canvas: 'vendor/html2canvas.min.js',
    jspdf: 'vendor/jspdf.umd.min.js',
  };
  const CDN_FALLBACK = {
    xlsx: 'vendor/fallback/xlsx.full.min.js',
    html2canvas: 'vendor/fallback/html2canvas.min.js',
    jspdf: 'vendor/fallback/jspdf.umd.min.js',
  };

  const loaded = Object.create(null);

  function loadScript(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (resolve, reject) {
      // already present?
      const existing = Array.prototype.slice.call(document.scripts).find(function (s) {
        return s.src && s.src.indexOf(url.split('/').pop()) >= 0;
      });
      if (existing) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loaded[url]; reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
    return loaded[url];
  }

  /* بنجرب المحلي الأول، ولو فشل (شبكة بتقطع ملفاتنا) نرجع للنسخة المحلية التانية */
  async function loadLib(key) {
    try {
      await loadScript(CDN[key]);
    } catch (e) {
      console.warn('تعذر تحميل ' + key + ' محليًا، بنجرب النسخة الاحتياطية:', e);
      await loadScript(CDN_FALLBACK[key]);
    }
  }

  async function ensureXlsx() {
    if (typeof global.XLSX !== 'undefined') return global.XLSX;
    await loadLib('xlsx');
    if (typeof global.XLSX === 'undefined') throw new Error('مكتبة Excel غير متاحة — تحقق من الاتصال بالإنترنت');
    return global.XLSX;
  }

  async function ensurePdfLibs() {
    const tasks = [];
    if (typeof global.html2canvas !== 'function') tasks.push(loadLib('html2canvas'));
    if (!(global.jspdf || global.jsPDF)) tasks.push(loadLib('jspdf'));
    await Promise.all(tasks);
  }

  function todayStr() {
    try {
      if (typeof global.todayStr === 'function') return global.todayStr();
    } catch(e){yahmaErr(e,'export.js:70');}
    return new Date().toISOString().slice(0, 10);
  }

  /* تنسيق عربي: الورقة RTL + الأعمدة بتتحسب من عرض النص.
     قبل كده كان الملف بيفتح LTR والأعمدة بالترتيب المعكوس على
     عين المستخدم العربي. !views بتخلي Excel يفتح الورقة RTL من اليمين. */
  function autosizeCols(headers, rows) {
    try {
      return headers.map(function (h, i) {
        var max = String(h == null ? '' : h).length;
        var limit = Math.min(rows.length, 400);   // عيّنة كافية وبلا بطء
        for (var r = 0; r < limit; r++) {
          var row = rows[r] || [];
          var v = row[i];
          if (v == null) continue;
          var len = String(v).length;
          if (len > max) max = len;
        }
        return { wch: Math.max(9, Math.min(34, max + 3)) };
      });
    } catch (_) {
      return headers.map(function () { return { wch: 16 }; });
    }
  }

  async function exportRowsToExcel(filename, sheetName, headers, rows) {
    const XLSX = await ensureXlsx();
    const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = autosizeCols(headers, rows);
    /* ⬅ RTL: лист Excel ينفتح من اليمين لليسار زي ما يتوقع العربي */
    ws['!views'] = [{ RTL: true }];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'بيانات');
    XLSX.writeFile(wb, filename || ('export-' + todayStr() + '.xlsx'));
  }

  /* تصدير تقرير كامل في مصنف واحد: ملخص + ورقة مستقلة لكل جدول. */
  async function exportReportWorkbook(filename, report) {
    const XLSX = await ensureXlsx();
    report = report || {};
    const wb = XLSX.utils.book_new();
    const kpis = Array.isArray(report.kpis) ? report.kpis : [];
    const sections = Array.isArray(report.sections) ? report.sections : [];
    const summaryRows = [
      ['يهماء لتأجير السيارات'],
      ['تقرير الأسطول', report.title || 'تقرير'],
      ['الوصف', report.subtitle || ''],
      ['الفرع', report.branch || 'كل الفروع'],
      ['الفترة', report.period || 'حسب التقرير'],
      ['تاريخ الاستخراج', new Date().toLocaleString('ar-SA')],
      [],
      ['المؤشر', 'القيمة', 'ملاحظة']
    ];
    kpis.forEach(function (k) {
      summaryRows.push([k.label || '', k.value == null ? '' : String(k.value), k.hint || '']);
    });
    const summary = XLSX.utils.aoa_to_sheet(summaryRows);
    summary['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 42 }];
    summary['!views'] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, summary, 'ملخص التقرير');

    const used = Object.create(null);
    sections.forEach(function (section, index) {
      const headers = Array.isArray(section.headers) ? section.headers : [];
      const rows = Array.isArray(section.rows) ? section.rows : [];
      const dataRows = rows.map(function (row) { return Array.isArray(row) ? row.slice() : []; });
      if (Array.isArray(section.foot)) dataRows.push(section.foot.slice());
      const title = String(section.title || ('جدول ' + (index + 1)));
      let sheetName = title.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || ('جدول ' + (index + 1));
      const base = sheetName;
      let suffix = 2;
      while (used[sheetName]) {
        const tail = '-' + suffix++;
        sheetName = base.slice(0, 31 - tail.length) + tail;
      }
      used[sheetName] = true;
      const aoa = [
        ['يهماء لتأجير السيارات'],
        [report.title || 'تقرير الأسطول'],
        [title],
        ['الفرع: ' + (report.branch || 'كل الفروع') + ' | تاريخ الاستخراج: ' + new Date().toLocaleString('ar-SA')],
        headers
      ].concat(dataRows);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = autosizeCols(headers, dataRows);
      ws['!views'] = [{ RTL: true }];
      ws['!freeze'] = { xSplit: 0, ySplit: 5 };
      if (headers.length) {
        const lastCol = XLSX.utils.encode_col(headers.length - 1);
        ws['!autofilter'] = { ref: 'A5:' + lastCol + Math.max(5, aoa.length) };
      }
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    wb.Props = { Title: report.title || 'تقرير يهماء', Subject: report.subtitle || 'تقارير الأسطول', Author: 'يهماء لتأجير السيارات', Company: 'يهماء لتأجير السيارات' };
    XLSX.writeFile(wb, filename || ('تقرير-يهماء-' + todayStr() + '.xlsx'));
  }

  async function exportFleetExcel(list, headers) {
    const fleet = list || (Array.isArray(global.fleet) ? global.fleet : []);
    const H = headers || [
      'رقم اللوحة', 'الماركة', 'النوع', 'الموديل', 'الشاسيه', 'رقم الكارت',
      'حالة الكارت', 'انتهاء الكارت', 'حالة الرخصة', 'انتهاء الرخصة', 'حالة الفحص',
      'التأمين', 'المالك', 'الفرع', 'حالة السيارة', 'العداد', 'الصيانة القادمة', 'ملاحظات'
    ];
    const rows = fleet.map(function (c) {
      return [
        c.plate, c.brand, c.type, c.model, c.serial, c.cardNumber,
        c.cardStatus, c.cardExpiry, c.licenseStatus, c.licenseExpiry, c.inspectionStatus,
        c.insuranceStatus, c.owner, c.branch, c.carStatus, c.odometer, c.nextService, c.notes
      ];
    });
    await exportRowsToExcel('بيانات-الأسطول-' + todayStr() + '.xlsx', 'الأسطول', H, rows);
  }

  async function ensurePdfReady() {
    await ensurePdfLibs();
  }

  async function exportReportPdf(restoreTab) {
    const button = document.getElementById('report-pdf');
    const wrap = document.getElementById('report-printable');
    if (!wrap) {
      alert('تعذر العثور على محتوى التقرير. يرجى التأكد من أن الصفحة محملة بشكل صحيح.');
      return;
    }
    if (typeof global.html2canvas === 'undefined' || !global.jspdf) {
      alert('تعذر تحميل مكتبة PDF. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.');
      return;
    }
    const panels = Array.from(wrap.querySelectorAll('.rtab-panel'));
    const previousDisplay = panels.map(panel => panel.style.display);
    const activeButton = document.querySelector('.report-tab.active');
    const previousTab = activeButton ? activeButton.dataset.rtab : 'overview';
    const originalLabel = button ? button.innerHTML : '';
    if (button) { button.disabled = true; button.textContent = 'جارِ تجهيز الملف...'; }
    try {
      panels.forEach(panel => { panel.style.display = 'block'; });
      await new Promise(resolve => setTimeout(resolve, 60));
      const canvas = await global.html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const image = canvas.toDataURL('image/png');
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10, pageWidth = 210, pageHeight = 297;
      const usableWidth = pageWidth - margin * 2, usableHeight = pageHeight - margin * 2;
      const imageHeight = canvas.height * usableWidth / canvas.width;
      let position = margin, remaining = imageHeight;
      pdf.addImage(image, 'PNG', margin, position, usableWidth, imageHeight);
      remaining -= usableHeight;
      while (remaining > 0) {
        pdf.addPage();
        position = -(imageHeight - remaining) + margin;
        pdf.addImage(image, 'PNG', margin, position, usableWidth, imageHeight);
        remaining -= usableHeight;
      }
      pdf.save('تقرير-الأسطول-الشامل-' + todayStr() + '.pdf');
    } catch (error) {
      console.error('تعذر إنشاء PDF', error);
      alert('حدث خطأ أثناء إنشاء ملف PDF. حاول مرة أخرى.');
    } finally {
      panels.forEach((panel, index) => { panel.style.display = previousDisplay[index]; });
      if (restoreTab) restoreTab(previousTab);
      if (button) { button.disabled = false; button.innerHTML = originalLabel; }
    }
  }

  async function createFormalReportPdf(elementId, filename) {
    const sheet = document.getElementById(elementId);
    if (!sheet || !sheet.innerHTML) throw new Error('لا يوجد محتوى للتقرير');
    /* نفس محرّك التقارير: html2canvas scale 1.5 → JPEG 0.85 → jsPDF A4 */
    const img = await captureNodeJpeg(sheet);
    return { pdf: pdfFromImages([img]), name: filename };
  }

  async function capturePngBlob(elementId, options) {
    const element = document.getElementById(elementId);
    if (!element || !element.innerHTML) throw new Error('لا يوجد محتوى للإنفوجرافيك');
    const canvas = await global.html2canvas(element, Object.assign({ scale: 2, backgroundColor: '#ffffff', useCORS: true }, options || {}));
    if (!canvas || !canvas.width) throw new Error('تعذر رسم الإنفوجرافيك');
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  }

  /* ===== نظام PDF موحّد — نفس محرّك التقارير: html2canvas → JPEG 0.85 (scale 1.5) → jsPDF A4 → تنزيل مباشر ===== */
  const PDF_PAGE_MARGIN = 8;      /* نفس هوامش التقارير (مم) */
  const PDF_HOST_W = 1000;        /* عرض الجدول المنطقي بكسل = العرض المستخدم في A4 */
  const PDF_SINGLE_MAX_H = 21000; /* أقصى ارتفاع canvas آمن قبل scale 1.5 */

  function escCell(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** بناء مضيف الجدول بنفس شكل تقرير التقارير (RTL + رأس أزرق + تناوب صفوف) */
  /* خط الـPDF: Cairo أول واحد — لأنه نفس خط الواجهة، واللي
     اتحمّل local من css/fonts.css فبيكون موجود على أي جهاز
     من غير ما نسلّم على حد.
     Tahoma/Segoe/Arial كانت بتتفرض على الـPDF، وعلى الأجهزة
     اللي مش عليها (أندرويد مثلًا) المتصفح بيرجع لخط مش مناسب
     فالعربي بيطلع حروفه مقطّعة. جبنّاها system generics في
     الآخر احتياطًا.
     IBM Plex اتشال: مكانها في السلسلة بعد Cairo اللي بيغطي
     عربي ولاتيني، فهي مكانها ميظهرش. و411KB تنقذ ببلاش. */
  const PDF_FONT = "'Cairo','Noto Sans Arabic',Tahoma,'Segoe UI',Arial,sans-serif";

  /* ===== @font-face المحلي =====
     نافذة الطباعة (openPrintWindow) بتتفتح بـwindow.open وتكتب
     HTML لوحدها — يعني مش داخل صفحة التطبيق، فمش بيشوف
     css/fonts.css. قبل كنا كانت بتحط @import لـGoogle، وده
     بالظبط الاعتماد على طرف تالت وقت التشغيل اللي اتصلّينا منه.

     بتولّد نفس تعريفات الخط بس بـURL مطلق عشان يشتغل من أي
     نافذة، ومن نفس النطاق. */
  const LOCAL_FONT_FILES = [
    { file: 'cairo-060006.woff2', range: 'U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC' },
    { file: 'cairo-010002.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
    { file: 'cairo-000000.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }
  ];
  const FONT_WEIGHTS = [400, 500, 600, 700, 800];
  function fontFaceCSS() {
    let base = '';
    try { base = new URL('fonts/', location.href).href; }
    catch (_) { base = 'fonts/'; }
    let out = '';
    FONT_WEIGHTS.forEach(function (w) {
      LOCAL_FONT_FILES.forEach(function (f) {
        out += "@font-face{font-family:'Cairo';font-style:normal;font-weight:" + w +
               ";font-display:swap;src:url('" + base + f.file + "') format('woff2')" +
               ";unicode-range:" + f.range + ";}\n";
      });
    });
    return out;
  }
  global.YahmaFonts = { faceCSS: fontFaceCSS, PDF_FONT: PDF_FONT };

  async function ensureFontsReady() {
    try { if (global.document && global.document.fonts && typeof global.document.fonts.ready !== 'undefined') await global.document.fonts.ready; } catch(_){yahmaErr(_,'export.js:206');}
  }

  function buildTablePdfHost(o) {
    const headers = o.headers || [];
    const rows = o.rows || [];
    const head = headers.map(function (h) { return '<th>' + escCell(h) + '</th>'; }).join('');
    const body = rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + escCell(c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    const host = document.createElement('div');
    host.setAttribute('data-pdf-host', '1');
    /* ظاهر جزئيًا (opacity منخفضة) — off-screen يسبب PDF فاضي في بعض المتصفحات */
    host.style.cssText = 'position:fixed;left:0;top:0;width:' + PDF_HOST_W + 'px;background:#fff;z-index:2147483646;opacity:0.02;pointer-events:none;overflow:visible;';
    host.innerHTML =
      '<div class="pdf-root" style="box-sizing:border-box;width:' + PDF_HOST_W + 'px;padding:24px;background:#fff;color:#1A2433;font-family:' + PDF_FONT + ';direction:rtl;text-align:right;">' +
      '<style>' +
      '.pdf-root *{font-family:' + PDF_FONT + ' !important}' +
      '.pdf-root table{width:100%;border-collapse:collapse}' +
      '.pdf-root th{background:#1F3C88;color:#fff;padding:8px 6px;text-align:right;font-size:11px;font-weight:700;border:1px solid #1F3C88}' +
      '.pdf-root td{padding:7px 6px;border-bottom:1px solid #E6EAF0;text-align:right;font-size:11px;vertical-align:top}' +
      '.pdf-root tbody tr:nth-child(even) td{background:#F7F8FA}' +
      '</style>' +
      '<div class="pdf-head">' +
        '<h1 style="font-size:20px;margin:0 0 4px;color:#1F3C88">' + escCell(o.title || 'تقرير يهماء') + '</h1>' +
        '<div style="color:#5A6A7E;font-size:12px;margin-bottom:12px">' + escCell(o.subtitle || '') + '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#5A6A7E;margin-bottom:14px">' +
          '<span>تاريخ التصدير: ' + escCell(new Date().toLocaleString('ar-EG')) + '</span>' +
          '<span>عدد السجلات: ' + rows.length + '</span>' +
        '</div>' +
      '</div>' +
      '<table><thead><tr>' + head + '</tr></thead><tbody>' +
        (body || '<tr><td colspan="' + Math.max(1, headers.length) + '">لا توجد بيانات</td></tr>') +
      '</tbody></table>' +
      (o.note ? '<div style="margin-top:14px;font-size:11px;color:#5A6A7E">' + escCell(o.note) + '</div>' : '') +
      '<div class="pdf-foot" style="margin-top:18px;padding-top:10px;border-top:1px solid #E6EAF0;font-size:10px;color:#8A97A8;text-align:center">يهماء — نظام إدارة تأجير السيارات</div>' +
      '</div>';
    document.body.appendChild(host);
    return host;
  }

  /* ============================================================
     التقاطaccurate: المتصفح بيرسم بنفسه عبر SVG <foreignObject>
     ------------------------------------------------------------
     html2canvas بيعيد تنفيذ تخطيط النص بنفسه، وبيقسّم النص حرف حرف
     لما encounters نص مش بسيط — فالعربي بيطلع حروفه مقطّعة وكلماته
     مرتّبة غلط. ده كان بيحصل في كل ملفات PDF.
     الحل ده بيخلّي المتصفح يرسم الصفحة زي ما بيعرضها بالظبط،
     فالتشكيل والـRTL بيطلعوا صحيحين 100%.
     ============================================================ */
  function captureViaSvg(node, scale, quality) {
    var sc = scale || 1.5;
    var q = quality == null ? 0.85 : quality;
    var w = Math.max(node.scrollWidth || 0, node.offsetWidth || 0, 200);
    var h = Math.max(node.scrollHeight || 0, node.offsetHeight || 0, 100);

    var clone = node.cloneNode(true);
    clone.style.margin = '0';
    clone.style.position = 'static';
    clone.style.width = w + 'px';
    clone.style.height = 'auto';
    clone.style.boxShadow = 'none';

    /* بننسخ الـstyle الخاص بـ.pdf-root جوه الـSVG بس — مش CSS التطبيق
       كله، عشان ما تبقاش قواعد الموبايل أو أي حاجة تانية Legislative
       على الـPDF. الـroot عنده تنسيقه الكامل بالفعل. */
    var own = [];
    var st = node.querySelectorAll ? node.querySelectorAll('style') : [];
    for (var i = 0; i < st.length; i++) own.push(st[i].textContent || '');

    var html =
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + w + 'px;background:#fff;">' +
      '<style type="text/css"><![CDATA[' + own.join('\n') + ']]></style>' +
      clone.outerHTML +
      '</div>';

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w * sc) + '" height="' + Math.round(h * sc) + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' + html + '</foreignObject>' +
      '</svg>';

    return new Promise(function (resolve, reject) {
      var img = new global.Image();
      img.onload = function () {
        try {
          var canvas = global.document.createElement('canvas');
          canvas.width = Math.round(w * sc);
          canvas.height = Math.round(h * sc);
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var data = canvas.toDataURL('image/jpeg', q);
          var res = { data: data, w: canvas.width, h: canvas.height };
          canvas.width = 0; canvas.height = 0;
          resolve(res);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('تعذر رسم التقرير عبر SVG')); };
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.src = url;
    });
  }

  /** التقاط عقدة → JPEG. بنستخدم SVG أولاً، و html2canvas احتياطاً. */
  async function captureNodeJpeg(node, scale, quality) {
    /* لازم الخط يكون خلص تحميل قبل الرسم، وإلا الـclone بيترسم بخط
       بديل وبعدها العربي بيطلع مكسور. */
    await ensureFontsReady();
    try {
      return await captureViaSvg(node, scale, quality);
    } catch (svgErr) {
      console.warn('تعذر الرسم عبر SVG، بنستخدم html2canvas:', svgErr);
    }
    await ensurePdfLibs();
    const h2c = global.html2canvas;
    if (typeof h2c !== 'function') throw new Error('تعذر رسم التقرير — تحقق من الاتصال بالإنترنت');
    const sc = scale || 1.5;
    const q = quality == null ? 0.85 : quality;
    const w = Math.max(node.scrollWidth || 0, node.offsetWidth || 0, 200);
    const h = Math.max(node.scrollHeight || 0, node.offsetHeight || 0, 100);
    const canvas = await h2c(node, {
      scale: sc, backgroundColor: '#ffffff', useCORS: true, allowTaint: true, logging: false,
      width: w, height: h, windowWidth: w, windowHeight: h
    });
    if (!canvas || canvas.width < 20 || canvas.height < 20) throw new Error('تعذر رسم التقرير (Canvas فارغ)');
    const out = { data: canvas.toDataURL('image/jpeg', q), w: canvas.width, h: canvas.height };
    canvas.width = 0; canvas.height = 0;
    return out;
  }

  /** صور → PDF بمقاس A4 (كل صورة تتدفق عبر الصفحات — نفس منطق التقارير) */
  function pdfFromImages(images) {
    const ns = global.jspdf || global.jsPDF;
    const JsPDF = ns && (ns.jsPDF || ns);
    if (!JsPDF) throw new Error('jsPDF غير متاحة — تحقق من الاتصال بالإنترنت');
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const usableW = pageW - PDF_PAGE_MARGIN * 2;
    const usableH = pageH - PDF_PAGE_MARGIN * 2;
    images.forEach(function (im, i) {
      if (i > 0) pdf.addPage();
      const imgH = im.h * usableW / im.w;
      let hLeft = imgH, guard = 0;
      pdf.addImage(im.data, 'JPEG', PDF_PAGE_MARGIN, PDF_PAGE_MARGIN, usableW, imgH);
      hLeft -= usableH;
      while (hLeft > 0 && guard++ < 400) {
        pdf.addPage();
        pdf.addImage(im.data, 'JPEG', PDF_PAGE_MARGIN, PDF_PAGE_MARGIN - (imgH - hLeft), usableW, imgH);
        hLeft -= usableH;
      }
    });
    return pdf;
  }

  /**
   * تصدير جدول إلى PDF بنفس نظام التقارير (تنزيل مباشر — بلا نافذة طباعة).
   * o = { title, subtitle, headers, rows, filename, note, buttonId }
   */
  async function exportTablePdf(o) {
    o = o || {};
    const rows = o.rows || [];
    if (!rows.length) { alert('لا توجد نتائج مطابقة للفلاتر.'); return false; }
    const btn = o.buttonId ? document.getElementById(o.buttonId) : null;
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'جارِ تجهيز PDF...'; }
    let host = null;
    try {
      await ensurePdfLibs();
      host = buildTablePdfHost(o);
      const root = host.querySelector('.pdf-root');
      const head = host.querySelector('.pdf-head');
      const foot = host.querySelector('.pdf-foot');
      const trs = Array.prototype.slice.call(host.querySelectorAll('tbody tr'));
      await new Promise(function (r) { setTimeout(r, 200); });
      /* المحتوى القصير: نفس إعدادات التقارير تمامًا — الطويل: دقة أقل حتى يبقى حجم الملف معقولًا */
      const totalH = root.scrollHeight;
      const scale = totalH <= PDF_SINGLE_MAX_H ? 1.5 : 1.0;
      const quality = totalH <= PDF_SINGLE_MAX_H ? 0.85 : 0.7;
      const segBudget = Math.floor(31500 / scale); /* أقصى ارتفاع canvas آمن قبل scale */
      let images;
      if (totalH <= segBudget) {
        images = [await captureNodeJpeg(root, scale, quality)];
      } else {
        /* محتوى طويل جدًا: نقسمه شرائح بعد قياس ارتفاع الصفوف فعليًا */
        images = [];
        const headH = head ? head.offsetHeight : 0;
        const footH = foot ? foot.offsetHeight + 18 : 0;
        const pad = 48;
        let curA = 0, curB = trs.length;
        const showRange = function (a, b) {
          if (a < curA) for (let i = a; i < curA && i < trs.length; i++) trs[i].style.display = '';
          if (b > curB) for (let i = curB; i < b && i < trs.length; i++) trs[i].style.display = '';
          if (a > curA) for (let i = curA; i < a && i < trs.length; i++) trs[i].style.display = 'none';
          if (b < curB) for (let i = b; i < curB && i < trs.length; i++) trs[i].style.display = 'none';
          curA = a; curB = b;
        };
        let start = 0, pageNo = 0;
        while (start < trs.length) {
          if (head) head.style.display = pageNo === 0 ? '' : 'none';
          if (foot) foot.style.display = pageNo === 0 ? '' : 'none';
          const reserve = pad + (pageNo === 0 ? headH + footH : 0);
          let end = start, step = 32;
          while (step >= 1 && end < trs.length) {
            const cand = Math.min(end + step, trs.length);
            showRange(start, cand);
            if (root.scrollHeight <= segBudget - reserve) { end = cand; step *= 2; }
            else step = Math.floor(step / 2);
          }
          if (end === start) end = Math.min(start + 1, trs.length);
          showRange(start, end);
          await new Promise(function (r) { setTimeout(r, 40); });
          images.push(await captureNodeJpeg(root, scale, quality));
          if (btn) btn.textContent = 'جارِ تجهيز PDF... (جزء ' + images.length + ')';
          start = end; pageNo++;
        }
        showRange(0, trs.length);
      }
      const pdf = pdfFromImages(images);
      pdf.save(o.filename || ('yahma-report-' + Date.now() + '.pdf'));
      return true;
    } catch (e) {
      console.error('تعذر إنشاء PDF', e);
      alert('حدث خطأ أثناء إنشاء ملف PDF: ' + (e && e.message ? e.message : e));
      return false;
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  }

  /** Public API */
  const YahmaExport = {
    loadScript: loadScript,
    ensureXlsx: ensureXlsx,
    ensurePdfLibs: ensurePdfLibs,
    ensurePdfReady: ensurePdfReady,
    exportReportPdf: exportReportPdf,
    createFormalReportPdf: createFormalReportPdf,
    capturePngBlob: capturePngBlob,
    exportTablePdf: exportTablePdf,
    exportRowsToExcel: exportRowsToExcel,
    exportReportWorkbook: exportReportWorkbook,
    exportFleetExcel: exportFleetExcel,
    /** يُستدعى من الأزرار — يحمّل المكتبة عند الحاجة فقط */
    async excel(list) {
      try {
        await exportFleetExcel(list);
      } catch (e) {
        console.error(e);
        alert('تعذر التصدير إلى Excel: ' + (e && e.message ? e.message : e));
      }
    },
    async pdfPrepare() {
      try {
        await ensurePdfLibs();
      } catch (e) {
        console.error(e);
        alert('تعذر تحميل مكتبات PDF');
      }
    },
  };

  // Patch legacy XLSX.writeFile callers to auto-load if missing
  const origDefine = Object.getOwnPropertyDescriptor(global, 'XLSX');
  global.YahmaExportLazy = YahmaExport;

  /* ===== تصدير موحّد لكل التبويبات =====
     مصدر البيانات واحد: مزوّد التبويب (_yahmaCurrentPdfData) ولّا —
     لو مش معرّف — الجدول المعروض على الشاشة.
     مهم إن المصدر يبقى واحد، عشان الزرار مايتفعّلش وأنت ضغطته يطلع
     رسالة «غير مدعوم». */
  function cleanCell(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim() || '—';
  }

  function dataFromRenderedTable() {
    try {
      var root = global.document.getElementById('content');
      if (!root) return null;
      var table = root.querySelector('table');
      if (!table) return null;
      var ths = Array.prototype.slice.call(table.querySelectorAll('thead th'));
      if (!ths.length) return null;
      /* نقرأ النص الخام الأول عشان نعرف العمود فاضي فعلاً ولا لأ،
     لأن cleanCell بترجّع '—' بدل النص الفاضي. */
      var rawHeaders = ths.map(function (th) {
        return String(th.textContent == null ? '' : th.textContent).replace(/\s+/g, ' ').trim();
      });
      var headers = rawHeaders.map(function (h) { return h || '—'; });
      var trs = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
      var rows = [];
      trs.forEach(function (tr) {
        var tds = Array.prototype.slice.call(tr.children);
        if (tds.length < 2) return;
        var txt = cleanCell(tr.textContent);
        if (txt.indexOf('لا توجد') === 0 || txt.indexOf('لا يوجد') === 0) return;
        var cells = tds.map(function (td) { return cleanCell(td.textContent); });
        if (cells.length) rows.push(cells);
      });
      /* أعمدة بلا عنوان = checkbox تحديد أو عمود إجراءات.
         هنقصها من الرأس ومن الصفوف مع بعض عشان مايبقاش في زوايا فاضية
         في الملف ولا نص ملزوق زي «دورة التجهيزTimeline». */
      var firstEmpty = rawHeaders.indexOf('');
      var cutAt = firstEmpty >= 0 ? firstEmpty : headers.length;
      headers = headers.slice(0, cutAt);
      rows = rows.map(function (cells) { return cells.slice(0, cutAt); });
      var titleNode = global.document.getElementById('topbar-title');
      return {
        title: cleanCell(titleNode && titleNode.textContent) || 'تقرير',
        subtitle: rows.length ? ('عدد السجلات: ' + rows.length) : '',
        headers: headers,
        rows: rows
      };
    } catch (e) { return null; }
  }

  function currentTabData() {
    try {
      if (typeof global._yahmaCurrentPdfData === 'function') {
        const d = global._yahmaCurrentPdfData();
        if (d && Array.isArray(d.headers) && Array.isArray(d.rows)) return d;
      }
    } catch (e) { console.warn('currentTabData', e); }
    return dataFromRenderedTable();
  }

  function slug(s) {
    const cleaned = String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '').trim();
    return (cleaned || 'تقرير').slice(0, 48);
  }

  async function exportTabExcel() {
    const d = currentTabData();
    if (!d) { alert('هذا التبويب لا يدعم التصدير بعد.'); return false; }
    if (!d.rows.length) { alert('لا توجد نتائج مطابقة للفلاتر لتصديرها.'); return false; }
    try {
      await exportRowsToExcel(slug(d.title) + '-' + todayStr() + '.xlsx', slug(d.title), d.headers, d.rows);
      return true;
    } catch (e) {
      console.error(e);
      alert('تعذر تصدير Excel: ' + ((e && e.message) || e));
      return false;
    }
  }

  async function exportTabPdf(o) {
    const d = currentTabData();
    if (!d) { alert('هذا التبويب لا يدعم التصدير بعد.'); return false; }
    if (!d.rows.length) { alert('لا توجد نتائج مطابقة للفلاتر لتصديرها.'); return false; }
    const opt = o || {};
    return await exportTablePdf({
      title: d.title,
      subtitle: d.subtitle || ('عدد السجلات: ' + d.rows.length),
      headers: d.headers,
      rows: d.rows,
      filename: slug(d.title) + '-' + todayStr() + '.pdf',
      buttonId: opt.buttonId
    });
  }

  YahmaExport.exportTabExcel = exportTabExcel;
  YahmaExport.exportTabPdf = exportTabPdf;
  YahmaExport.currentTabData = currentTabData;
  /* pdf-share.js بيستخدم نفس التقاط الـSVG عشان العربي يطلع متّصل
     في كل ملفات PDF، مش في تصدير الجداول بس. */
  global.YahmaCaptureViaSvg = async function (node, scale, quality) {
    await ensureFontsReady();
    const r = await captureViaSvg(node, scale, quality);
    const img = new global.Image();
    await new Promise(function (res, rej) {
      img.onload = res;
      img.onerror = function () { rej(new Error('تعذر تحميل الصورة')); };
      img.src = r.data;
    });
    const c = global.document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  };

  /* Prefetch the export libraries as soon as an export control is pressed.
     yx-excel / yx-pdf are the unified bar. The rest are the buttons that
     still exist (topbar dropdown, the reports/insurance modals). */
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('#yx-excel, #btn-export, #btn-export-all-fleet, #prep-export-tasks, #ef-go');
    if (!t) return;
    ensureXlsx().catch(function(e){yahmaErr(e,'export.js:593');});
  }, true);

  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('#yx-pdf, #btn-export-pdf, #prep-export-tasks, #fr-pdf, #inf-png');
    if (!t) return;
    ensurePdfLibs().catch(function(e){yahmaErr(e,'export.js:599');});
  }, true);

  global.YahmaExport = Object.assign(global.YahmaExport || {}, YahmaExport);

  // حمّل المكتبات في الخلفية بعد اكتمال الصفحة عشان تكون جاهزة قبل أول ضغطة تصدير
  window.addEventListener('load', function () {
    setTimeout(function () { ensureXlsx().catch(function(e){yahmaErr(e,'export.js:606');}); ensurePdfLibs().catch(function(e){yahmaErr(e,'export.js:606');}); }, 1500);
  });
})(typeof window !== 'undefined' ? window : this);

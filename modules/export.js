/**
 * modules/export.js — تصدير Excel/PDF مع Lazy Loading للمكتبات الثقيلة
 */
(function (global) {
  'use strict';

  const CDN = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
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

  async function ensureXlsx() {
    if (typeof global.XLSX !== 'undefined') return global.XLSX;
    await loadScript(CDN.xlsx);
    if (typeof global.XLSX === 'undefined') throw new Error('XLSX غير متاحة');
    return global.XLSX;
  }

  async function ensurePdfLibs() {
    const tasks = [];
    if (typeof global.html2canvas !== 'function') tasks.push(loadScript(CDN.html2canvas));
    if (!(global.jspdf || global.jsPDF)) tasks.push(loadScript(CDN.jspdf));
    await Promise.all(tasks);
  }

  function todayStr() {
    try {
      if (typeof global.todayStr === 'function') return global.todayStr();
    } catch (e) {}
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
    if (!wrap || typeof global.html2canvas === 'undefined' || !global.jspdf) {
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
      '<div class="pdf-root" style="box-sizing:border-box;width:' + PDF_HOST_W + 'px;padding:24px;background:#fff;color:#1A2433;font-family:Tahoma,\'Segoe UI\',Arial,sans-serif;direction:rtl;text-align:right;">' +
      '<style>' +
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

  /** التقاط عقدة → JPEG بنفس إعدادات التقارير (scale 1.5 + جودة 0.85) */
  async function captureNodeJpeg(node, scale, quality) {
    await ensurePdfLibs();
    const h2c = global.html2canvas;
    if (typeof h2c !== 'function') throw new Error('html2canvas غير متاحة — تحقق من الاتصال بالإنترنت');
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
     كل تبويب بيعرّف window._yahmaCurrentPdfData() → {title, subtitle, headers, rows}.
     الدالة دي بتاخد البيانات دي وتعمل Excel أو PDF بنفس الشكل العربي.
     فلازم أي تبويب جديد يعرّف الدالة دي علشان التصدير يشتغل فيه. */
  function currentTabData() {
    try {
      if (typeof global._yahmaCurrentPdfData === 'function') {
        const d = global._yahmaCurrentPdfData();
        if (d && Array.isArray(d.headers) && Array.isArray(d.rows)) return d;
      }
    } catch (e) { console.warn('currentTabData', e); }
    return null;
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

  // Intercept common export button clicks early
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('#btn-export, #btn-export-all-fleet, #fleet-export-filtered, #ren-export-xlsx, #fu-export-xlsx, #prep-export-xlsx, #ef-go');
    if (!t) return;
    // Ensure XLSX is loading in parallel before other handlers run
    ensureXlsx().catch(function () {});
  }, true);

  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('#btn-export-pdf, #fleet-export-pdf, #ren-export-pdf, #fu-export-pdf, #prep-export-pdf, #fr-pdf, #inf-png');
    if (!t) return;
    ensurePdfLibs().catch(function () {});
  }, true);

  global.YahmaExport = Object.assign(global.YahmaExport || {}, YahmaExport);

  // حمّل المكتبات في الخلفية بعد اكتمال الصفحة عشان تكون جاهزة قبل أول ضغطة تصدير
  window.addEventListener('load', function () {
    setTimeout(function () { ensureXlsx().catch(function () {}); ensurePdfLibs().catch(function () {}); }, 1500);
  });
})(typeof window !== 'undefined' ? window : this);

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

  async function exportRowsToExcel(filename, sheetName, headers, rows) {
    const XLSX = await ensureXlsx();
    const ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = headers.map(function () { return { wch: 16 }; });
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
    const canvas = await global.html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    if (!canvas || !canvas.width) throw new Error('تعذر رسم التقرير (Canvas فارغ)');
    const { jsPDF } = global.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = 210, pageHeight = 297;
    const pageHeightPx = canvas.width * (pageHeight / pageWidth);
    const pages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));
    for (let page = 0; page < pages; page++) {
      const sourceY = page * pageHeightPx;
      const sourceHeight = Math.min(pageHeightPx, canvas.height - sourceY);
      if (sourceHeight <= 0) break;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.ceil(sourceHeight);
      const context = slice.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidth, sourceHeight * pageWidth / canvas.width, undefined, 'FAST');
    }
    return { pdf, name: filename };
  }

  async function capturePngBlob(elementId, options) {
    const element = document.getElementById(elementId);
    if (!element || !element.innerHTML) throw new Error('لا يوجد محتوى للإنفوجرافيك');
    const canvas = await global.html2canvas(element, Object.assign({ scale: 2, backgroundColor: '#ffffff', useCORS: true }, options || {}));
    if (!canvas || !canvas.width) throw new Error('تعذر رسم الإنفوجرافيك');
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
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

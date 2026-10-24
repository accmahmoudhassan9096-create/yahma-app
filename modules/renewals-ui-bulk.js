/* ===== modules/renewals-ui-bulk.js — الإجراءات الجماعية في تبويب الفحص =====
 *
 * الحذف الجماعي، وتغيير حالات الفحص/الرخصة/التأمين، ونقل السيارات
 * المختارة لتبويب آخر.
 *
 * ⭐ كل دالة هنا بتاخد ctx = { selectedRenIds } — الإجمالي الوحيد
 * اللي كان محتاجه من نطاق renderRenewals. الباقي كلها globals.
 *
 * Extracted from modules/renewals-ui.js — same code, same behaviour.
 */
(function (global) {
  'use strict';
  async function deleteRenCars(ctx, ids){
    const cars=ids.map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
    if(!cars.length) return;
    if(!confirm('حذف '+cars.length+' سيارة نهائيًا من الأسطول؟\n'+cars.slice(0,8).map(c=>c.plate).join('، ')+(cars.length>8?'…':''))) return;
    cars.forEach(c=>ctx.selectedRenIds.delete(String(c.id)));
    await removeSoldVehiclesByPlates(cars.map(c=>c.plate),{skipConfirm:true,silent:true});
    render();
  }
  /* ===== تعديل جماعي: فحص / رخصة / تأمين (إداريون فقط — الزر يظهر ضمن شريط التحديد) ===== */
  function renSelectedCars(ctx){
    return [...ctx.selectedRenIds].map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
  }
  function renPlates(ctx, cars){ return cars.slice(0,8).map(c=>c.plate||'—').join('، ')+(cars.length>8?'…':''); }
  async function renBulkApply(ctx, cars, mutate, doneMsg, logLabel){
    if(!cars.length) return;
    cars.forEach(mutate);
    const ids=cars.map(c=>c.id);
    let ok=true;
    try{ ok=await saveData(ids); }catch(_){ ok=false; }
    cars.forEach(c=>ctx.selectedRenIds.delete(String(c.id)));
    if(ok===false) alert('تعذر الحفظ على بعض السيارات — تحقق من الاتصال ثم أعد المحاولة.');
    else alert(doneMsg);
    if(logLabel && typeof window.log==='function'){
      try{ window.log(logLabel, cars.length+' سيارة: '+renPlates(ctx, cars)); }catch(_){yahmaErr(_,'renewals-ui.js:255');}
    }
    render();
  }
  /* قاعدة الفحص من الرخصة: منتهية ⇐ لم يفحص · سارية ⇐ تم الفحص (نفس قاعدة الاستيراد) */
  function inspectionFromLicense(ctx, car){
    const raw = String(car.licenseExpiry || '').trim();
    if(!raw) return null;
    const d = new Date(raw.slice(0,10) + 'T00:00:00');
    if(isNaN(d)) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    return d.getTime() < today.getTime() ? 'لم يفحص' : 'تم الفحص';
  }
  /* نقل السيارات المحددة لأي مرحلة في الدورة — «إداري» و«مدير النظام».
     بيتنادى من شريط «الفحص» (3 أزرار) ومن التلات تبويبات التانية
     (شريط الدفع). المنطق نفسه في payMoveOne — مسار واحد للحقيقة. */
  async function adminMoveSelectedCars(ctx, targetTab){
    if(typeof currentRole!=="undefined" && currentRole!=="admin" && currentRole!=="manager"){
      alert("هذا الإجراء متاح لمدير النظام والإداري فقط."); return;
    }
    const cars=[...ctx.selectedRenIds].map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
    if(!cars.length){ alert("يرجى تحديد سيارة واحدة على الأقل."); return; }
    const tabNames = { renewals: "الفحص", payments: "تحت الدفع", paid: "تم الدفع", renewed: "تم التجديد" };
    const targetName = tabNames[targetTab] || targetTab;
    if (typeof window.payMoveOne !== "function") { alert("تعذّر تحميل منطق النقل — أعد تحميل الصفحة."); return; }
    const ORDER = ["renewals","payments","paid","renewed"];
    const fromStage = (typeof window.payStageOf === "function")
      ? cars.map(c=>window.payStageOf(c.id)).reduce((a,b)=>ORDER.indexOf(b)<ORDER.indexOf(a)?b:a, "renewed")
      : "renewals";
    const warn = typeof window.payMoveWarning === "function"
      ? window.payMoveWarning(fromStage, targetTab)
      : "";
    if(!confirm("نقل " + cars.length + " سيارة إلى «" + targetName + "»؟\n"
      + cars.slice(0, 8).map(c=>c.plate||'—').join("، ") + (cars.length>8?'…':'') + warn + "\n\nمتابعة؟")) return;

    let moved=0, skipped=0; const failed=[];
    for (const car of cars) {
      try {
        const res = await window.payMoveOne(car, targetTab);
        if (res === "done") moved++;
        else if (res === "failed") failed.push(car.plate || car.id);
        else skipped++;
      } catch (err) {
        if (typeof yahmaErr === "function") yahmaErr(err, "renewals-ui-bulk.js:adminMoveSelectedCars");
        failed.push(car.plate || car.id);
      }
    }

    ctx.selectedRenIds.clear();
    const parts = [];
    if (moved) parts.push(moved + " اتنقلت");
    if (skipped) parts.push(skipped + " اتخطّت (كانت في نفس المرحلة)");
    if (failed.length) parts.push(failed.length + " فشلت: " + failed.slice(0,6).join("، ") + (failed.length>6?" (+"+(failed.length-6)+")":""));
    alert("من " + cars.length + " محددة: " + (parts.join(" · ") || "مفيش حاجة اتغيّرت."));
    if(typeof log==="function"){ try{ log("نقل بين مراحل الدورة", moved + " سيارة إلى " + targetName); }catch(_){} }
    if(typeof render==="function") render();
  }

  async function bulkInspectionFromLicenses(ctx){
    const cars = renSelectedCars(ctx);
    if(!cars.length) return;
    const withDate = cars.filter(c => !!inspectionFromLicense(ctx, c));
    if(!withDate.length){ alert('لا توجد سيارة بتاريخ رخصة صالح لتطبيق القاعدة.'); return; }
    const expired = withDate.filter(c => inspectionFromLicense(ctx, c) === 'لم يفحص').length;
    if(!confirm('ضبط حالة الفحص من تاريخ الرخصة لـ '+withDate.length+' سيارة؟\n• منتهية ⇐ لم يفحص: '+expired+'\n• سارية ⇐ تم الفحص: '+(withDate.length-expired)+'\n• بدون تاريخ رخصة: تُترك كما هي ('+(cars.length-withDate.length)+')')) return;
    await renBulkApply(ctx, withDate, c=>{ c.inspectionStatus = inspectionFromLicense(ctx, c); },
      'تم تحديث فحص '+withDate.length+' سيارة من الرخص', 'فحص من الرخص');
  }
  /* ===== الانتقال للمرحلة التالية: الفحص ← تحت الدفع =====

     ⚠️ سبب وجود الدالة دي: «تم الفحص» الجماعي كان بيحط حالة الفحص
     وخلاص، فما كانش بينقل ولا سيارة لِتبويب «تحت الدفع». النتيجة إن
     1055 سيارة بتتفحص تدخل الحالة الصح وتتصل في الفحص تاني للأبد،
     والدورة تقف عند أول خطوة. زر السيارة الواحدة («تجديد فحص») كان
     بينقل صح من أول يوم — فالمسارين كانا متفظلفين.

    خطوة واحدة دلوقتي: الجماعي = المفرد + تكرار.

     الطلب بيتسجّل بـ YahmaPayments.requestPayment — نفس دالة الزر
     المفرد بالظبط، فالنتيجة في السحابة وفي التبويب متطابقة. */

  /* السيارات اللي هي أصلاً في «تحت الدفع» — بنتجاهلها.
     مهم: requestPayment بيعمل insert جديد في جدول
     inspection_payments كل مرة، فبدون الفلترة دي السيارة كانت
     هتاخد طلبين، واحد قديم والتاني جديد. */
  function pendingCarIds(ctx) {
    try {
      if (window.YahmaPayments && typeof window.YahmaPayments.localByStatus === 'function') {
        return window.YahmaPayments.localByStatus('pending')
          .map(function (p) { return String(p.carId); });
      }
    } catch(e){yahmaErr(e,'renewals-ui.js:pendingCarIds');}
    return [];
  }

  async function bulkAdvanceToPayment(ctx, cars) {
    if (!window.YahmaPayments || typeof window.YahmaPayments.requestPayment !== 'function') {
      alert('تعذّر الانتقال لِتبويب «تحت الدفع» — وحدة الدفع غير محمّلة.');
      return;
    }
    if (typeof window.canAccessYahmaTab === 'function' && !window.canAccessYahmaTab('payments')) {
      alert('لا تملك صلاحية الوصول إلى قسم «تحت الدفع».');
      return;
    }

    // ❶ تحديث حالة الفحص لكل السيارات في الذاكرة
    cars.forEach(function(c){ c.inspectionStatus = 'تم الفحص'; });

    // ❷ حفظ جماعي فوري لجميع السيارات في قاعدة البيانات بطلب واحد
    let ok = true;
    try { ok = await saveData(cars.map(function(c){ return c.id; })); }
    catch(_){ ok = false; }
    if (ok === false) {
      alert('تعذر حفظ حالة الفحص على بعض السيارات — تحقق من الاتصال ثم أعد المحاولة.\nلم يتم نقل أي سيارة لِتبويب «تحت الدفع».');
      return;
    }

    // ❸ نقل الطلبات دفعة واحدة فائقة السرعة
    let moved = 0;
    const already = pendingCarIds(ctx);
    const toMove = cars.filter(c => already.indexOf(String(c.id)) < 0);
    const skipped = cars.length - toMove.length;

    const bRes = await window.YahmaPayments.requestPayment(toMove);
    moved = (bRes && bRes.moved) || toMove.length;

    cars.forEach(function(c){ ctx.selectedRenIds.delete(String(c.id)); });

    const parts = [];
    if (moved) parts.push('✓ تم نقل ' + moved + ' سيارة بنجاح لِتبويب «تحت الدفع».');
    if (skipped) parts.push('• ' + skipped + ' كانت موجودة بالفعل في «تحت الدفع».');
    alert(parts.join('\n') || 'تمت العملية.');

    if (typeof log === 'function') {
      try { log('فحص جماعي', moved + ' انتقال لِتحت الدفع'); } catch(e){}
    }
    render();
  }

  async function bulkSetInspection(ctx, value, advanceToPayment){
    const cars=renSelectedCars(ctx);
    if(!cars.length) return;
    const question = advanceToPayment
      ? 'تعيين حالة الفحص «تم الفحص» ونقل '+cars.length+' سيارة لِتبويب «تحت الدفع»؟'
      : 'تعيين حالة الفحص «'+value+'» لـ '+cars.length+' سيارة؟';
    if(!confirm(question+'\n'+renPlates(ctx, cars))) return;
    if(advanceToPayment){ await bulkAdvanceToPayment(ctx, cars); return; }
    await renBulkApply(ctx, cars, c=>{ c.inspectionStatus=value; }, 'تم تحديث فحص '+cars.length+' سيارة', 'تحديث فحص جماعي');
  }
  async function bulkRenewLicense(ctx){
    const cars=renSelectedCars(ctx);
    if(!cars.length) return;
    const def=defaultLicenseExpiry();
    const raw=prompt('تاريخ انتهاء الرخصة الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', def);
    if(!raw) return;
    const val=normalizeDateValue(raw)||raw;
    if(!confirm('ضبط انتهاء الرخصة على '+val+' لـ '+cars.length+' سيارة؟\n'+renPlates(ctx, cars))) return;
    await renBulkApply(ctx, cars, c=>{ c.licenseExpiry=val; if(!c.licenseStatus||String(c.licenseStatus).includes('منته')) c.licenseStatus='نشط'; },
      'تم تجديد رخصة '+cars.length+' سيارة (انتهاء '+val+')', 'تجديد رخص جماعي');
  }
  async function bulkSetLicenseStatus(ctx){
    const cars=renSelectedCars(ctx);
    if(!cars.length) return;
    const raw=prompt('حالة الرخصة الجديدة ('+cars.length+' سيارة):\nنشط / ملغى / موقوف / منتهي','نشط');
    if(!raw) return;
    const val=raw.trim();
    if(!['نشط','ملغى','موقوف','منتهي'].includes(val)){ alert('القيمة يجب أن تكون: نشط أو ملغى أو موقوف أو منتهي'); return; }
    if(!confirm('تعيين حالة الرخصة «'+val+'» لـ '+cars.length+' سيارة؟\n'+renPlates(ctx, cars))) return;
    await renBulkApply(ctx, cars, c=>{ c.licenseStatus=val; }, 'تم تحديث حالة رخصة '+cars.length+' سيارة', 'تحديث رخص جماعي');
  }
  async function bulkSetInsurance(ctx, value){
    const cars=renSelectedCars(ctx);
    if(!cars.length) return;
    const label=value==='ساري'?'ساري':'لا يوجد';
    if(!confirm('تعيين التأمين «'+label+'» لـ '+cars.length+' سيارة؟\n'+renPlates(ctx, cars))) return;
    await renBulkApply(ctx, cars, c=>{ c.insuranceStatus=value; }, 'تم تحديث تأمين '+cars.length+' سيارة', 'تحديث تأمين جماعي');
  }
  global.YahmaRenewalsBulk = {
    deleteRenCars,
    renSelectedCars,
    renPlates,
    renBulkApply,
    inspectionFromLicense,
    adminMoveSelectedCars,
    bulkInspectionFromLicenses,
    pendingCarIds,
    bulkAdvanceToPayment,
    bulkSetInspection,
    bulkRenewLicense,
    bulkSetLicenseStatus,
    bulkSetInsurance,
  };
})(window);

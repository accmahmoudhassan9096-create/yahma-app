/* ===== modules/fleet-view-bulk.js — الإجراءات الجماعية في تبويب الأسطول =====
 *
 * التحديد الجماعي وشريط الإجراءات: تجديد الرخصة/البطاقة، تغيير الحالة،
 * التصدير، ونقل السيارات المختارة لتبويب آخر.
 *
 * ⭐ كل دالة بتاخد ctx = { draw, exportRows, getFilteredRows } —
 * الثلاثة دول.functions المعلنة في renderFleet (مرفوعة بـhoisting)،
 * فبنمرّرهم صراحةً.
 *
 * Extracted from modules/fleet-view.js — same code, same behaviour.
 */
(function (global) {
  'use strict';
  const val = id => {
    const el = $(id);
    return (el && el.value || '').trim();
  };
  function updateBulkBar(ctx){
    const bar=$('bulk-bar');
    const n=ctx.selectedIds.size;
    if(!bar) return;
    bar.style.display = n>0 ? 'flex' : 'none';
    const cnt=$('bulk-count');
    if(cnt) cnt.textContent = n + ' محددة';
    const head=$('bulk-head-check');
    const allVisible=ctx.getFilteredRows();
    if(head){
      head.checked = allVisible.length>0 && allVisible.every(c=>ctx.selectedIds.has(String(c.id)));
      head.indeterminate = ctx.selectedIds.size>0 && !head.checked;
    }
    const selAll=$('bulk-select-all');
    if(selAll) selAll.checked = head ? head.checked : false;
  }
  function getSelectedCars(ctx){
    return fleet.filter(c=>ctx.selectedIds.has(String(c.id)));
  }
  async function bulkRenewLicense(ctx){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const defaultDate=defaultLicenseExpiry();
    const newDate=prompt('تاريخ انتهاء الرخصة الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', defaultDate);
    if(!newDate) return;
    const normalized=normalizeDateValue(newDate)||newDate;
    cars.forEach(c=>{ c.licenseExpiry=normalized; if(!c.licenseStatus||c.licenseStatus==='منتهي') c.licenseStatus='نشط'; });
    const ids=cars.map(c=>c.id);
    ctx.selectedIds.clear();
    await saveData(ids); ctx.draw(); updateBulkBar();
    alert('تم تجديد رخصة '+cars.length+' سيارة');
  }
  async function bulkRenewCard(ctx){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const defaultDate=addDays(todayStr(),365);
    const newDate=prompt('تاريخ انتهاء الكارت الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', defaultDate);
    if(!newDate) return;
    const normalized=normalizeDateValue(newDate)||newDate;
    cars.forEach(c=>{ c.cardExpiry=normalized; if(!c.cardStatus||c.cardStatus.includes('ملغ')||c.cardStatus.includes('موقوف')) c.cardStatus='نشط'; });
    const ids=cars.map(c=>c.id);
    ctx.selectedIds.clear();
    await saveData(ids); ctx.draw(); updateBulkBar();
    alert('تم تجديد كارت '+cars.length+' سيارة');
  }
  async function bulkSetStatus(ctx){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const status=prompt('الحالة الجديدة (نشط / تحت الصيانة / خارج الخدمة):', 'نشط');
    if(!status) return;
    const allowed=['نشط','تحت الصيانة','خارج الخدمة'];
    const s=status.trim();
    if(!allowed.includes(s)){ alert('الحالة يجب أن تكون: نشط أو تحت الصيانة أو خارج الخدمة'); return; }
    cars.forEach(c=>{ c.carStatus=s; });
    const ids=cars.map(c=>c.id);
    ctx.selectedIds.clear();
    await saveData(ids); ctx.draw(); updateBulkBar();
    alert('تم تحديث حالة '+cars.length+' سيارة');
  }
  async function bulkSetInspection(ctx){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const status=prompt('حالة الفحص الجديدة (تم الفحص / لم يفحص):', 'تم الفحص');
    if(!status) return;
    const allowed=['تم الفحص','لم يفحص'];
    const s=status.trim();
    if(!allowed.includes(s)){ alert('القيمة يجب أن تكون: تم الفحص أو لم يفحص'); return; }
    cars.forEach(c=>{ c.inspectionStatus=s; });
    const ids=cars.map(c=>c.id);
    ctx.selectedIds.clear();
    await saveData(ids); ctx.draw(); updateBulkBar();
    alert('تم تحديث فحص '+cars.length+' سيارة');
  }
  function bulkExportSelected(ctx){
    const cars=getSelectedCars();
    if(!cars.length){ alert('لا توجد سيارات محددة'); return; }
    ctx.exportRows(cars);
  }

  async function fleetAdminMoveSelectedCars(ctx, targetTab){
    if(typeof currentRole !== "undefined" && currentRole !== "admin"){
      alert("هذا الإجراء متاح لمدير النظام فقط.");
      return;
    }
    const cars = getSelectedCars();
    if(!cars.length){ alert("يرجى تحديد سيارة واحدة على الأقل."); return; }
    const tabNames = { renewals: "الفحص", payments: "تحت الدفع", paid: "تم الدفع", renewed: "تم التجديد" };
    const targetName = tabNames[targetTab] || targetTab;
    if(!confirm("هل تريد بالتأكيد نقل " + cars.length + " سيارة إلى تبويب «" + targetName + "»؟")) return;

    let moved = 0;
    const failed = [];

    if(targetTab === "renewals"){
      cars.forEach(function(c){ c.inspectionStatus = "لم يفحص"; });
      try{ await saveData(cars.map(c=>c.id)); }catch(_){}
      for(const car of cars){
        try{
          if(window.YahmaPayments && typeof window.YahmaPayments.localAll === 'function'){
            const allP = window.YahmaPayments.localAll().filter(p => String(p.carId) === String(car.id) && (p.status === 'pending' || p.status === 'paid'));
            for(const p of allP){
              if(typeof window.YahmaPayments.cancel === 'function'){
                await window.YahmaPayments.cancel(p.id, car.id);
              }
            }
          }
          moved++;
        }catch(err){
          console.error("Failed to move car to renewals:", car.plate, err);
          failed.push(car.plate || car.id);
        }
      }
    } else {
      cars.forEach(function(c){ c.inspectionStatus = "تم الفحص"; });
      try{ await saveData(cars.map(c=>c.id)); }catch(_){}
      if(!window.YahmaPayments){ alert("تعذر الوصول لوحدة الدفع."); return; }
      for(const car of cars){
        try{
          if(targetTab === "payments"){
            await window.YahmaPayments.requestPayment(car);
          } else if(targetTab === "paid"){
            var pendingList = window.YahmaPayments.localByStatus("pending");
            var item = pendingList.find(function(p){ return String(p.carId)===String(car.id); });
            if(!item){
              await window.YahmaPayments.requestPayment(car);
              pendingList = window.YahmaPayments.localByStatus("pending");
              item = pendingList.find(function(p){ return String(p.carId)===String(car.id); });
            }
            if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.paid){
              await window.PAY_ITEM_ACTION.paid(item || { id: car.id, carId: car.id }, car, true);
            }
          } else if(targetTab === "renewed"){
            var pList = window.YahmaPayments.localByStatus("pending");
            var pItem = pList.find(function(p){ return String(p.carId)===String(car.id); });
            if(!pItem){
              await window.YahmaPayments.requestPayment(car);
              pList = window.YahmaPayments.localByStatus("pending");
              pItem = pList.find(function(p){ return String(p.carId)===String(car.id); });
            }
            if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.paid){
              await window.PAY_ITEM_ACTION.paid(pItem || { id: car.id, carId: car.id }, car, true);
            }
            var paidList = window.YahmaPayments.localByStatus("paid");
            var paidItem = paidList.find(function(p){ return String(p.carId)===String(car.id); }) || pItem || { id: car.id, carId: car.id };
            if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.renew){
              await window.PAY_ITEM_ACTION.renew(paidItem, car, true);
            }
          }
          moved++;
        }catch(err){
          console.error("Failed to move car:", car.plate, err);
          failed.push(car.plate || car.id);
        }
      }
    }

    ctx.selectedIds.clear();
    ctx.draw();
    updateBulkBar();
    var msg = "✓ تم نقل " + moved + " سيارة بنجاح إلى تبويب «" + targetName + "».";
    if(failed.length) msg += "\nفشل نقل: " + failed.join("، ");
    alert(msg);
    if(typeof log === "function"){ try{ log("نقل سيارات من الأسطول", moved + " سيارة إلى " + targetName); }catch(_){} }
    if(typeof global.render === "function") global.render();
    else if(typeof window.render === "function") window.render();
  }

  global.YahmaFleetViewBulk = {
    updateBulkBar,
    getSelectedCars,
    bulkRenewLicense,
    bulkRenewCard,
    bulkSetStatus,
    bulkSetInspection,
    bulkExportSelected,
    fleetAdminMoveSelectedCars,
  };
})(window);

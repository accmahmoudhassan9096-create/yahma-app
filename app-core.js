/* app-core.js — فُرّغ ضمن تقسيم الملفات (المرحلة الثانية).
 * كل محتواه السابق انتقل إلى مجلد core/ بالترتيب نفسه:
 *   core/auth-boot.js       (السطور 1-414)    الإقلاع والمصادقة
 *   core/branches-store.js  (415-604)          التخزين والفروع
 *   core/sync.js            (605-758)          المزامنة مع Supabase
 *   core/report-glue.js     (759-949)          الفترات والمؤشرات والـPDF الرسمي
 *   core/render-router.js   (950-1431)         render() والواجهات
 *   core/pdf-share.js       (1432-1786)        PDF وواتساب وأزرار المركبة
 *   core/excel-import.js    (1787-2159)        Excel والشريط العلوي
 * + الوحدات المُستخرجة سابقًا في المرحلة الأولى (modules/audit-theme.js ... perf-vtable.js).
 * هذا الملف لم يعد يُحمَّل من index.html — يمكن حذفه بعد التأكد. */

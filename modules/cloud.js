/* ============ يهماء — Supabase (ملف مساعد) ============
 * منطق الدخول والمزامنة كله موجود في app-core.js.
 * الملف ده بس بيوفّر Cloud.sb لصفحة الاختبار (test.html) وللكونسول،
 * وبيعيد استخدام نفس العميل بدل ما يعمل واحد تاني.
 */
const Cloud = (function(){
  const URL = 'https://dzildqysxdlnfsmjttjg.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxkcXlzeGRsbmZzbWp0dGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTU3NTMsImV4cCI6MjEwNTYzMTc1M30.UdcML-28I0ndel65IMBxfG7wMOZjRK9ZlrjTj_JFyVc';
  const sb = window.supabaseClient || supabase.createClient(URL, KEY);
  window.supabaseClient = sb;
  return { sb };
})();

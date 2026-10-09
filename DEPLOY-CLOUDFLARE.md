# نشر «يهماء» على Cloudflare Pages (بديل Netlify)

المشروع **ثابت بالكامل**: 62 ملف، **من غير أي build step ولا functions**. لذلك الإعداد أبسط ما يكون.

---

## الطريقة الأولى (موصى بها): ربط GitHub مباشرة — نشر تلقائي لكل push

1. سجّل في [dash.cloudflare.com](https://dash.cloudflare.com) وافتح **Workers & Pages**.
2. **Create application → Pages → Connect to Git**.
3. اختر المستودع `accmahmoudhassan9096-create/yahma-app` (المستودع خاص — امنح Cloudflare الإذن بالوصول عليه).
4. **إعدادات البناء:**
   | الحقل | القيمة |
   |---|---|
   | Framework preset | None |
   | Build command | *(اتركه **فاضي**)* |
   | Build output directory | `/` |
   | Root directory | *(اتركه فاضي — جذر المستودع)* |
   | Node version | *(اتركه فاضي)* |
5. **Deploy Site**. هيظهر رابط مثل `yahma-cars.pages.dev` — افتحه وجرّب.
6. **اختياري:** أضف دومين من **Custom domains → Set up a custom domain** (مجاني، بشرط أن يكون DNS عند Cloudflare أو استخدم CNAME).

### بعد نجاح الاختبار
1. **حدّث Supabase** (مهم قبل ما الناس تستخدم الرابط الجديد):
   - `Project Settings → Authentication → URL Configuration`
   - **Site URL**: الدومين الجديد.
   - **Redirect URLs / Allowed Origins**: ضيف الدومين الجديد (مهم لمن يستخدم تسجيل Google).
2. **أخبر المشرفين** بفتح الرابط الجديد (المتصفح بيسجّل التطبيق الجديد تلقائيًا؛ لو حد عنده النسخة القديمة مثبّتة على نطاق Netlify هيفضل شغّال القديم).
3. **بعد أسبوع** من Satisfaction: امسح موقع Netlify.

> لو ربطت GitHub直接从 Cloudflare، مش محتاج تحتاج ملف `.github/workflows/deploy-cloudflare.yml` — امسحه أو اعمله disable عشان ما ينشرش مرتين.

---

## الطريقة الثانية: النشر من GitHub Actions (سجلاتDeployment في GitHub نفسه)

أفضل لو حابب تشوف **سجل البناء والفشل في واجهة GitHub** بدل لوحة Cloudflare.

1. في Cloudflare: **My Profile → API Tokens → Create Token**
   - قالب: **Edit Cloudflare Workers** (أو Custom token): صلاحية **Account → Cloudflare Pages → Edit** + **Account → Workers Scripts → Edit**.
   - انسخ التوكن.
2. في Cloudflare: انسخ **Account ID** من إعدادات أي حساب (رقم يبدأ بـ 32 حرف hex).
3. في GitHub: `Settings → Secrets and variables → Actions`
   - **Secrets**: `CLOUDFLARE_API_TOKEN`، `CLOUDFLARE_ACCOUNT_ID`.
   - **Variables**: `CLOUDFLARE_PROJECT_NAME` = اسم مشروع Pages (نفس الاسم في الرابط قبل `.pages.dev`).
4. ادفع أي commit → البناء يعمل تلقائيًا وبياناته في تبويب **Actions**.
   - الملف `.github/workflows/deploy-cloudflare.yml` **لا يفشل** لو الأسرار غير موجودة (فيه guard).
5. عند كل نشر، ارفع نسخة الـservice worker (`sw.js`) لتحديث الكاش عند العملاء.

---

## ملاحظات خاصة بالمنصة

| البند | الوضع |
|---|---|
| عدد الملفات | 62 (الحد 20,000) ✓ |
| `assets/hero-video.mp4` | 7.76MB (الحد 25MB للملف) ✓ |
| `supabase/functions/*` | **لا يُنشر مع الموقع** — منفصل على Supabase Edge Functions ✓ |
| `sw.js` | يجب أن يبقى في جذر الموقع (وهو كذلك) ✓ |
| Service worker + نطاق جديد | النطاق القديم لـNetlify سيبقى يخدم نفسه — انقل DNS بعد التأكد ✓ |
| Supabase Auth/RLS/Realtime | **لا يتأثر بالنقل** إطلاقًا ✓ |

## بعد أول نشر على النطاق الجديد
- حدّث `sw.js`: `CACHE_NAME = 'yahma-shell-v114'`.
- تحقّق من الإنتاج: افتح `https://<your-site>/sw.js` وتأكد أن `yahma-shell-vNNN` مطابق، وسجّل دخول، وجرّب فتح التطبيق بلا إنترنت، وجرّب استيراد ملف Excel.
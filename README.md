# يهماء — منصة تحضير الأسطول للتأجير

> تطبيق ويب ثابت (Vanilla JS، بدون build step، بدون `package.json`).
> بيتشرى على Cloudflare Workers عبر `wrangler.toml`، وكل الداتا من Supabase.

## التشغيل المحلي

```bash
npx wrangler dev          # http://127.0.0.1:8788
```

أو أي سيرفر ملفات ثابت:

```bash
npx serve .               # أو: python -m http.server 8080
```

## الفحوصات (كلها محلية، بدون تثبيت)

```bash
node --test tests/*.test.js   # 297 اختبار
node scripts/check-shell.js   # صحّة precache الـservice worker
node scripts/check-workflow.js # بنية ملف الـworkflow
node scripts/css-prune.js     # تقرير: قوانين CSS ميتة (مع --apply بتحذفها)
node scripts/minify-css.js    # توليد css/*.min.css من المصدر
```

كلهم بيشتغلوا على `node --test` المدمج — مفيش `package.json` عن قصد،
لأن Cloudflare Pages لو شاف واحد بيحسّها مشروع Node وبيحاول يبني
حاجة مش موجودة، فكل deploy بيفشل.

### حارس الـCSS الكاسكاد (`tests/cascade.test.js`)

المشروع فيه 8 ملفات CSS بيتحمّلوا بالترتيب، وكل ملف فوقه بيلغي اللي
قبله بـ`!important`. ده مريح بس بيخفي أخطاء — قاعدة في ملف متأخر
بـspecificity أعلى بتلغي قصد الملف الأول من غير ما حد ياخد باله.

الاختبار ده **بيحسب مين بيكسب فعلاً** (ترتيب الملفات + specificity +
`!important` + `@media`) وبيتحقق من:
- الشريط العلوي سطر واحد على الديسكتوب، ويرجع سطرين تحت 900px
- مفيش عنصر الـJS بيقراه مخفي بـCSS بـ`!important` (اللي كان بيخفي
  زرار الخروج)
- مفيش «تعارض كاسكاد صامت» — ملف متأخر بـspecificity أقل من اللي
  قبله، فالتعديل الجديد مش بيشتغل أصلاً

لو غيّرت ترتيب CSS أو selector، الاختبار هيقولك مين كسب.

## هيكل المشروع

```
yahma-app/
├── index.html            # الهيكل + manifest + تسجيل الـservice worker
├── app.js                # الإقلاع + Dexie/IndexedDB
├── sw.js                 # service worker — يخزّن هيكل التطبيق أوفلاين
├── manifest.json         # PWA
├── diagnostic.html       # صفحة تشخيص المنصة (تعمل في أي وقت)
├── _headers              # قواعد Cache-Control على Cloudflare
├── wrangler.toml         # إعدادات النشر (static assets only)
├── assets/
│   └── hero-car.svg      # silhouette السيارة (بتتلوّن من CSS كـmask)
├── fonts/                # Cairo woff2 محلي (79KB) — مفيش Google Fonts
├── vendor/               # مكتبات محلية: supabase, dexie, leaflet, xlsx, jspdf, html2canvas
├── css/                  # 8 ملفات — المصدر (للتنسيق والصيانة) + المضغوط (اللي بيتشحن)
│   ├── fonts.css
│   ├── 01-base.css           # الأساس + الشريط العلوي + النوافذ
│   ├── 02-components.css     # المكوّنات + القوائم + z-index
│   ├── 03-motion-layout.css  # الحركة + التوالي + الترويسات
│   ├── 04-dark-overrides.css # الوضع الليلي + التقارير + التراكبات المتأخرة
│   ├── 05-offline-badge.css
│   ├── 06-premium-design.css
│   └── 07-visual-redesign.css # آخر ملف — بيلغي اللي قبله بـ!important
├── core/                 # منطق التطبيق (14 ملف)
│   ├── auth-boot.js          # الإقلاع + بوابة المصادقة + الأدوار
│   ├── permissions.js        # صلاحيات الأدوار
│   ├── branches-store.js     # مخزن الفروع + البذور
│   ├── sync.js               # طبقة Supabase/Realtime
│   ├── data / render / pdf / excel …
│   └── router-payments*.js   # شاشات المدفوعات (6 ملفات)
├── modules/              # الوحدات (54 ملف) — الشاشات والمكوّنات
└── supabase/             # المخطط + Edge Functions + سكربتات SQL
```

> **ترتيب التحميل في `index.html` مهم عند أي تعديل.**
> - **JS:** `app.js` ← `core/*` ← `modules/*` — الترتيب الحرفي زي ما هو.
> - **CSS:** `fonts` ← `01` ← `02` ← `03` ← `04` ← `05` ← `06` ← `07`.
>   آخر ملف لازم يفضل `07` لأنه يحمل التراكبات المتأخرة والوضع الليلي.

## قواعد لازم تلتزم بيها

### 1. أي تعديل على ملف مشحون = رفع رقم الكاش

الـservice worker بيشتغل **cache-first**. لو غيّرت CSS أو JS من غير ما
ترفع `CACHE_NAME` في `sw.js`، المستخدم هيضل يشغّل النسخة القديمة من
Cache Storage — ولافتة التحديث مش هتظهر (لأن رقم النسخة واحد).

```bash
# غيّر CACHE_NAME في sw.js:  yahma-shell-vNNN → vNNN+1
node scripts/check-shell.js   # بيفشل لو نسيت
```

الفحص ده في `check-shell.js` وبيشتغل على CI بعد كل push.

### 2. مفيش CDN خارجي

كل الأصول من نطاقنا: الخطوط local، المكتبات local، صورة السيارة SVG
محلي. طلب خارجي واحد بيكسر تشغيل المنصة على شبكة بتقطعه — وده اللي
حصل قبل كده.

### 3. مصدر الـCSS هو الحقيقة

`css/*.css` هو المصدر المقروء (التعليقات العربية فيه هي التوثيق)،
و`css/*.min.css` هو اللي بيتشحن ويتخزّن. بعد أي تعديل على المصدر:

```bash
node scripts/minify-css.js
```

`check-shell.js` بيكشف لو المصدر والمضغوط مش متسابقين.

### 4. اللي مش بيتحمّل مع كل install

الـprecache = **2MB** (كان 3.9MB). اللي برّه:

| الملف | الحجم | إزاي بيشتغل |
|---|---|---|
| `xlsx` + `jspdf` + `html2canvas` | 1.4MB | أول ضغطة «تصدير» — والـSW بيخزّنهم بعدها |
| `leaflet` + صوره | 162KB | أول ما خريطة الأقسام تظهر |

يعني أول فتح بيحمّل 2MB بس، والسماحيات الباقية بتتحمّل لما تحتاجها
بس. كلهم بيشتغلوا أوفلاين بعد أول تحميل أونلاين.

## PWA / أوفلاين

- المنصة قابلة للتثبيت (Add to Home Screen) عبر `manifest.json`.
- `sw.js` بيخزّن هيكل التطبيق (HTML/CSS/JS) — طلبات Supabase نفسها ما
  بتتخزّنش أبدًا وبتعدّي على الشبكة دايمًا.
- مكتبات التصدير (xlsx/jspdf/html2canvas = 1.4MB) **مش** في الـprecache:
  بتتحمّل أول مرة المستخدم يضغط «تصدير»، والـSW بيخزّنها بعد كده فتشتغل
  أوفلاين من بعدها.

## Supabase

- الدخول: Supabase Auth (بريد/كلمة مرور + Google) — الأدوار من جدول
  `profiles`.
- البيانات: جدول `vehicles` (المفتاح `car_id`، والسيارة كاملة في عمود
  `data` jsonb + أعمدة صريحة زي `branch`/`plate` للفلاتر) و RLS.
- التحديث المباشر: Realtime على جدول `vehicles`.
- شغّل `supabase/supabase-migration.sql` في SQL Editor — أوامره
  `if not exists` وقابلة لإعادة التطبيق.
- انشر الدوال: `admin-create-user` و `admin-delete-user` و
  `send-user-email` كـ Supabase Edge Functions.

```bash
supabase functions deploy send-user-email --project-ref dzildqysxdlnfsmjttjg
```

- أسرار الإرسال: `RESEND_API_KEY` و `RESEND_FROM_EMAIL` (عنوان مُعتمد
  لدى Resend) + `YAHMA_SERVICE_ROLE_KEY` و `SUPABASE_ANON_KEY`.
  وفيه طريقة بديلة احتياطية بـEmailJS: `EMAILJS_SERVICE_ID` +
  `EMAILJS_TEMPLATE_ID` + `EMAILJS_PRIVATE_KEY`.
- `YAHMA_SITE_URL` — رابط المنصة، بيتّسخ في روابط الإيميل.
- ⚠️ **الأسماء أعلاه حرفيّة** — الـEdge Functions بتقرأها بـ
  `Deno.env.get` بالاسم نفسه. الاسم الغلط = دالة شغّالة بـ`undefined`.
  كل الأسماء موثّقة في `.env.example`.
- الجدولة السحابية (تقرير يومي + تنبيه أسبوعي): شغّل
  `supabase/scheduled-email-setup.sql` بعد ما تحط سر
  `YAHMA_CRON_SECRET` في أسرار الدوال.
- أي مستخدم يدخل بـ Google لأول مرة بياخد صف `profiles` تلقائيًا بدور
  `view` (trigger على `auth.users`)، وبعدين المدير يقدر يغيّر دوره.

## النشر

```bash
npx wrangler deploy
npx wrangler versions list --name yahma-app
npx wrangler rollback --name yahma-app
```

التفاصيل في [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md).

## ملاحظات

- `diagnostic.html` صفحة تشخيص: بتقول لك حالة الـservice worker، نسخة
  الكاش، اتصال Supabase، وسعة التخزين — افتحها قبل ما تفتح تذكرة دعم.
- `.env.example` فيه توثيق المتغيرات — **مش** بيتقرأ وقت التشغيل
  (التطبيق static والمفاتيح في `core/auth-boot.js`).

# إرسال الإيميلات عبر EmailJS (بديل Resend)

المنصة بقت تدعم **EmailJS** كوسيط إرسال، ويبقى له أولوية على Resend لو الموجود.
الإرسال بيحصل **من السيرفر** (Supabase Edge Function)، فالإرسال التلقائي الأسبوعي بيشتغل
حتى لو محدش فتح المنصة.

## 1) في حساب EmailJS
1. **Email Services** → اربط حساب بريدك (Gmail / Outlook) — سمّيّه مثل `yahma-mail`.
2. **Email Templates** → أنشئ قالب واحد فقط، وسمّه مثل `branch_report`، وضع فيه:

   ```html
   To:      {{to_email}}
   Subject: {{subject}}
   ```
   وفي جسم الرسالة:
   ```html
   <div dir="rtl" style="font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.9">
     {{message}}
   </div>
   ```
   > لازم المتغيّر `to_email` موجود عشان كل فرع يستلم إيميمه.

3. انسخ المعرّفات الثلاثة:
   - **Service ID** مثل `service_abc123`
   - **Template ID** مثل `template_xyz789`
   - **Private Key** (من تبويب Account) — يبدأ بـ `private_...` (يتطلب اشتراك Pro للإرسال من السيرفر)

## 2) في Supabase — Secrets
`Project Settings → Edge Functions → Secrets → Add new secret` (ثلاثة):
```
EMAILJS_PRIVATE_KEY = private_xxxxxxxxxxxx
EMAILJS_SERVICE_ID  = service_abc123
EMAILJS_TEMPLATE_ID = template_xyz789
```

## 3) انشر الدالة
```
supabase functions deploy send-user-email --project-ref dzildqysxdlnfsmjttjg
```

## 4) من داخل المنصة
`التقارير ← 📧 تقرير الفحص الأسبوعي لكل فرع`:
- اكتب بريد كل فرع → **💾 حفظ البريد**
- **👁 معاينة القائمة** للتأكد من المحتوى قبل الإرسال
- **📤 إرسال الآن** للتجربة
- ولتفعيل **الإرسال التلقائي الأسبوعي**: من كارت «📬 الإرسال المجدول» فعّل الجدولة واختر اليوم/الوقت.

## حدود تذكرك بيها
| البند | situation |
|---|---|
| الحصة المجانية EmailJS | 200 رسالة/شهر — يكفي لـ ~10 فروع أسبوعيًا (40 رسالة) |
| الإرسال التلقائي يحتاج | جدولة `supabase/scheduled-email-setup.sql` (مرة واحدة في SQL Editor) + جدول `supabase/branch-contacts.sql` |
| أولوية الوسيط | EmailJS موجود ← يُستخدم هو، وإلا Resend إن كان مُعدًا |

## لو فضلت Resend (البديل)
ضع نفس الأسرار الثلاثة `RESEND_API_KEY` و`RESEND_FROM_EMAIL` و`YAHMA_CRON_SECRET`، وسيعمل تلقائيًا.
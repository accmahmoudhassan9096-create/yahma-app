(function(){
  'use strict';
  async function describeInvokeError(result, prefix){
    /* ⚠️ كل القراءة جوّه try — والوصول لـ result.error نفسه كمان.
       لو حصل استثناء في أي خطوة، لازم يوصل للمستخدم نص مفهوم؛
       throw هنا هيرجّع «تعذر إنشاء المستخدم» العام تاني وده عكس
       اللي الدالة دي اتعملت عشانه. */
    var err=null;
    try{
      err=result&&result.error;
      if(!err) return prefix+'خطأ غير معروف';
      var message='', raw='', code='', status='';

      /* ❶ body — فيه رسالة الدالة

         ⚠️ فيه خطأين اتلخبطوا هنا:

         الأول، الـawait. Response.json() بترجع Promise، ولو نسينا
         الـawait بقى parsed Promise — truthy فالcondition اتعدّى،
         ثم parsed.error رجعت undefined والرسالة العربية ضاعت.

         التاني، الترتيب. بعد ما .json() يتقرا الـbody مابيلوش
         معاه clone — بيترمي «Body has already been consumed».
         فالنسخة الأولى كانت بتعمل .json() وبعدين فيFallback
         .clone().text()، وFallback ده معشيش يتفعّل أبداً: الردود
         اللي مش JSON أصلاً (صفحة 502 من Cloudflare، نص صريح)
         كانت بتضيع زي ما هي.

         الحل: نقرا clone().text() الأول — سيب الـbody الأصلي
         مقروء بعد كده — ونعمل JSON.parse بنفسنا جوّه try. قراءة
         واحدة، وتحليل آمن، وبتشتغل مع JSON ومع النص. */
      var bodies=[];
      if(err.context && typeof err.context.text==='function') bodies.push(err.context);
      if(result.data && typeof result.data==='object' && !(result.data instanceof Array)) bodies.push(null);
      for(var i=0;i<bodies.length;i++){
        var parsed=null;
        if(!bodies[i]){
          parsed=result.data;
        }else{
          var textBody=null;
          try{
            /* الـclone الأول: قراءة واحدة بس، واللي قبلها بيفضل
               متاح لو احنا غلطان في التحليل. */
            var reader=bodies[i].clone?bodies[i].clone():bodies[i];
            textBody=await reader.text();
          }catch(_){ textBody=null; }
          if(textBody){
            var trimmed=String(textBody).trim();
            if(!trimmed) continue;
            try{
              /* catch هنا مقصود — الرد مش JSON مش خطأ، هو نص
                 عادي (Cloudflare بيرد بصفحة HTML مثلاً). */
              parsed=JSON.parse(trimmed);
            }catch(__){ parsed=trimmed; }
          }
        }
        if(!parsed) continue;
        if(typeof parsed==='string'){ if(!raw) raw=parsed.slice(0,300); continue; }
        if(parsed.error&&!message) message=String(parsed.error).slice(0,300);
        if(parsed.message&&!raw) raw=String(parsed.message).slice(0,300);
        if(parsed.code&&!code) code=String(parsed.code);
      }

      /* ❷ رمز الحالة */
      var ctx=err.context;
      status=String((ctx&&(ctx.status||(ctx.response&&ctx.response.status)))||err.status||'').trim();

      if(!message) message=(raw&&raw!=='{}')?raw:(typeof err.message==='string'?err.message.slice(0,300):'');

      var bits=[];
      if(status) bits.push('كود '+status);
      if(code) bits.push(code);
      if(!message) message='ما وصلش سبب — غالبًا الجلسة منتهية. سجّل خروج وادخل تاني وحاول.';

      return prefix+message+(bits.length?' ['+bits.join(' · ')+']':'');
    }catch(e){
      yahmaErr(e,'topbar-ui.js:describeInvokeError:fail');
      var fallbackMsg='';
      try{
        if(err && typeof err.message==='string'&&err.message) fallbackMsg=err.message.slice(0,300);
      }catch(__){ fallbackMsg=''; }
      return prefix+(fallbackMsg||'ما قدرتش أقرأ سبب الخطأ.');
    }
  }

  /* حاجز إضافي: لو دالة بترجّع Promise اتنادت من غير await،
     الـtextContent بياخد Promise ويطلع للمستخدم «[object Promise]»
     بدل السبب. ده حصل فعلاً في v200. الحاجز ده بيمنع تكرارها
     لو اتضاف استدعاء جديد ومتساش منه الـawait. */
  function showResult(el, value, fallback){
    try{
      if(value&&typeof value.then==='function'){
        value.then(function(v){ el.textContent=String(v==null?fallback:v); },
                   function(){ el.textContent=fallback; });
        return;
      }
      el.textContent=String(value==null?fallback:value);
    }catch(e){
      el.textContent=fallback;
    }
  }

  /* ===== استدعاء دالة بعد التأكد من الجلسة =====

     الاستدعاء المباشر كان بيسيب المستخدم عند رسالة «جلسة الدخول
     غير صالحة» من غير مخرج — الزر ميت والسبب معروف بس مافيش طريق
     غير إنه يدور على زر الخروج في الرأس.

     البوابة (auth-boot) بتعمل اتنين:
       استباقي: تجديد التوكن لو شارف على الانتهاء، قبل ما نبعته.
       تفاعلي: لو الرد قال إن الجلسة مش صالحة، تعرض زر «تسجيل
                دخول» جوّه نفس الرسالة.

     بترجّع {skipped:'session'} عشان المتصل يعدّي على مسار الخطأ
     العادي — يعني مفيش رسالتين فوق بعض. */
  async function invokeYahmaFunction(name, body, msgEl){
    if(typeof window.yahmaEnsureFreshSession === 'function'){
      var gate = await window.yahmaEnsureFreshSession();
      if(!gate.ok){
        if(typeof window.yahmaSessionGate === 'function') window.yahmaSessionGate(msgEl, gate.message);
        else if(msgEl) msgEl.textContent = gate.message || 'انتهت جلسة الدخول.';
        return { skipped:'session', reason:gate.reason };
      }
    }
    var r = await window.supabaseClient.functions.invoke(name, {body:body});
    if(r && r.error){
      var status = (r.error.context && r.error.context.status) || r.error.status || '';
      var detail = await describeInvokeError(r, '');
      if(typeof window.yahmaIsSessionError === 'function' && window.yahmaIsSessionError(status, detail)){
        if(typeof window.yahmaSessionGate === 'function'){
          window.yahmaSessionGate(msgEl, 'انتهت جلسة الدخول على هذا الجهاز — سجّل دخول تاني عشان تكمل.');
        }
        return { skipped:'session', reason:'server-rejected', result:r };
      }
    }
    return { result:r };
  }

  /* نصدّرها للاختبار: بتتحقق منها على خطأ حقيقي من دالة
     منشورة، مش على شكل مرسوم في الكتاب. */

  window.yahmaDescribeInvokeError = describeInvokeError;
  window.describeInvokeError = describeInvokeError;

  window.yahmaShowResultInto = showResult;
  window.showResult = showResult;

  window.yahmaInvokeFunction = invokeYahmaFunction;
  window.invokeYahmaFunction = invokeYahmaFunction;
})();

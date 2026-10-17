(function(global){
  'use strict';
  var b64='SEE_FILE';
  function gunzipB64(b64){
    var bin=atob(b64);
    var bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  gunzipB64(b64).then(function(code){ (0,eval)(code); }).catch(function(e){
    console.error(e);
    global.YahmaRenewals=global.YahmaRenewals||{};
    global.YahmaRenewals.render=function(content){ if(content) content.innerHTML='<div class="panel">تعذر تحميل تبويب الفحص — أعد نشر الملف</div>'; };
  });
})(window);

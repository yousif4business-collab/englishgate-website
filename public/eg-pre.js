/* decided before the first paint: the opening plays on every visit (a tap skips it), never for reduced motion */
(function(){var r=document.documentElement,l='ar';try{l=localStorage.getItem('eg_lang')==='en'?'en':'ar';}catch(e){}
r.lang=l;r.dir=l==='ar'?'rtl':'ltr';var en=l==='en';
document.getElementById('giWord').textContent=en?'English Gate':'انكلش كيت';document.getElementById('giTag').textContent=en?'From Gate to Great':'من البوابة… للصدارة';document.getElementById('giSkip').textContent=en?'Skip':'تخطَّ';
var rm=false,seen=false;try{rm=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}try{seen=sessionStorage.getItem('eg_intro4')==='1';}catch(e){}
/* a deep link on the live site (/rusul, /programs, ...) goes straight to its part: no opening */
var deep=/^\/(programs|rusul|staff|placement|workshop|moments|videos|faq|contact|about|testimonials|careers|privacy|terms|cookies)\/?$/i.test(location.pathname);
if(!rm&&!deep&&!window.__noIntro){r.classList.add('intro-on');}
/* the doors wait, shut and dark, to wake one by one (never held: the class goes after a while whatever happens) */
if(!rm){r.classList.add('wake');setTimeout(function(){r.classList.remove('wake');},9000);}})();

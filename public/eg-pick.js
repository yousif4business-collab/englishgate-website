/* picks the hero still for the visitor's language before first paint (runs right after the picture) */
(function(){var l=document.documentElement.lang==='en'?'en':'ar',p=document.currentScript.previousElementSibling;p.querySelectorAll('source').forEach(function(s){s.srcset=s.getAttribute('data-srcset-'+l);});var i=p.querySelector('img');i.src=i.getAttribute('data-src-'+l);})();

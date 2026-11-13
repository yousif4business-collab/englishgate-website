import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
const CHECKS = [
 { id:'P1  hero copy',              must:'present', n:['انطلقوا برحلتكم ويانا'] },
 { id:'P2a step: placement test',   must:'present', n:['اختبار تحديد المستوى'] },
 { id:'P2b step: parents informed', must:'present', n:['بكافة التفاصيل'] },
 { id:'P2c step: expert staff',     must:'present', n:['الخبرة والمعرفة'] },
 { id:'P3  تأسيس اللغة (clean)',    must:'absent',  n:['تأسيس اللغة باللغة'] },
 { id:'P4  founding paragraph',     must:'present', n:['محطة الانطلاق نحو اللغة'] },
 { id:'P5a levels heading',         must:'present', n:['مسارات مختلفة'] },
 { id:'P5b سلسلة اكاديمك ستار',     must:'present', n:['اكاديمك ستار','أكاديمك ستار'] },
 { id:'P6a من البداية الى التحدث',  must:'present', n:['من البداية إلى التحدث','من البداية الى التحدث'] },
 { id:'P6b مستواه الحقيقي',         must:'present', n:['مستواه الحقيقي'] },
 { id:'P7a اراء أولياء الأمور',     must:'present', n:['اراء أولياء الأمور','آراء أولياء الأمور'] },
 { id:'P7b شارك رأيك CTA',          must:'present', n:['شارك رأيك'] },
 { id:'P7c old «ماذا تقول» gone',   must:'absent',  n:['ماذا تقول العائلات'] },
 { id:'P8  زورونا او تواصلوا معنا', must:'present', n:['زورونا او تواصلوا','زورونا أو تواصلوا'] },
 { id:'P9a FAQ الأعمار',            must:'present', n:['تستقبلون'] },
 { id:'P9b FAQ «اين نزوركم»',       must:'present', n:['نزوركم'] },
 { id:'P9c «تقعون» gone',           must:'absent',  n:['تقعون'] },
 { id:'P10 سنطلعك على مستواه',      must:'present', n:['سنطلعك'] },
 { id:'P11 تفاصيل التحويل',         must:'present', n:['بتفاصيل التحويل مباشرة'] },
 { id:'P12a «لا توجد حصص» gone',    must:'absent',  n:['لا توجد حصص'] },
 { id:'P12b فيديو ملخص present',    must:'present', n:['ملخص'] },
 { id:'P13a journey paragraph',     must:'present', n:['مناهج عالمية موثوقة'] },
 { id:'P13b «تسع/٩ مستويات» gone',  must:'absent',  n:['تسع مستويات','٩ مستويات','9 مستويات','9 levels','nine levels'] },
 { id:'P14a «لا توجد وظائف»',       must:'present', n:['لا توجد وظائف'] },
 { id:'P14b «شواغر» gone',          must:'absent',  n:['شواغر'] },
 { id:'P15 LinkedIn link',          must:'present', n:['linkedin.com/in/english-gate-academy'] },
 { id:'P16 رفيق الرحلة',            must:'present', n:['رفيق الرحلة'] },
];
const esc = s => [...s].map(c => c.codePointAt(0) > 127 ? '\\u' + c.codePointAt(0).toString(16).padStart(4,'0') : c).join('');
const hit = (hay, s) => hay.includes(s) || hay.includes(esc(s)) || hay.toLowerCase().includes(s);
function collect(dir, exts, out=[]) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); const st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|\.git/.test(f)) collect(p, exts, out); }
    else if (exts.some(e => f.endsWith(e))) out.push(p); }
  return out;
}
function report(name, hay) {
  console.log('\n══════ ' + name + ' ══════');
  let pass = 0, fails = [];
  for (const c of CHECKS) {
    const found = c.n.some(s => hit(hay, s));
    const ok = c.must === 'present' ? found : !found;
    ok ? pass++ : fails.push(c.id.trim());
    console.log((ok ? '  PASS  ' : '✗ FAIL  ') + c.id + (ok ? '' : (c.must==='absent' ? '  ← still there' : '  ← missing')));
  }
  console.log('→ ' + pass + '/' + CHECKS.length + (fails.length ? '   FAILING: ' + fails.join(' | ') : '  ALL GREEN'));
}
report('LOCAL SOURCE (src/)', collect('src', ['.jsx','.js','.tsx','.ts','.json']).concat(existsSync('index.html')?['index.html']:[]).map(f=>readFileSync(f,'utf8')).join('\n'));
if (existsSync('dist')) report('LOCAL BUILD (dist/) — what deploys', collect('dist', ['.js','.html']).map(f=>readFileSync(f,'utf8')).join('\n'));
const site = process.argv[2] || 'https://englishgate-school.com';
try {
  const html = await (await fetch(site, {headers:{'user-agent':'Mozilla/5.0'}})).text();
  let js = '', seen = new Set();
  const queue = [...html.matchAll(/["'](\/assets\/[^"']+\.js)["']/g)].map(m=>m[1]);
  while (queue.length && seen.size < 40) {
    const a = queue.shift(); if (seen.has(a)) continue; seen.add(a);
    const t = await (await fetch(site + a)).text(); js += t;
    for (const m of t.matchAll(/["']?(?:\/)?(assets\/[A-Za-z0-9_.-]+\.js)["']?/g)) { const u='/'+m[1]; if(!seen.has(u)) queue.push(u); }
  }
  report('LIVE ' + site + ' (' + seen.size + ' bundles)', html + js);
} catch(e) { console.log('\nLIVE check failed: ' + e.message); }

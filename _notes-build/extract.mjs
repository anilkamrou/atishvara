import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const [,, from, to] = process.argv;
const doc = await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('C:/project/atishvara/Senior_Java_Architect.pdf')),verbosity:0}).promise;
const fontRatio = {};
const pages = [];
for (let p=+from; p<=+to; p++) {
  const pg = await doc.getPage(p); const tc = await pg.getTextContent();
  const items = tc.items.filter(i=>i.str.length).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],h:i.height,w:i.width,f:i.fontName}));
  for (const i of items) if (i.s.trim().length>=3 && !/[^\x20-\x7e]/.test(i.s)) (fontRatio[i.f]??=[]).push(i.w/i.s.length/i.h);
  pages.push({p,items});
}
const mono = new Set(Object.entries(fontRatio).filter(([f,a])=>{a.sort((x,y)=>x-y);const m=a[a.length>>1];const lo=a[Math.floor(a.length*.1)],hi=a[Math.floor(a.length*.9)];return hi-lo<0.03 && m>0.55;}).map(([f])=>f));
console.error('mono', [...mono], Object.fromEntries(Object.entries(fontRatio).map(([f,a])=>[f,a[a.length>>1].toFixed(3)])));
fs.writeFileSync(`pages_${from}_${to}.json`, JSON.stringify({mono:[...mono],pages}));

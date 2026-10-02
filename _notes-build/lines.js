const fs=require('fs');
const d=require('./pages_1_311.json');
const MONO=new Set(['g_d0_f8','g_d0_f10','g_d0_f11']);
const NEUT=new Set(['g_d0_f5','g_d0_f6','g_d0_f13','g_d0_f14']);
const BOLD=new Set(['g_d0_f7','g_d0_f4']), ITAL=new Set(['g_d0_f9']);
function pageLines(pg){
  const its=pg.items.filter(i=>i.s.trim()!=='' );
  its.sort((a,b)=>b.y-a.y||a.x-b.x);
  const L=[];
  for(const i of its){ let l=L.find(l=>Math.abs(l.y-i.y)<2.2); if(!l){l={y:i.y,items:[]};L.push(l)} l.items.push(i); }
  L.sort((a,b)=>b.y-a.y);
  for(const l of L){ l.items.sort((a,b)=>a.x-b.x);
    const real=l.items.filter(i=>!NEUT.has(i.f));
    l.code = real.length>0 && real.every(i=>MONO.has(i.f)&&i.h<8);
    l.x=l.items[0].x; l.h=Math.max(...l.items.map(i=>i.h)); }
  return L.filter(l=>l.y>30 && l.y<800);
}
module.exports={pageLines,MONO,NEUT,BOLD,ITAL,d};
if(require.main===module){
  const [a,b]=process.argv.slice(2).map(Number);
  for(const pg of d.pages.filter(p=>p.p>=a&&p.p<=b)){
    const ls=pg.items.map(i=>i.y); console.log('=== page',pg.p,'ymax',Math.max(...ls).toFixed(0),'ymin',Math.min(...ls).toFixed(0));
    for(const l of pageLines(pg)){
      let t='',end=null;
      for(const i of l.items){ if(end!==null){const g=i.x-end; t+= g>14?' ┃ ':(g>0.8?' ':'');} 
        t+= MONO.has(i.f)&&!l.code? '`'+i.s+'`' : i.s; end=i.x+i.w;}
      console.log((l.code?'C':'T'), l.x.toFixed(0).padStart(3), l.y.toFixed(0).padStart(3), l.h.toFixed(1), t);
    }
  }
}

// node build-data.js <chapterNo...>  -> data.json (meta + chapters) and fragments chN.fragment.json
const fs = require('fs');
const p = require('./parse.js');
const { pageLines, d } = require('./lines.js');
// chapter page ranges from the PDF contents (start page of each chapter; cheat sheet is last page)
const START = { 1: 8, 2: 38, 3: 54, 4: 83, 5: 103, 6: 123, 7: 141, 8: 154, 9: 167, 10: 219, 11: 235, 12: 242, 13: 252, 14: 263, 15: 274, 16: 297 };
const END = n => n === 16 ? 311 : START[n + 1] - 1;
setImmediate(() => {
  const nos = process.argv.slice(2).map(Number);
  // TOC: chapter titles (size 10.0 lines on contents pages)
  const toc = [];
  for (const pg of d.pages.filter(x => x.p >= 2 && x.p <= 5)) for (const l of pageLines(pg)) {
    const t = l.items.map(i => i.s).join(' ').replace(/\s+/g, ' ');
    const m = t.match(/^(\d+)\. (.+?)[ .]+\d+$/); if (m && Math.abs(l.h - 10) < 0.3) toc.push({ no: +m[1], title: m[2].replace(/[ .]+$/, '') });
  }
  const front = p.deepClean(p.parseChapter(0, 6, 7));
  const meta = {
    title: 'Senior Java Architect', subtitle: 'The final-week revision handbook', kicker: 'Interview Study Notes · 12–18+ yrs',
    edition: 'October 2026', baseline: 'Java 21 & 25 LTS (notes on 26/27) · Spring Boot 3.x → 4 · Jakarta EE',
    legend: { star: 'high-frequency question', fire: 'top-company favourite' },
    howto: front.intro, toc
  };
  const chapters = [];
  for (const n of nos) {
    const ch = p.deepClean(p.parseChapter(n, START[n], END(n)));
    fs.writeFileSync(`ch${n}.fragment.json`, JSON.stringify(ch));
    chapters.push(ch);
  }
  fs.writeFileSync('data.json', JSON.stringify({ schema: 1, meta, chapters }));
  console.log('toc', toc.length, toc.map(t => t.no + ' ' + t.title).join(' | '));
  console.log('chapters', chapters.map(c => c.no + ':' + c.topics.length));
});

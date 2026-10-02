// Converts positioned PDF text items into the notes JSON schema.
const fs = require('fs');
const d = require('./pages_1_311.json');
const MONO = new Set(['g_d0_f8', 'g_d0_f10', 'g_d0_f11']);
const NEUT = new Set(['g_d0_f5', 'g_d0_f6', 'g_d0_f13', 'g_d0_f14']);
const BOLD = new Set(['g_d0_f7', 'g_d0_f4']);
const ITAL = new Set(['g_d0_f9']);
const CIRCLED = '①②③④⑤⑥⑦⑧';
const PART_KEYS = ['concept', 'internals', 'code', 'tradeoffs', 'questions', 'scenarios', 'pitfalls', 'angle'];

function groupLines(items) {
  const its = items.filter(i => i.s.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const L = [];
  for (const i of its) {
    let l = L.find(l => Math.abs(l.y - i.y) < 2.2);
    if (!l) { l = { y: i.y, items: [] }; L.push(l); }
    l.items.push(i);
  }
  L.sort((a, b) => b.y - a.y);
  for (const l of L) {
    l.items.sort((a, b) => a.x - b.x);
    const real = l.items.filter(i => !NEUT.has(i.f));
    l.h = Math.max(...real.map(i => i.h), 0) || Math.max(...l.items.map(i => i.h));
    l.code = real.length > 0 && real.every(i => MONO.has(i.f) && i.h < 8);
    l.x = l.items[0].x;
  }
  return L;
}

// Inline markup: `code`, **bold**, *italic*. Adjacent same-style items merge.
function inline(items) {
  let out = '', cur = null, buf = '', end = null;
  const style = i => NEUT.has(i.f) ? 'n' : MONO.has(i.f) ? 'c' : BOLD.has(i.f) ? 'b' : ITAL.has(i.f) ? 'i' : 'n';
  const flush = () => {
    if (!buf) return;
    const t = buf.trim(); const lead = buf.match(/^\s*/)[0] ? ' ' : '', trail = /\s$/.test(buf) ? ' ' : '';
    if (cur === 'c') out += lead + '`' + t + '`' + trail;
    else if (cur === 'b' && t) out += lead + '**' + t + '**' + trail;
    else if (cur === 'i' && t) out += lead + '*' + t + '*' + trail;
    else out += buf;
    buf = '';
  };
  for (const i of items) {
    const st = style(i);
    let sep = '';
    if (end !== null && i.x - end > 0.8) sep = ' ';
    if (st !== cur) { flush(); out += sep; cur = st; buf = i.s; }
    else buf += sep + i.s;
    end = i.x + i.w;
  }
  flush();
  return out.replace(/\s+/g, ' ').replace(/` ([.,;:)?!])/g, '`$1').replace(/\( `/g, '(`').trim();
}

function joinText(a, b) {
  if (!a) return b;
  if (/[A-Za-z]-$/.test(a) && !/-$/.test(a.replace(/-$/, ''))) return a + b;
  if (/\S[—/]$/.test(a)) return a + b;
  if (/` -$/.test(a)) return a.slice(0, -2) + '-' + b;
  return a + ' ' + b;
}

function codeText(lines) {
  const x0 = Math.min(...lines.map(l => l.x));
  const out = []; let prevY = null;
  for (const l of lines) {
    if (prevY !== null && prevY - l.y > 15.5 && !l.pageBreak) out.push('');
    let s = '', prevEnd = -1e9;
    for (const i of l.items) {
      const cw = 0.6 * i.h || 4.5;
      const col = Math.max(0, Math.round((i.x - x0) / (0.6 * (l.h || 7.6))));
      if (s.length && i.x - prevEnd < 0.8) { /* glued */ }
      else if (s.length < col) s += ' '.repeat(col - s.length);
      else if (s.length && !s.endsWith(' ')) s += ' ';
      prevEnd = i.x + i.w;
      s += i.s;
    }
    out.push(s.replace(/\s+$/, ''));
    prevY = l.y;
  }
  // strip common indent
  const ind = Math.min(...out.filter(s => s.trim()).map(s => s.match(/^ */)[0].length));
  return out.map(s => s.slice(ind)).join('\n');
}

function guessLang(t) {
  if (/^\s*(SELECT|CREATE|INSERT|UPDATE|DELETE|WITH|ALTER|EXPLAIN|BEGIN|--)\b/im.test(t) && !/;\s*\}/.test(t) && !/\bclass\b|\brecord\b/.test(t)) return 'sql';
  if (/^\s*(apiVersion|kind|spring|server|management|resilience4j|metadata|spec|services|name|steps|jobs|on|logging|hibernate):/m.test(t) && !/[;{}]\s*$/m.test(t.split('\n').filter(l => !l.trim().startsWith('#')).join('\n'))) return 'yaml';
  if (/^\s*(\$ |#!|java -|jcmd|jstat|kubectl|docker|curl|top -H|asprof|jfr |mvn |gradle|helm |aws |gcloud |terraform )/m.test(t) && !/;\s*$/m.test(t)) return 'bash';
  if (/^\s*(FROM|RUN|COPY|ENTRYPOINT|WORKDIR) /m.test(t) && !/;/.test(t)) return 'dockerfile';
  if (/^\s*(<\?xml|<[a-z]+[ >])/m.test(t) && !/[;{]\s*$/m.test(t)) return 'xml';
  if (/^\s*(resource|provider|variable|module) "/m.test(t)) return 'hcl';
  if (/^\s*[{\[]\s*$/m.test(t) && /"\w+"\s*:/.test(t) && !/;/.test(t)) return 'json';
  return 'java';
}

// Build a table from consecutive small-font text lines.
function buildTable(lines) {
  const first = lines[0];
  const bounds = [];
  let end = null;
  for (const i of first.items) { if (end === null || i.x - end > 6) bounds.push(i.x - 3); end = i.x + i.w; }
  const header = first.items.every(i => BOLD.has(i.f) || NEUT.has(i.f));
  const rows = []; let row = null, prevY = null;
  for (const l of lines) {
    const startsCol0 = l.items[0].x < bounds[1] - 2 || bounds.length === 1;
    if (!row || (prevY - l.y > 15.5 && startsCol0) || l.pageBreak) {
      row = bounds.map(() => []); rows.push(row);
    }
    for (const i of l.items) {
      let c = 0; for (let k = 0; k < bounds.length; k++) if (i.x >= bounds[k] - 1) c = k;
      row[c].push({ ...i, _y: l.y });
    }
    prevY = l.y;
  }
  const cellText = arr => {
    const ls = []; for (const i of arr) { let l = ls.find(l => Math.abs(l.y - i._y) < 2.2); if (!l) { l = { y: i._y, items: [] }; ls.push(l); } l.items.push(i); }
    return ls.reduce((acc, l) => joinText(acc, inline(l.items)), '');
  };
  const out = rows.map(r => r.map(cellText));
  const head = out[0].map(c => c.replace(/\*\*/g, ''));
  return { t: 'table', head, rows: out.slice(1).filter(r => r.map(c => c.replace(/\*\*/g, '')).join('|') !== head.join('|')) };
}

// ---------- main pass: linear stream of lines with page info ----------
function stream(fromPage, toPage) {
  const res = [];
  for (const pg of d.pages.filter(p => p.p >= fromPage && p.p <= toPage)) {
    const items = pg.items.filter(i => i.y > 30 && i.y < 800);
    const lines = groupLines(items);
    const isCheat = lines.some(l => Math.abs(l.h - 11.8) < 0.3);
    if (isCheat) {
      const title = lines.filter(l => Math.abs(l.h - 11.8) < 0.3);
      const rest = items.filter(i => !title.some(t => t.items.includes(i)));
      const left = groupLines(rest.filter(i => i.x < 300)), right = groupLines(rest.filter(i => i.x >= 300));
      title.forEach(l => res.push({ ...l, p: pg.p }));
      [...left, ...right].forEach((l, k) => res.push({ ...l, code: false, p: pg.p, cheat: true }));
    } else {
      lines.forEach((l, k) => res.push({ ...l, p: pg.p, pageBreak: k === 0 }));
    }
  }
  return res;
}

function isTableLine(l) { return !l.code && l.h > 8.0 && l.h < 8.3 && !l.cheat; }

// Convert a run of body lines into blocks.
function blocks(lines) {
  const out = []; let k = 0;
  const last = () => out[out.length - 1];
  while (k < lines.length) {
    const l = lines[k];
    if (l.code) {
      const run = []; while (k < lines.length && lines[k].code) run.push(lines[k++]);
      // split diagram (7.4) vs code (7.6) runs
      const groups = []; for (const r of run) { const kind = r.h < 7.5 ? 'diagram' : 'code'; if (!groups.length || groups[groups.length - 1].kind !== kind) groups.push({ kind, ls: [] }); groups[groups.length - 1].ls.push(r); }
      for (const g of groups) {
        const text = codeText(g.ls);
        const prev = last();
        if (prev && prev.t === g.kind && g.ls[0].pageBreak) prev.text += '\n' + text; // continued across page
        else if (g.kind === 'code') out.push({ t: 'code', lang: guessLang(text), text });
        else out.push({ t: 'diagram', text });
      }
      for (const b of out) if (b.t === 'code') b.lang = guessLang(b.text);
      continue;
    }
    if (isTableLine(l)) {
      const run = []; while (k < lines.length && (isTableLine(lines[k]) || (!lines[k].code && lines[k].h < 8.3 && lines[k].h > 7.9 && !lines[k].cheat))) run.push(lines[k++]);
      const tb = buildTable(run);
      const prev = last();
      if (prev && prev.t === 'table' && run[0].pageBreak && (!tb.head || JSON.stringify(tb.head) === JSON.stringify(prev.head))) prev.rows.push(...tb.rows);
      else out.push(tb);
      continue;
    }
    // prose
    const text = inline(l.items);
    const prev = last();
    const prevLine = lines[k - 1];
    const gap = prevLine && !l.pageBreak ? prevLine.y - l.y : (l.pageBreak ? 14 : 99);
    const bullet = /^[•]/.test(text);
    const numbered = /^\d+\.\s/.test(text) && l.x < 50;
    const labelled = /^(\*\*)?(Scenario|Model answer|Note|Stabilise|Evidence|Fix|Prevent|Typical root causes|Why it happens|Root causes|Fix & prevent)\b/.test(text);
    if (l.cheat) {
      if (l.h > 8.3 && !bullet) { out.push({ t: 'h', text }); k++; continue; }
      if (bullet) { if (!(prev && prev.t === 'ul')) out.push({ t: 'ul', items: [] }); last().items.push(text.replace(/^•\s*/, '')); k++; continue; }
      if (prev && prev.t === 'ul') { const it = prev.items; it[it.length - 1] = joinText(it[it.length - 1], text); }
      else out.push({ t: 'p', text });
      k++; continue;
    }
    if (bullet) {
      // a line may contain several bullets merged
      const parts = text.split(/\s(?=• )/);
      if (!(prev && prev.t === 'ul')) out.push({ t: 'ul', items: [] });
      for (const p of parts) last().items.push(p.replace(/^•\s*/, ''));
    } else if (numbered) {
      if (!(prev && prev.t === 'ol')) out.push({ t: 'ol', items: [] });
      last().items.push(text);
    } else if (prev && (prev.t === 'ul' || prev.t === 'ol') && gap < 15.5 && !labelled) {
      const it = prev.items; it[it.length - 1] = joinText(it[it.length - 1], text);
    } else if (prev && prev.t === 'p' && gap < 15.5 && !labelled) {
      prev.text = joinText(prev.text, text);
    } else out.push({ t: 'p', text });
    k++;
  }
  return out;
}

function markers(s) { return { star: s.includes('★'), fire: s.includes('🔥') }; }
function stripMarks(s) { return s.replace(/[★🔥]/g, '').replace(/\s+/g, ' ').trim(); }

function parseQuestions(bl) {
  const qs = []; const extra = [];
  for (const b of bl) {
    if (b.t !== 'ol') { extra.push(b); continue; }
    for (const raw of b.items) {
      const m = raw.match(/^(\d+)\.\s+(.*)$/); const body = m[2];
      const mk = markers(body.slice(0, 40));
      let rest = body.replace(/^([★🔥]\s*)+/, '');
      const lv = rest.match(/^(\*\*)?(BASIC|ADVANCED|ARCHITECT)(\*\*)?\s+/);
      const level = lv ? lv[2][0] + lv[2].slice(1).toLowerCase() : null;
      if (lv) rest = rest.slice(lv[0].length);
      let idx = rest.indexOf('? — '); let q, a;
      if (idx >= 0) { q = rest.slice(0, idx + 1); a = rest.slice(idx + 4); }
      else { idx = rest.indexOf(' — '); q = idx >= 0 ? rest.slice(0, idx) : rest; a = idx >= 0 ? rest.slice(idx + 3) : ''; }
      qs.push({ n: +m[1], ...mk, level, q: q.trim(), a: a.trim() });
    }
  }
  return { questions: qs, extra };
}

function parseScenarios(bl) {
  const sc = []; const extra = [];
  for (const b of bl) {
    const t = b.t === 'p' ? b.text : null;
    if (t && /^(\*\*)?Scenario\b/.test(t) && !/^(\*\*)?Scenario \d+ —/.test(t)) {
      sc.push({ q: t.replace(/^(\*\*)?Scenario(\s*\d+)?:?(\*\*)?:?\s*/, ''), a: '' });
    } else if (t && /^(\*\*)?Model answer/.test(t) && sc.length) {
      sc[sc.length - 1].a = t.replace(/^(\*\*)?Model answer:?(\*\*)?:?\s*/, '');
    } else if (sc.length && sc[sc.length - 1].a) {
      (sc[sc.length - 1].more ??= []).push(b);
    } else extra.push(b);
  }
  return { scenarios: sc, extra };
}

function parseChapter(no, fromPage, toPage) {
  const L = stream(fromPage, toPage);
  const ch = { id: 'ch' + no, no, title: '', intro: [], topics: [], cheatsheet: [] };
  let topic = null, part = null, bodyLines = [], mode = 'intro';
  const flush = () => {
    if (!bodyLines.length) return;
    const bl = finish(blocks(bodyLines)); bodyLines = [];
    if (mode === 'intro') ch.intro.push(...bl);
    else if (mode === 'cheat') ch.cheatsheet.push(...bl);
    else if (!part) topic.intro.push(...bl);
    else topic.parts[part].push(...bl);
  };
  for (let k = 0; k < L.length; k++) {
    const l = L[k]; const text = l.items.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();
    if (Math.abs(l.h - 21) < 0.5) { ch.title = text.replace(/^\d+\.\s*/, ''); continue; }
    if (Math.abs(l.h - 11.8) < 0.3) { flush(); mode = 'cheat'; continue; }
    if (Math.abs(l.h - 13.9) < 0.3 && !l.code) {
      if (/^\d+\.\d+\s/.test(text) && !l.cheat) {
        flush(); mode = 'topic'; part = null;
        const m = text.match(/^(\d+\.\d+)\s+(.*)$/);
        topic = { id: m[1], title: m[2], star: false, fire: false, intro: [], parts: {} };
        ch.topics.push(topic);
      } else if (topic && !part && L[k - 1] && Math.abs(L[k - 1].h - 13.9) < 0.3) {
        topic.title += ' ' + text;
      } else { flush(); bodyLines = []; (mode === 'topic' ? topic.intro : ch.intro).push({ t: 'h', text }); }
      if (topic) { const mk = markers(topic.title); topic.star ||= mk.star; topic.fire ||= mk.fire; topic.title = stripMarks(topic.title); }
      continue;
    }
    if (Math.abs(l.h - 10.2) < 0.3 && CIRCLED.includes(text[0]) && topic) {
      flush(); part = PART_KEYS[CIRCLED.indexOf(text[0])];
      topic.parts[part] ??= [];
      const tail = text.replace(/^.\s*/, '');
      // heading text variants ("Interview questions 1. ★ BASIC …" merged on one line)
      topic.partTitles ??= {}; topic.partTitles[part] = l.items.length && tail.split(/\s(?=\d+\.\s)/)[0];
      continue;
    }
    bodyLines.push(l);
  }
  flush();
  // post-process parts
  for (const t of ch.topics) {
    if (t.parts.questions) { const r = parseQuestions(t.parts.questions); t.parts.questions = r.questions; if (r.extra.length) t.parts.questionsNotes = r.extra; }
    if (t.parts.scenarios) { const r = parseScenarios(t.parts.scenarios); t.parts.scenarios = r.scenarios; if (r.extra.length) t.parts.scenariosNotes = r.extra; }
    for (const [k, bl] of Object.entries(t.parts)) if (Array.isArray(bl)) for (const b of bl) if (b.t === 'p') b.text = b.text.replace(/^A R C H I T E C T ' S A N G L E\s*/, '');
    // topics without numbered parts (e.g. production scenarios): parse "Scenario N —" subheads from intro
    for (const b of t.intro) if (b.t === 'p' && /^\*\*Scenario \d+ —/.test(b.text)) { b.t = 'h3'; b.text = b.text.replace(/\*\*/g, ''); }
    for (const q of t.parts.questions || []) q.q = q.q.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    for (const q of t.parts.scenarios || []) q.q = q.q.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    for (const b of t.intro) if (b.t === 'p') b.text = b.text.replace(/^A R C H I T E C T ' S A N G L E\s*/, () => { b.angle = true; return ''; });
  }
  return ch;
}

module.exports = { parseChapter, stream, blocks };
if (require.main === module) setImmediate(() => {
  const [no, a, b] = process.argv.slice(2).map(Number);
  const ch = deepClean(parseChapter(no, a, b));
  fs.writeFileSync(`ch${no}.json`, JSON.stringify(ch, null, 1));
  console.log(ch.title, ch.topics.length, ch.topics.map(t => t.id + (t.star ? '★' : '') + (t.fire ? '🔥' : '') + ':' + Object.keys(t.parts).join(',')).join('\n'));
});

// ---- post-processing helpers (unwrap soft-wrapped code lines, split mixed-language blocks)
function unwrap(text) {
  const ls = text.split('\n'), out = [];
  for (let i = 0; i < ls.length; i++) {
    const cur = ls[i], nxt = ls[i + 1];
    if (nxt !== undefined && cur.length >= 96 && /^[a-z)"']/.test(nxt)) { ls[i + 1] = cur + (cur.length >= 104 ? '' : ' ') + nxt; continue; }
    out.push(cur);
  }
  return out.join('\n');
}
const isShell = l => /^\s*(#|-XX|-X|-D|jcmd|jstat|java |\.\/|JAVA_TOOL_OPTIONS|kubectl|docker|curl|helm|mvn|gradle|top |asprof|export |\$ )/.test(l);
function splitLangs(b) {
  const ls = b.text.split('\n'); const segs = []; let cur = null;
  for (const l of ls) {
    let kind = !l.trim() ? null : isShell(l) ? 'bash' : (/^\s*\/\//.test(l) || /[;{}]\s*(\/\/.*)?$/.test(l)) ? 'other' : null;
    if (kind === null) kind = cur ? cur.kind : 'other';
    if (!cur || (cur.kind !== kind && l.trim())) { cur = { kind, ls: [] }; segs.push(cur); }
    cur.ls.push(l);
  }
  if (segs.length < 2 || !segs.some(s => s.kind === 'bash')) return [b];
  return segs.map(s => { const text = s.ls.join('\n').replace(/^\n+|\n+$/g, ''); return { t: 'code', lang: s.kind === 'bash' ? 'bash' : guessLang(text), text }; }).filter(x => x.text);
}
function finish(bl) {
  const out = [];
  for (const b of bl) {
    if (b.t === 'code' || b.t === 'diagram') b.text = unwrap(b.text);
    if (b.t === 'code') { const parts = splitLangs(b); if (parts.length === 1) b.lang = /^\s*#/.test(b.text) && isShell(b.text.split('\n').find(l => l.trim())) ? 'bash' : b.lang; out.push(...parts); }
    else out.push(b);
  }
  return out;
}
module.exports.finish = finish;
function cleanText(s) { return s.replace(/-XX: \+/g, '-XX:+').replace(/\*\* \*\*/g, ' ').replace(/` `/g, ' ').replace(/` ([.,;:)?!])/g, '`$1').replace(/\( `/g, '(`').replace(/\s+/g, ' ').trim(); }
function deepClean(o, key) {
  if (Array.isArray(o)) return o.map(x => deepClean(x, key));
  if (o && typeof o === 'object') { const isCode = o.t === 'code' || o.t === 'diagram'; for (const k in o) o[k] = isCode && k === 'text' ? o[k] : deepClean(o[k], k); return o; }
  if (typeof o === 'string' && !['lang', 't', 'id', 'level'].includes(key)) return cleanText(o);
  return o;
}
module.exports.deepClean = deepClean;

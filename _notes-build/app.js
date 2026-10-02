(() => {
'use strict';

/* =====================================================================
   DATA — everything rendered comes from the JSON block #notes-data
   ===================================================================== */
const DATA = JSON.parse(document.getElementById('notes-data').textContent);
const PARTS = [
  ['concept', '①', 'Concept summary', 'Concept'],
  ['internals', '②', 'How it works internally', 'Internals'],
  ['code', '③', 'Code snippet', 'Code'],
  ['tradeoffs', '④', 'Trade-offs / when NOT to use', 'Trade-offs'],
  ['questions', '⑤', 'Interview questions', 'Questions'],
  ['scenarios', '⑥', 'Scenario-based questions', 'Scenarios'],
  ['pitfalls', '⑦', 'Production pitfalls', 'Pitfalls'],
  ['angle', '⑧', "Architect's angle", "Architect's angle"],
];
const PART = Object.fromEntries(PARTS.map(p => [p[0], p]));
const LEVELS = ['Basic', 'Advanced', 'Architect'];

const chapters = (DATA.chapters || []).slice().sort((a, b) => a.no - b.no);
const chapterByNo = new Map(chapters.map(c => [c.no, c]));
const toc = (DATA.meta && DATA.meta.toc && DATA.meta.toc.length) ? DATA.meta.toc : chapters.map(c => ({ no: c.no, title: c.title }));
const topics = [];          // flat reading order
const topicByKey = new Map();
const topicById = new Map(); // "1.2" -> topic entry
for (const ch of chapters) for (const t of ch.topics || []) {
  const e = { key: `ch${ch.no}-${t.id}`, ch, t, i: topics.length };
  topics.push(e); topicByKey.set(e.key, e); topicById.set(t.id, e);
}
// Chapter 16 extras (rapid-fire, 50 scenarios, plans, glossary, company focus, night-before) are optional
const EX = {};
for (const ch of chapters) if (ch.extras) for (const [k, v] of Object.entries(ch.extras)) EX[k] = v;

/* =====================================================================
   STATE — localStorage with in-memory fallback
   ===================================================================== */
const KEY = 'sja-notes-progress-v1';
const DEFAULTS = () => ({ v: 1, status: {}, bookmarks: {}, notes: {}, srs: {}, stats: {}, drill: {}, plan: { start: null, done: {} }, quiz: [], last: null, settings: { theme: 'auto', font: 100, focus: false, view: 'all', hideAnswers: false, sideStar: false, sideFire: false } });
let S = DEFAULTS();
let storageOK = true;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) S = merge(DEFAULTS(), JSON.parse(raw));
  localStorage.setItem(KEY + ':probe', '1'); localStorage.removeItem(KEY + ':probe');
} catch (e) { storageOK = false; }
function merge(base, add) {
  if (!add || typeof add !== 'object') return base;
  for (const k of Object.keys(add)) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && add[k] && typeof add[k] === 'object' && !Array.isArray(add[k])) base[k] = merge(base[k], add[k]);
    else base[k] = add[k];
  }
  return base;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!storageOK) return;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storageOK = false; renderStorageNotice(); }
  }, 150);
}

/* =====================================================================
   HELPERS
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');
const DAY = 86400000;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function plain(s) { return String(s ?? '').replace(/\*\*|`|\*/g, ''); }
// inline markup used in the data: `code`, **bold**, *italic*
function md(s) {
  const parts = String(s ?? '').split(/(`[^`]*`)/g);
  return parts.map(p => {
    if (p.length > 1 && p.startsWith('`') && p.endsWith('`')) return `<code>${esc(p.slice(1, -1))}</code>`;
    return esc(p).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  }).join('');
}
function marks(o) { return (o.star ? '<span class="marks" title="High-frequency question" aria-label="High-frequency">★</span>' : '') + (o.fire ? '<span class="marks" title="Top-company favourite" aria-label="Top-company favourite">🔥</span>' : ''); }
function levelChip(l) { return l ? `<span class="chip ${l.toLowerCase()}">${esc(l)}</span>` : ''; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200); }
const ICON = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6" fill="currentColor"/></svg>',
  drill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
  mock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  cheat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 15l2 2 4-4"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
};

/* =====================================================================
   BLOCK RENDERING
   ===================================================================== */
let uid = 0;
function renderBlocks(blocks, opts = {}) {
  return (blocks || []).map(b => renderBlock(b, opts)).join('');
}
function renderBlock(b, opts) {
  switch (b.t) {
    case 'p': return b.angle ? `<div class="callout angle"><p class="ctitle">Architect's angle</p><p>${md(b.text)}</p></div>` : `<p>${md(b.text)}</p>`;
    case 'h': return opts.cheat ? `<h3>${md(b.text)}</h3>` : `<h3>${md(b.text)}</h3>`;
    case 'h3': return `<h3 id="${opts.idPrefix || ''}inc-${esc(slug(b.text))}">${md(b.text)}</h3>`;
    case 'ul': return `<ul>${b.items.map(i => `<li>${md(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol>${b.items.map(i => { const m = String(i).match(/^(\d+)\.\s+([\s\S]*)$/); return m ? `<li value="${m[1]}">${md(m[2])}</li>` : `<li>${md(i)}</li>`; }).join('')}</ol>`;
    case 'code': return codeBlock(b.text, b.lang);
    case 'diagram': return `<div class="diagram-wrap"><div class="lbl">Diagram</div><pre class="diagram" tabindex="0" aria-label="ASCII diagram"><code>${esc(b.text)}</code></pre></div>`;
    case 'table': return tableBlock(b);
    default: return b.text ? `<p>${md(b.text)}</p>` : '';
  }
}
function slug(s) { return plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48); }
function codeBlock(text, lang) {
  const id = 'code-' + (++uid);
  const l = lang || 'plaintext';
  return `<div class="code" data-lang="${esc(l)}"><div class="code-bar"><span>${esc(l)}</span><span class="sp"></span>` +
    `<button type="button" data-act="wrap" aria-pressed="false" aria-controls="${id}">Wrap</button>` +
    `<button type="button" data-act="copy" aria-controls="${id}">Copy</button></div>` +
    `<pre tabindex="0" aria-label="${esc(l)} code"><code id="${id}" class="language-${esc(l)}">${esc(text)}</code></pre></div>`;
}
function tableBlock(b) {
  const head = b.head ? `<thead><tr>${b.head.map(h => `<th scope="col">${md(h)}</th>`).join('')}</tr></thead>` : '';
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table${b.head ? ': ' + esc(plain(b.head.join(', '))) : ''}"><table>${head}<tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function highlightIn(root) {
  if (!window.hljs) return;
  $$('pre code[class^="language-"]', root).forEach(el => {
    if (el.dataset.hl) return;
    const lang = el.className.replace('language-', '');
    if (lang === 'plaintext' || !hljs.getLanguage(lang)) return;
    try { el.innerHTML = hljs.highlight(el.textContent, { language: lang, ignoreIllegals: true }).value; el.dataset.hl = '1'; } catch (e) { /* leave plain */ }
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.code-bar button');
  if (!b) return;
  const code = document.getElementById(b.getAttribute('aria-controls'));
  if (b.dataset.act === 'copy') {
    const txt = code.textContent;
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
    else fallbackCopy(txt, done);
  } else {
    const box = b.closest('.code'); const on = !box.classList.contains('wrap');
    box.classList.toggle('wrap', on); b.setAttribute('aria-pressed', String(on));
  }
});
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the text manually'); }
  ta.remove();
}

/* =====================================================================
   DERIVED COLLECTIONS: questions, scenarios, cards
   ===================================================================== */
const ALL_Q = [];   // interview questions
const ALL_SC = [];  // scenarios (topic ⑥ + incident write-ups + 16.2)
for (const e of topics) {
  const p = e.t.parts || {};
  (p.questions || []).forEach((q, i) => ALL_Q.push({ id: `q|${e.t.id}|${q.n || i + 1}`, e, q, anchor: `q${q.n || i + 1}` }));
  (p.scenarios || []).forEach((s, i) => ALL_SC.push({ id: `s|${e.t.id}|${i + 1}`, e, prompt: s.q, answerHtml: `<p>${md(s.a)}</p>` + renderBlocks(s.more), answerText: s.a, anchor: `s${i + 1}` }));
  // narrative incident topics: "Scenario N — …" sub-headings in the topic intro
  const intro = e.t.intro || []; let cur = null;
  intro.forEach(b => {
    if (b.t === 'h3') { cur = { id: `i|${e.t.id}|${slug(b.text)}`, e, prompt: b.text, blocks: [], anchor: 'inc-' + slug(b.text) }; ALL_SC.push(cur); }
    else if (cur && !b.angle) cur.blocks.push(b);
    else if (b.angle) cur = null;
  });
}
for (const s of ALL_SC) if (s.blocks) { s.answerHtml = renderBlocks(s.blocks); s.answerText = s.blocks.map(b => b.text || (b.items || []).join(' ')).join(' '); }
(EX.scenarios || []).forEach((s, i) => ALL_SC.push({ id: `x|${s.n || i + 1}`, e: null, ext: true, section: s.section, star: s.star, fire: s.fire, prompt: s.q, answerHtml: renderBlocks(s.blocks) || `<p>${md(s.a)}</p>`, answerText: s.a || '', ref: s.ref }));

function cardsFor(source) {
  if (source === 'rapid') return (EX.rapidfire || []).map(r => ({ id: `r|${r.n}`, front: r.q, back: r.a, meta: r.section, star: r.star, fire: r.fire, ch: refChapter(r.a), topic: refTopic(r.a) }));
  if (source === 'glossary') return (EX.glossary || []).map(g => ({ id: `g|${g.term}`, front: g.term, back: g.def, meta: 'Glossary' }));
  return ALL_Q.map(x => ({ id: x.id, front: x.q.q, back: x.q.a, meta: `${x.e.t.id} · ${x.e.t.title}`, level: x.q.level, star: x.q.star, fire: x.q.fire, ch: x.e.ch.no, topic: x.e.t.id, route: `#${x.e.key}/${x.anchor}` }));
}
function refTopic(s) { const m = String(s || '').match(/→\s*(\d+\.\d+)/); return m ? m[1] : null; }
function refChapter(s) { const t = refTopic(s); return t ? +t.split('.')[0] : null; }

/* =====================================================================
   PROGRESS HELPERS
   ===================================================================== */
const statusOf = key => S.status[key] || 'none';
function chapterProgress(ch) {
  const ts = ch.topics || []; let c = 0, r = 0;
  ts.forEach(t => { const s = statusOf(`ch${ch.no}-${t.id}`); if (s === 'confident') c++; else if (s === 'reading') r++; });
  return { total: ts.length, c, r };
}
function overall() { let total = 0, c = 0, r = 0; chapters.forEach(ch => { const p = chapterProgress(ch); total += p.total; c += p.c; r += p.r; }); return { total, c, r }; }
function bar(p) { const t = p.total || 1; return `<div class="bar" role="img" aria-label="${p.c} confident, ${p.r} reading of ${p.total}"><i class="c" style="width:${(p.c / t) * 100}%"></i><i class="r" style="width:${(p.r / t) * 100}%"></i></div>`; }
function bumpStat(topicId, field, inc = 1) { if (!topicId) return; const s = S.stats[topicId] ||= {}; s[field] = (s[field] || 0) + inc; save(); }
function weakAreas() {
  const out = [];
  for (const [tid, s] of Object.entries(S.stats)) {
    const e = topicById.get(tid); if (!e) continue;
    const fn = s.fn || 0, fa = s.fa || 0, qn = s.qn || 0, qc = s.qc || 0, dn = s.dn || 0, ds = s.ds || 0;
    const reasons = []; let score = 0;
    if (fn >= 3 && fa / fn >= 0.34) { reasons.push(`flashcards: ${fa}/${fn} "Again"`); score += fa / fn; }
    if (qn >= 3 && qc / qn < 0.7) { reasons.push(`quiz: ${qc}/${qn} correct`); score += 1 - qc / qn; }
    if (dn >= 1 && ds / dn <= 2.5) { reasons.push(`scenario self-rating ${(ds / dn).toFixed(1)}/5`); score += (5 - ds / dn) / 5; }
    if (reasons.length) out.push({ e, reasons, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* =====================================================================
   SIDEBAR
   ===================================================================== */
const MODES = [
  ['home', 'Home', ICON.home], ['explore', 'Filter', ICON.filter], ['flashcards', 'Flashcards', ICON.cards], ['quiz', 'Quiz', ICON.quiz],
  ['drill', 'Scenarios', ICON.drill], ['mock', 'Mock', ICON.mock], ['cheatsheets', 'Cheat sheets', ICON.cheat], ['planner', 'Planner', ICON.plan], ['progress', 'Progress', ICON.progress],
];
const openChapters = new Set();
function renderSidebar() {
  const r = route();
  const curTopic = r.topic ? r.topic.key : null;
  const curCh = r.ch ? r.ch.no : (r.topic ? r.topic.ch.no : null);
  if (curCh) openChapters.add(curCh);
  const modes = MODES.map(([k, l, i]) => `<a href="#${k}" ${r.name === k ? 'aria-current="page"' : ''}>${i}<span>${l}</span></a>`).join('');
  const items = toc.map(tc => {
    const ch = chapterByNo.get(tc.no);
    const open = openChapters.has(tc.no);
    if (!ch) return `<li class="toc-ch"><button type="button" aria-disabled="true" title="Not loaded yet"><span class="num">${tc.no}</span><span>${esc(tc.title)}<span class="pending">Not loaded yet</span></span></button></li>`;
    const p = chapterProgress(ch);
    const ts = (ch.topics || []).filter(t => (!S.settings.sideStar || t.star) && (!S.settings.sideFire || t.fire));
    const list = ts.map(t => {
      const key = `ch${ch.no}-${t.id}`; const st = statusOf(key);
      return `<li><a href="#${key}" ${key === curTopic ? 'aria-current="page"' : ''}><span class="tid">${esc(t.id)}</span><span>${esc(t.title)} ${marks(t)}</span><span class="st ${st}" title="${st === 'none' ? 'Not started' : st}" aria-label="${st === 'none' ? 'Not started' : st}"></span></a></li>`;
    }).join('');
    const extra = (ch.cheatsheet && ch.cheatsheet.length) ? `<li><a href="#ch${ch.no}-cheat" ${r.name === 'cheat' && r.ch && r.ch.no === ch.no ? 'aria-current="page"' : ''}><span class="tid">✎</span><span>Quick Revision Cheat Sheet</span></a></li>` : '';
    return `<li class="toc-ch loaded"><button type="button" aria-expanded="${open}" aria-controls="toc-${ch.no}" data-ch="${ch.no}"><span class="num">${ch.no}</span><span style="flex:1;min-width:0">${esc(ch.title || tc.title)}<span class="mini" aria-hidden="true"><i style="width:${p.total ? ((p.c + p.r * .5) / p.total) * 100 : 0}%"></i></span></span><span class="chev">${ICON.chev}</span></button>` +
      `<ul class="toc-topics" id="toc-${ch.no}" ${open ? '' : 'hidden'}><li><a href="#ch${ch.no}" ${r.name === 'chapter' && r.ch && r.ch.no === ch.no ? 'aria-current="page"' : ''}><span class="tid">▸</span><span>Chapter overview</span></a></li>${list || '<li class="muted" style="font-size:.8rem;padding:4px 8px">No topics match the filter</li>'}${extra}</ul></li>`;
  }).join('');
  $('#sidebar').innerHTML = `<nav aria-label="Study modes"><div class="side-modes">${modes}</div></nav>` +
    `<div class="side-filter" role="group" aria-label="Filter topics"><span>Show</span><button type="button" class="chip-toggle" data-side="sideStar" aria-pressed="${S.settings.sideStar}">★ only</button><button type="button" class="chip-toggle" data-side="sideFire" aria-pressed="${S.settings.sideFire}">🔥 only</button></div>` +
    `<nav aria-label="Chapters"><ul class="toc">${items}</ul></nav>`;
  const cur = $('#sidebar [aria-current="page"]:not(.side-modes a)');
  if (cur && !renderSidebar.didScroll) { cur.scrollIntoView({ block: 'center' }); renderSidebar.didScroll = true; }
}
$('#sidebar').addEventListener('click', e => {
  const b = e.target.closest('button[data-ch]');
  if (b) { const n = +b.dataset.ch; openChapters.has(n) ? openChapters.delete(n) : openChapters.add(n); renderSidebar(); return; }
  const f = e.target.closest('button[data-side]');
  if (f) { S.settings[f.dataset.side] = !S.settings[f.dataset.side]; save(); renderSidebar(); return; }
  if (e.target.closest('a')) closeDrawer();
});

/* =====================================================================
   ROUTER
   ===================================================================== */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [path, sub] = h.split('/');
  let m;
  if (!path || path === 'home') return { name: 'home' };
  if ((m = path.match(/^ch(\d+)-cheat$/))) return { name: 'cheat', ch: chapterByNo.get(+m[1]) };
  if ((m = path.match(/^ch(\d+)-(\d+\.\d+)$/))) { const t = topicByKey.get(path); return t ? { name: 'topic', topic: t, sub } : { name: 'missing', path }; }
  if ((m = path.match(/^ch(\d+)$/))) { const ch = chapterByNo.get(+m[1]); return ch ? { name: sub === 'print' ? 'print' : 'chapter', ch } : { name: 'missing', path, chNo: +m[1] }; }
  return { name: path, sub };
}
let cleanup = [];
function render() {
  cleanup.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); cleanup = [];
  const r = route();
  const v = view();
  v.className = 'content';
  const R = {
    home: renderHome, chapter: renderChapter, topic: renderTopic, cheat: renderChapterCheat, print: renderPrintChapter,
    explore: renderExplore, flashcards: renderFlashcards, quiz: renderQuiz, drill: renderDrill, mock: renderMock,
    cheatsheets: renderCheatsheets, planner: renderPlanner, progress: renderProgress, guide: renderGuide,
    glossary: renderGlossary, rapid: renderRapid,
  }[r.name] || renderMissing;
  R(r, v);
  highlightIn(v);
  renderSidebar();
  if (r.name !== 'topic' || !r.sub) window.scrollTo(0, 0);
  const h1 = $('h1', v); document.title = (h1 ? plain(h1.textContent) + ' · ' : '') + 'Senior Java Architect Notes';
  if (r.name === 'topic' || r.name === 'chapter') { S.last = location.hash; save(); }
  if (pendingFocus) { const pf = pendingFocus; pendingFocus = null; setTimeout(() => jumpTo(pf.id, pf.terms), 30); }
  else if (r.name === 'topic' && r.sub) setTimeout(() => jumpTo(r.sub, null), 30);
  $('#view').focus({ preventScroll: true });
}
window.addEventListener('hashchange', render);
function renderMissing(r, v) {
  const tc = r.chNo && toc.find(t => t.no === r.chNo);
  v.innerHTML = tc ? `<h1>${tc.no}. ${esc(tc.title)}</h1><div class="empty">This chapter hasn't been added to the data block yet. ${loadedSummary()}</div>`
    : `<h1>Not found</h1><div class="empty">No section matches <code>${esc(location.hash)}</code>. <a href="#home">Go home</a>.</div>`;
}
function loadedSummary() { return `Loaded: chapter${chapters.length === 1 ? '' : 's'} ${chapters.map(c => c.no).join(', ') || 'none'} of ${toc.length}.`; }

/* =====================================================================
   HOME
   ===================================================================== */
function renderHome(r, v) {
  const m = DATA.meta || {};
  const o = overall();
  const due = Object.values(S.srs).filter(s => s.due <= Date.now()).length;
  const weak = weakAreas().slice(0, 5);
  const bms = Object.keys(S.bookmarks).filter(k => topicByKey.has(k));
  const last = S.last && S.last !== '#home' ? S.last : null;
  const lastE = last && topicByKey.get(last.replace('#', '').split('/')[0]);
  v.innerHTML = `
  <section class="hero" aria-labelledby="hero-title">
    <div class="kicker">${esc(m.kicker || '')}</div>
    <h1 id="hero-title">${esc(m.title || 'Senior Java Architect')}</h1>
    <p>${esc(m.subtitle || '')}${m.edition ? ' · ' + esc(m.edition) : ''}</p>
    <p class="legend-line">${esc(m.baseline || '')}</p>
    <p class="legend-line">★ = ${esc(m.legend ? m.legend.star : '')} · 🔥 = ${esc(m.legend ? m.legend.fire : '')}</p>
  </section>
  ${storageOK ? '' : `<p class="notice" style="margin-top:14px">Browser storage is unavailable, so progress lives only in this tab. Use <a href="#progress">Progress → Export</a> to keep it.</p>`}
  <div class="grid cols-3" style="margin-top:16px">
    <div class="card"><div class="stat">${o.c}<small>topics confident</small></div></div>
    <div class="card"><div class="stat">${o.r}<small>topics in progress</small></div></div>
    <div class="card"><div class="stat">${due}<small>flashcards due</small></div></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="row between"><h2 style="margin:0;font-size:1.05rem">Overall progress</h2><span class="muted" style="font-size:.85rem">${o.c + o.r}/${o.total} topics touched · ${loadedSummary()}</span></div>
    <div style="margin-top:10px">${bar(o)}</div><div class="legend" style="margin-top:6px"><span class="lc">Confident</span><span class="lr">Reading</span><span>Not started</span></div>
  </div>
  <div class="row" style="margin-top:14px">
    ${lastE ? `<a class="btn primary" href="${esc(last)}">Continue: ${esc(lastE.t.id)} ${esc(lastE.t.title)}</a>` : (topics[0] ? `<a class="btn primary" href="#${topics[0].key}">Start reading: ${esc(topics[0].t.id)} ${esc(topics[0].t.title)}</a>` : '')}
    <a class="btn" href="#flashcards">${ICON.cards} Flashcards</a><a class="btn" href="#drill">${ICON.drill} Scenario drill</a><a class="btn" href="#guide">How to use these notes</a>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><h2 style="margin-top:0;font-size:1.05rem">Today's tasks</h2>${todayTasks()}</div>
    <div class="card"><h2 style="margin-top:0;font-size:1.05rem">Weak areas</h2>${weak.length ? `<ul>${weak.map(w => `<li><a href="#${w.e.key}">${esc(w.e.t.id)} ${esc(w.e.t.title)}</a><br><span class="muted" style="font-size:.82rem">${esc(w.reasons.join(' · '))}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing flagged yet. Topics show up here after low quiz scores, repeated "Again" on flashcards, or low scenario self-ratings.</p>'}</div>
  </div>
  ${bms.length ? `<div class="card" style="margin-top:14px"><h2 style="margin-top:0;font-size:1.05rem">Bookmarks</h2><ul>${bms.map(k => { const e = topicByKey.get(k); return `<li><a href="#${k}">${esc(e.t.id)} ${esc(e.t.title)}</a></li>`; }).join('')}</ul></div>` : ''}
  <h2>Chapters</h2>
  <ul class="topic-list">${toc.map(tc => { const ch = chapterByNo.get(tc.no); const p = ch ? chapterProgress(ch) : null;
    return `<li>${ch ? `<a href="#ch${tc.no}"><span class="tid">${tc.no}.</span>${esc(tc.title)}</a><span style="width:120px" class="hide-sm">${bar(p)}</span><span class="status-pill">${p.c + p.r}/${p.total}</span>` : `<span style="flex:1;min-width:0;color:var(--muted)"><span class="tid">${tc.no}.</span>${esc(tc.title)}</span><span class="status-pill">Not loaded</span>`}</li>`; }).join('')}</ul>`;
}
function todayTasks() {
  const plans = EX.plans;
  if (!plans || !plans.d7) return `<p class="muted">The 7-day and 30-day plans come from section 16.4 and show up here once Chapter 16 is loaded. Meanwhile: ${Object.values(S.srs).filter(s => s.due <= Date.now()).length} flashcards due, and <a href="#drill">one scenario drill</a> is a good daily habit.</p>`;
  const d = planDay();
  if (!d) return `<p class="muted">Pick a start date in the <a href="#planner">Planner</a> to get daily tasks.</p>`;
  const rows = planRows(plans.d7);
  if (d.n <= rows.length) { const row = rows[d.n - 1]; return `<p><strong>Day ${d.n} of 7</strong></p>${planChecklist('d7', row, d.n - 1)}<p><a href="#planner">Open planner</a></p>`; }
  return `<p class="muted">The 7-day plan finished on ${new Date(S.plan.start + 6 * DAY).toLocaleDateString()}. <a href="#planner">Open planner</a></p>`;
}

/* =====================================================================
   CHAPTER OVERVIEW + CHEAT SHEET + PRINT
   ===================================================================== */
function renderChapter(r, v) {
  const ch = r.ch; const p = chapterProgress(ch);
  v.innerHTML = `<div class="crumbs"><a href="#home">Home</a> › Chapter ${ch.no}</div>
  <h1>${ch.no}. ${esc(ch.title)}</h1>
  ${renderBlocks(ch.intro)}
  <div class="card" style="margin:14px 0"><div class="row between"><strong>Chapter progress</strong><span class="muted">${p.c} confident · ${p.r} reading · ${p.total} topics</span></div><div style="margin-top:8px">${bar(p)}</div></div>
  <div class="row no-print"><a class="btn" href="#ch${ch.no}-cheat">${ICON.cheat} Cheat sheet</a><a class="btn" href="#ch${ch.no}/print">${ICON.print} Print this chapter</a><a class="btn" href="#flashcards">${ICON.cards} Flashcards</a></div>
  <h2>Topics</h2>
  <ul class="topic-list">${(ch.topics || []).map(t => { const k = `ch${ch.no}-${t.id}`; const st = statusOf(k);
    return `<li><a href="#${k}"><span class="tid">${esc(t.id)}</span>${esc(t.title)} ${marks(t)}</a>${S.bookmarks[k] ? '<span title="Bookmarked" aria-label="Bookmarked">🔖</span>' : ''}<span class="status-pill ${st}">${st === 'none' ? 'Not started' : st === 'reading' ? 'Reading' : 'Confident'}</span></li>`; }).join('')}</ul>`;
}
function renderChapterCheat(r, v) {
  const ch = r.ch;
  if (!ch) return renderMissing(r, v);
  v.innerHTML = `<div class="crumbs"><a href="#home">Home</a> › <a href="#ch${ch.no}">Chapter ${ch.no}</a> › Cheat sheet</div>
  <h1>Chapter ${ch.no} — Quick Revision Cheat Sheet</h1>
  <div class="row no-print" style="margin-bottom:12px"><button class="btn" type="button" data-print>${ICON.print} Print</button><a class="btn" href="#cheatsheets">All cheat sheets</a></div>
  <div class="cheat">${renderBlocks(ch.cheatsheet, { cheat: true })}</div>`;
}
function renderPrintChapter(r, v) {
  const ch = r.ch; v.className = 'content';
  v.innerHTML = `<div class="crumbs no-print"><a href="#ch${ch.no}">Back to chapter ${ch.no}</a> · <button class="btn small" type="button" data-print>${ICON.print} Print</button></div>
  <h1>${ch.no}. ${esc(ch.title)}</h1>${renderBlocks(ch.intro)}
  ${(ch.topics || []).map(t => `<section class="topic-print"><h2>${esc(t.id)} ${esc(t.title)} ${marks(t)}</h2>${topicBody({ ch, t, key: `ch${ch.no}-${t.id}` }, { print: true })}</section>`).join('')}
  ${ch.cheatsheet && ch.cheatsheet.length ? `<section class="topic-print"><h2>Chapter ${ch.no} — Quick Revision Cheat Sheet</h2><div class="cheat">${renderBlocks(ch.cheatsheet, { cheat: true })}</div></section>` : ''}`;
  highlightIn(v);
  setTimeout(() => window.print(), 400);
}
document.addEventListener('click', e => { if (e.target.closest('[data-print]')) window.print(); });

/* =====================================================================
   TOPIC (READ MODE)
   ===================================================================== */
function partHtml(e, key, opts = {}) {
  const p = e.t.parts[key];
  const notes = e.t.parts[key + 'Notes'];
  const hide = S.settings.hideAnswers && !opts.print;
  if (key === 'questions') {
    return `<ol class="qa">${p.map((q, i) => {
      const id = `q${q.n || i + 1}`;
      return `<li id="${id}"><div class="qhead"><span class="qn">${q.n || i + 1}.</span>${marks(q)}${levelChip(q.level)}</div><div class="q">${md(q.q)}</div>` +
        (hide ? `<button type="button" class="reveal" aria-expanded="false" aria-controls="${id}-a">Show answer</button>` : '') +
        `<div class="a" id="${id}-a" ${hide ? 'hidden' : ''}>${md(q.a)}</div></li>`;
    }).join('')}</ol>${renderBlocks(notes)}`;
  }
  if (key === 'scenarios') {
    return p.map((s, i) => {
      const id = `s${i + 1}`;
      return `<div class="callout scenario" id="${id}"><p class="ctitle">Scenario</p><p><strong>${md(s.q)}</strong></p>` +
        (hide ? `<button type="button" class="reveal" aria-expanded="false" aria-controls="${id}-a">Show model answer</button>` : '') +
        `<div id="${id}-a" ${hide ? 'hidden' : ''}><p class="ctitle">Model answer</p><p>${md(s.a)}</p>${renderBlocks(s.more)}</div></div>`;
    }).join('') + renderBlocks(notes);
  }
  const inner = renderBlocks(p);
  if (key === 'tradeoffs') return `<div class="callout tradeoffs"><p class="ctitle">Trade-offs</p>${inner}</div>`;
  if (key === 'pitfalls') return `<div class="callout pitfalls"><p class="ctitle">Pitfalls</p>${inner}</div>`;
  if (key === 'angle') return `<div class="callout angle"><p class="ctitle">Architect's angle</p>${inner}</div>`;
  return inner;
}
function topicBody(e, opts = {}) {
  const t = e.t; const keys = PARTS.map(p => p[0]).filter(k => t.parts && t.parts[k] && t.parts[k].length);
  const only = opts.only;
  let html = renderBlocks(t.intro, { idPrefix: '' });
  html += keys.filter(k => !only || only === k).map(k => {
    const [, n, label] = PART[k]; const title = (t.partTitles && t.partTitles[k]) || label;
    if (opts.print) return `<h3>${n} ${esc(title)}</h3>${partHtml(e, k, opts)}`;
    const open = !(S.collapsed && S.collapsed[e.key + ':' + k]);
    return `<section class="part" id="part-${k}" aria-labelledby="ph-${k}" data-part="${k}"><h2 id="ph-${k}"><button type="button" class="part-toggle" aria-expanded="${open}" aria-controls="pb-${k}"><span class="pn" aria-hidden="true">${n}</span><span>${esc(title)}</span><span class="chev">${ICON.chev}</span></button></h2><div class="part-body" id="pb-${k}" ${open ? '' : 'hidden'}>${partHtml(e, k, opts)}</div></section>`;
  }).join('');
  return html;
}
function renderTopic(r, v) {
  const e = r.topic; const t = e.t; const ch = e.ch;
  if (statusOf(e.key) === 'none') { S.status[e.key] = 'reading'; save(); }
  const keys = PARTS.map(p => p[0]).filter(k => t.parts && t.parts[k] && t.parts[k].length);
  let sel = S.settings.view === 'tabs' && keys.length ? (keys.includes(S.tabFor && S.tabFor[e.key]) ? S.tabFor[e.key] : keys[0]) : 'all';
  if (r.sub && /^(part-)?([a-z]+)$/.test(r.sub)) { const k = r.sub.replace('part-', ''); if (keys.includes(k) && S.settings.view === 'tabs') sel = k; }
  if (r.sub && /^q\d+/.test(r.sub) && S.settings.view === 'tabs') sel = 'questions';
  if (r.sub && /^s\d+/.test(r.sub) && S.settings.view === 'tabs') sel = 'scenarios';
  const prev = topics[e.i - 1], next = topics[e.i + 1];
  const st = statusOf(e.key);
  const tabs = keys.length ? `<div class="tabs no-print" role="tablist" aria-label="Topic parts">` +
    `<button role="tab" type="button" id="tab-all" aria-selected="${sel === 'all'}" aria-controls="topic-panel" data-tab="all" tabindex="${sel === 'all' ? 0 : -1}">All parts</button>` +
    keys.map(k => `<button role="tab" type="button" id="tab-${k}" aria-selected="${sel === k}" aria-controls="topic-panel" data-tab="${k}" tabindex="${sel === k ? 0 : -1}">${PART[k][1]} ${esc(PART[k][3])}</button>`).join('') + `</div>` : '';
  v.innerHTML = `<div class="crumbs"><a href="#home">Home</a> › <a href="#ch${ch.no}">Chapter ${ch.no}. ${esc(ch.title)}</a></div>
  <header class="topic-head">
    <h1><span class="tid">${esc(t.id)}</span> ${esc(t.title)} <span class="badge">${marks(t)}</span></h1>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Topic status">${[['none', 'Not started'], ['reading', 'Reading'], ['confident', 'Confident']].map(([k, l]) => `<button type="button" data-status="${k}" aria-pressed="${st === k}">${l}</button>`).join('')}</div>
      <button type="button" class="btn small" data-bookmark aria-pressed="${!!S.bookmarks[e.key]}">${ICON.bookmark}<span>${S.bookmarks[e.key] ? 'Bookmarked' : 'Bookmark'}</span></button>
      <label class="check"><input type="checkbox" data-hide ${S.settings.hideAnswers ? 'checked' : ''}> Hide answers</label>
      <div class="seg" role="group" aria-label="Layout"><button type="button" data-viewmode="all" aria-pressed="${S.settings.view !== 'tabs'}">Accordions</button><button type="button" data-viewmode="tabs" aria-pressed="${S.settings.view === 'tabs'}">Tabs</button></div>
      <a class="btn small" href="#ch${ch.no}/print">${ICON.print}<span class="hide-sm">Print chapter</span></a>
    </div>
  </header>
  ${tabs}
  <div id="topic-panel" role="tabpanel" aria-labelledby="tab-${sel}">${sel === 'all' ? topicBody(e) : topicBody({ ...e, t: { ...t, intro: [] } }, { only: sel })}</div>
  <section class="notes-box card" aria-labelledby="notes-h"><div class="row between"><h2 id="notes-h" style="margin:0;font-size:1rem">My notes</h2><span class="saved" aria-live="polite"></span></div>
    <label class="sr-only" for="notes-ta">Personal notes for ${esc(t.id)}</label><textarea id="notes-ta" placeholder="Your own notes, war stories and numbers for this topic…">${esc(S.notes[e.key] || '')}</textarea></section>
  <nav class="pager" aria-label="Previous and next topic">${prev ? `<a class="prev" href="#${prev.key}"><small>← Previous (k)</small>${esc(prev.t.id)} ${esc(prev.t.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="#${next.key}"><small>Next (j) →</small>${esc(next.t.id)} ${esc(next.t.title)}</a>` : ''}</nav>`;

  // events
  v.querySelector('.toolbar').addEventListener('click', ev => {
    const s = ev.target.closest('[data-status]');
    if (s) { S.status[e.key] = s.dataset.status; save(); $$('[data-status]', v).forEach(b => b.setAttribute('aria-pressed', String(b === s))); renderSidebar(); return; }
    const bm = ev.target.closest('[data-bookmark]');
    if (bm) { if (S.bookmarks[e.key]) delete S.bookmarks[e.key]; else S.bookmarks[e.key] = Date.now(); save(); bm.setAttribute('aria-pressed', String(!!S.bookmarks[e.key])); bm.querySelector('span').textContent = S.bookmarks[e.key] ? 'Bookmarked' : 'Bookmark'; toast(S.bookmarks[e.key] ? 'Bookmarked' : 'Bookmark removed'); return; }
    const vm = ev.target.closest('[data-viewmode]');
    if (vm) { S.settings.view = vm.dataset.viewmode; save(); render(); }
  });
  $('[data-hide]', v).addEventListener('change', ev => { S.settings.hideAnswers = ev.target.checked; save(); render(); });
  const tl = $('.tabs', v);
  if (tl) {
    tl.addEventListener('click', ev => {
      const b = ev.target.closest('[role="tab"]'); if (!b) return;
      const k = b.dataset.tab;
      if (S.settings.view !== 'tabs' || k === 'all') {
        if (k === 'all') { if (S.settings.view === 'tabs') { S.settings.view = 'all'; save(); render(); } else window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        const sec = document.getElementById('part-' + k);
        if (sec) { const tg = $('.part-toggle', sec); if (tg.getAttribute('aria-expanded') === 'false') tg.click(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      (S.tabFor ||= {})[e.key] = k; save();
      $('#topic-panel', v).innerHTML = topicBody({ ...e, t: { ...t, intro: [] } }, { only: k });
      $('#topic-panel', v).setAttribute('aria-labelledby', 'tab-' + k);
      $$('[role="tab"]', tl).forEach(x => { const on = x === b; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
      highlightIn(v);
    });
    tl.addEventListener('keydown', ev => {
      const tabsEls = $$('[role="tab"]', tl); const i = tabsEls.indexOf(document.activeElement); if (i < 0) return;
      let n = null;
      if (ev.key === 'ArrowRight') n = (i + 1) % tabsEls.length; else if (ev.key === 'ArrowLeft') n = (i - 1 + tabsEls.length) % tabsEls.length;
      else if (ev.key === 'Home') n = 0; else if (ev.key === 'End') n = tabsEls.length - 1;
      if (n !== null) { ev.preventDefault(); tabsEls[n].focus(); tabsEls[n].click(); }
    });
  }
  const ta = $('#notes-ta', v); let nt;
  ta.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => { const val = ta.value; if (val.trim()) S.notes[e.key] = val; else delete S.notes[e.key]; save(); $('.saved', v).textContent = storageOK ? 'Saved' : 'Saved in memory (export to keep)'; }, 400); });
  // scroll-spy: highlight the part in view
  if (sel === 'all' && 'IntersectionObserver' in window && tl) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { const k = en.target.dataset.part; $$('[role="tab"]', tl).forEach(x => x.classList.toggle('inview', x.dataset.tab === k)); const act = $(`[data-tab="${k}"]`, tl); if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } });
    }, { rootMargin: '-120px 0px -60% 0px' });
    $$('.part', v).forEach(s => io.observe(s));
    cleanup.push(() => io.disconnect());
  }
}
// accordion + reveal (delegated: works in topic, explore and print views)
document.addEventListener('click', e => {
  const tg = e.target.closest('.part-toggle');
  if (tg) {
    const open = tg.getAttribute('aria-expanded') !== 'true';
    tg.setAttribute('aria-expanded', String(open));
    const body = document.getElementById(tg.getAttribute('aria-controls')); if (body) body.hidden = !open;
    const r = route(); const k = tg.closest('.part') && tg.closest('.part').dataset.part;
    if (r.topic && k) { S.collapsed ||= {}; if (open) delete S.collapsed[r.topic.key + ':' + k]; else S.collapsed[r.topic.key + ':' + k] = 1; save(); }
    return;
  }
  const rv = e.target.closest('.reveal');
  if (rv) { const a = document.getElementById(rv.getAttribute('aria-controls')); if (a) { a.hidden = false; rv.remove(); a.focus && a.setAttribute('tabindex', '-1'); a.focus(); } }
});

/* jump to an anchor inside the current view and highlight search terms */
let pendingFocus = null;
function jumpTo(id, terms) {
  let el = document.getElementById(id) || document.getElementById('part-' + id);
  if (!el) return;
  // make sure it is visible (collapsed accordion / hidden answer)
  const body = el.closest('.part-body'); if (body && body.hidden) { const tg = document.querySelector(`[aria-controls="${body.id}"]`); if (tg) tg.click(); }
  $$('[hidden]', el).forEach(h => { if (h.id && h.id.endsWith('-a')) { h.hidden = false; const b = el.querySelector(`.reveal[aria-controls="${h.id}"]`); if (b) b.remove(); } });
  if (terms && terms.length) markTerms(el, terms);
  el.scrollIntoView({ block: 'center' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function markTerms(root, terms) {
  const re = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('mark,script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    if (!re.test(n.nodeValue)) return; re.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
    s.replace(re, (m, _g, off) => { frag.appendChild(document.createTextNode(s.slice(last, off))); const mk = document.createElement('mark'); mk.className = 'hit'; mk.textContent = m; frag.appendChild(mk); last = off + m.length; return m; });
    frag.appendChild(document.createTextNode(s.slice(last))); n.parentNode.replaceChild(frag, n);
  });
}

/* =====================================================================
   SEARCH (Ctrl/Cmd+K or /)
   ===================================================================== */
let INDEX = null;
function buildIndex() {
  const I = [];
  const add = (kind, title, body, route, anchor, weight = 1) => I.push({ kind, title: plain(title), body: plain(body), lt: plain(title).toLowerCase(), lb: plain(body).toLowerCase(), route, anchor, weight });
  const blocksText = bl => (bl || []).map(b => b.t === 'table' ? [b.head || [], ...b.rows].flat().join(' · ') : b.items ? b.items.join(' · ') : b.text || '').join(' \n ');
  for (const e of topics) {
    const t = e.t, r = '#' + e.key;
    add('Topic', `${t.id} ${t.title}`, blocksText(t.intro) || blocksText(t.parts.concept), r, null, 3);
    for (const [k, v] of Object.entries(t.parts || {})) {
      if (!PART[k] || !v || !v.length) continue;
      if (k === 'questions') v.forEach((q, i) => add('Question', q.q, q.a, r, `q${q.n || i + 1}`, 2));
      else if (k === 'scenarios') v.forEach((s, i) => add('Scenario', s.q, s.a + ' ' + blocksText(s.more), r, `s${i + 1}`, 2));
      else {
        const code = v.filter(b => b.t === 'code' || b.t === 'diagram');
        const rest = v.filter(b => !(b.t === 'code' || b.t === 'diagram'));
        if (rest.length) add(PART[k][3], `${t.id} ${t.title} — ${PART[k][2]}`, blocksText(rest), r, 'part-' + k);
        code.forEach(b => add(b.t === 'code' ? 'Code' : 'Diagram', `${t.id} ${t.title} — ${b.t === 'code' ? (b.lang || 'code') : 'diagram'}`, b.text, r, 'part-' + k));
      }
    }
    (t.intro || []).forEach(b => { if (b.t === 'h3') add('Scenario', b.text, '', r, 'inc-' + slug(b.text), 2); });
    if (t.intro && t.intro.length) add('Text', `${t.id} ${t.title}`, blocksText(t.intro), r, null);
  }
  for (const ch of chapters) {
    add('Chapter', `${ch.no}. ${ch.title}`, blocksText(ch.intro), '#ch' + ch.no, null, 3);
    if (ch.cheatsheet && ch.cheatsheet.length) add('Cheat sheet', `Chapter ${ch.no} — Quick Revision Cheat Sheet`, blocksText(ch.cheatsheet), `#ch${ch.no}-cheat`, null);
  }
  (EX.glossary || []).forEach(g => add('Glossary', g.term, g.def, '#glossary', 'g-' + slug(g.term), 2));
  (EX.rapidfire || []).forEach(rf => add('Rapid-fire', rf.q, rf.a, '#rapid', 'rf' + rf.n, 2));
  if (DATA.meta && DATA.meta.howto) add('Guide', 'How to Use These Notes', blocksText(DATA.meta.howto), '#guide', null);
  return I;
}
function search(q) {
  INDEX ||= buildIndex();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { terms, hits: [] };
  const hits = [];
  for (const it of INDEX) {
    let ok = true, score = 0;
    for (const t of terms) {
      const inT = it.lt.includes(t), inB = it.lb.includes(t);
      if (!inT && !inB) { ok = false; break; }
      score += (inT ? 5 : 1);
    }
    if (ok) { if (it.lt.includes(terms.join(' '))) score += 6; hits.push({ it, score: score * it.weight }); }
  }
  hits.sort((a, b) => b.score - a.score);
  return { terms, hits: hits.slice(0, 80) };
}
function snippet(text, terms) {
  const lt = text.toLowerCase(); let i = -1;
  for (const t of terms) { const j = lt.indexOf(t); if (j >= 0 && (i < 0 || j < i)) i = j; }
  const start = Math.max(0, i - 60); const s = (start ? '…' : '') + text.slice(start, start + 220) + (text.length > start + 220 ? '…' : '');
  return hl(s, terms);
}
function hl(s, terms) {
  let out = esc(s);
  if (!terms.length) return out;
  const re = new RegExp('(' + terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return out.replace(re, '<mark>$1</mark>');
}
const sOverlay = $('#search'), sInput = $('#search-input'), sList = $('#search-results'), sCount = $('#search-count');
let sHits = [], sSel = 0, sTerms = [], lastFocus = null;
function openSearch(prefill) {
  lastFocus = document.activeElement; sOverlay.hidden = false; document.body.style.overflow = 'hidden';
  if (prefill != null) sInput.value = prefill; sInput.focus(); sInput.select(); runSearch();
}
function closeSearch() { sOverlay.hidden = true; document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
function runSearch() {
  const { terms, hits } = search(sInput.value.trim()); sTerms = terms; sHits = hits; sSel = 0;
  sCount.textContent = terms.length ? `${hits.length}${hits.length === 80 ? '+' : ''} result${hits.length === 1 ? '' : 's'}` : '';
  sList.innerHTML = !terms.length ? `<li class="muted" role="presentation" style="cursor:default">Search titles, questions, answers, code, cheat sheets${EX.glossary ? ' and the glossary' : ''}. Try <em>treeify</em>, <em>pinning</em>, <em>OOMKilled</em>.</li>` :
    hits.length ? hits.map((h, i) => `<li role="option" id="sr-${i}" aria-selected="${i === 0}" data-i="${i}"><div class="rk">${esc(h.it.kind)}</div><div class="rt">${hl(h.it.title, terms)}</div>${h.it.body ? `<div class="rs">${snippet(h.it.body, terms)}</div>` : ''}</li>`).join('')
      : `<li class="muted" role="presentation" style="cursor:default">No matches in the loaded chapters.</li>`;
  sInput.setAttribute('aria-activedescendant', hits.length ? 'sr-0' : '');
}
function selectHit(i) { sSel = Math.max(0, Math.min(sHits.length - 1, i)); $$('li[role="option"]', sList).forEach((li, k) => li.setAttribute('aria-selected', String(k === sSel))); const li = $(`#sr-${sSel}`); if (li) { li.scrollIntoView({ block: 'nearest' }); sInput.setAttribute('aria-activedescendant', li.id); } }
function goHit(i) {
  const h = sHits[i]; if (!h) return; closeSearch();
  const target = h.it.route + (h.it.anchor ? '/' + h.it.anchor : '');
  pendingFocus = h.it.anchor ? { id: h.it.anchor, terms: sTerms } : null;
  if (location.hash === target) { render(); } else location.hash = target;
  if (!h.it.anchor) setTimeout(() => markTerms(view(), sTerms), 60);
}
let sT; sInput.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(runSearch, 90); });
sInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); selectHit(sSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectHit(sSel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); goHit(sSel); }
});
sList.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) goHit(+li.dataset.i); });
sOverlay.addEventListener('click', e => { if (e.target === sOverlay) closeSearch(); });
$('#search-close').addEventListener('click', closeSearch);

/* =====================================================================
   EXPLORE / FILTERS
   ===================================================================== */
function renderExplore(r, v) {
  v.className = 'content';
  const f = S.explore ||= { part: 'questions', levels: [], star: false, fire: false, from: chapters[0] ? chapters[0].no : 1, to: chapters.length ? chapters[chapters.length - 1].no : 1 };
  const chOpts = sel => chapters.map(c => `<option value="${c.no}" ${c.no === sel ? 'selected' : ''}>${c.no}. ${esc(c.title)}</option>`).join('');
  v.innerHTML = `<h1>Filter across chapters</h1><p class="lead">Show one kind of content from every loaded chapter — e.g. only scenarios, only pitfalls, or only Architect-level ★ questions.</p>
  <form class="card" id="xf" onsubmit="return false">
    <div class="grid cols-3">
      <label class="field">Part type<select name="part">${PARTS.map(p => `<option value="${p[0]}" ${f.part === p[0] ? 'selected' : ''}>${p[1]} ${esc(p[2])}</option>`).join('')}</select></label>
      <label class="field">From chapter<select name="from">${chOpts(f.from)}</select></label>
      <label class="field">To chapter<select name="to">${chOpts(f.to)}</select></label>
    </div>
    <div class="row" style="margin-top:12px"><span class="muted" style="font-size:.85rem;font-weight:600">Markers:</span>
      <label class="check"><input type="checkbox" name="star" ${f.star ? 'checked' : ''}> ★ only</label>
      <label class="check"><input type="checkbox" name="fire" ${f.fire ? 'checked' : ''}> 🔥 only</label>
      <span class="muted" style="font-size:.85rem;font-weight:600;margin-left:8px">Level:</span>
      ${LEVELS.map(l => `<label class="check"><input type="checkbox" name="lv" value="${l}" ${f.levels.includes(l) ? 'checked' : ''}> ${levelChip(l)}</label>`).join('')}
    </div>
    <p class="muted" style="font-size:.8rem;margin-bottom:0">Level filters apply to interview questions. For other parts, ★/🔥 filter by the topic's markers.</p>
  </form>
  <div id="xr" style="margin-top:12px"></div>`;
  const form = $('#xf', v);
  const run = () => {
    const fd = new FormData(form);
    f.part = fd.get('part'); f.from = +fd.get('from'); f.to = +fd.get('to'); f.star = !!fd.get('star'); f.fire = !!fd.get('fire'); f.levels = fd.getAll('lv'); save();
    const lo = Math.min(f.from, f.to), hi = Math.max(f.from, f.to);
    let count = 0;
    const html = topics.filter(e => e.ch.no >= lo && e.ch.no <= hi).map(e => {
      const p = e.t.parts && e.t.parts[f.part]; if (!p || !p.length) return '';
      if (f.part === 'questions') {
        const qs = p.filter(q => (!f.star || q.star) && (!f.fire || q.fire) && (!f.levels.length || f.levels.includes(q.level)));
        if (!qs.length) return ''; count += qs.length;
        return `<section class="card" style="margin:10px 0"><h2 style="margin:0 0 6px;font-size:1rem"><a href="#${e.key}">${esc(e.t.id)} ${esc(e.t.title)}</a> ${marks(e.t)}</h2><ol class="qa">${qs.map(q => `<li><div class="qhead"><span class="qn">${q.n}.</span>${marks(q)}${levelChip(q.level)}<a class="btn small" style="margin-left:auto" href="#${e.key}/q${q.n}">Open</a></div><div class="q">${md(q.q)}</div>${S.settings.hideAnswers ? `<button type="button" class="reveal" aria-controls="x-${esc(e.t.id)}-${q.n}">Show answer</button>` : ''}<div class="a" id="x-${esc(e.t.id)}-${q.n}" ${S.settings.hideAnswers ? 'hidden' : ''}>${md(q.a)}</div></li>`).join('')}</ol></section>`;
      }
      if ((f.star && !e.t.star) || (f.fire && !e.t.fire)) return '';
      count += f.part === 'scenarios' ? p.length : 1;
      return `<section class="card" style="margin:10px 0"><h2 style="margin:0 0 6px;font-size:1rem"><a href="#${e.key}/part-${f.part}">${esc(e.t.id)} ${esc(e.t.title)}</a> ${marks(e.t)}</h2>${partHtml(e, f.part)}</section>`;
    }).join('');
    $('#xr', v).innerHTML = `<p class="muted" aria-live="polite">${count} item${count === 1 ? '' : 's'}</p>` + (html || '<div class="empty">Nothing matches these filters.</div>');
    highlightIn($('#xr', v));
  };
  form.addEventListener('change', run); run();
}

/* =====================================================================
   FLASHCARDS — SM-2-lite
   ===================================================================== */
function srsState(id) { return S.srs[id] || { ef: 2.5, n: 0, iv: 0, due: 0, lapses: 0 }; }
function schedule(id, grade) { // grade: 1 again, 2 good, 3 easy
  const s = { ...srsState(id) }; const now = Date.now();
  if (grade === 1) { s.n = 0; s.iv = 0; s.lapses++; s.ef = Math.max(1.3, s.ef - 0.2); s.due = now + 10 * 60000; }
  else if (grade === 2) { s.n++; s.iv = s.n === 1 ? 1 : s.n === 2 ? 3 : Math.round(Math.max(s.iv, 1) * s.ef); s.due = now + s.iv * DAY; }
  else { s.n++; s.iv = s.n === 1 ? 4 : Math.round(Math.max(s.iv, 1) * s.ef * 1.3); s.ef = Math.min(3.2, s.ef + 0.15); s.due = now + s.iv * DAY; }
  s.last = now; S.srs[id] = s; save(); return s;
}
function previewIv(id, grade) { const s = srsState(id); if (grade === 1) return '10 min'; const n = s.n + 1; const iv = grade === 2 ? (n === 1 ? 1 : n === 2 ? 3 : Math.round(Math.max(s.iv, 1) * s.ef)) : (n === 1 ? 4 : Math.round(Math.max(s.iv, 1) * s.ef * 1.3)); return iv + (iv === 1 ? ' day' : ' days'); }
let FC = null;
function renderFlashcards(r, v) {
  if (FC && FC.active) return renderCard(v);
  const c = S.fcSetup ||= { source: 'questions', ch: 'all', marker: 'any', level: 'any', order: 'due', shuffle: true, limit: 20 };
  const srcAvail = { questions: ALL_Q.length > 0, rapid: !!(EX.rapidfire && EX.rapidfire.length), glossary: !!(EX.glossary && EX.glossary.length) };
  const due = cardsFor(c.source).filter(x => S.srs[x.id] && S.srs[x.id].due <= Date.now()).length;
  v.innerHTML = `<h1>Flashcards</h1><p class="lead">Spaced repetition: <strong>Again</strong> brings a card back in 10 minutes, <strong>Good</strong> and <strong>Easy</strong> push it out by growing intervals.</p>
  <form class="card" id="fcf" onsubmit="return false"><div class="grid cols-3">
    <label class="field">Source<select name="source">
      <option value="questions" ${c.source === 'questions' ? 'selected' : ''}>Interview questions (${ALL_Q.length})</option>
      <option value="rapid" ${c.source === 'rapid' ? 'selected' : ''} ${srcAvail.rapid ? '' : 'disabled'}>100 rapid-fire Q&amp;A${srcAvail.rapid ? '' : ' — needs Chapter 16'}</option>
      <option value="glossary" ${c.source === 'glossary' ? 'selected' : ''} ${srcAvail.glossary ? '' : 'disabled'}>Glossary terms${srcAvail.glossary ? '' : ' — needs Chapter 16'}</option></select></label>
    <label class="field">Chapter<select name="ch"><option value="all">All loaded chapters</option>${chapters.map(ch => `<option value="${ch.no}" ${String(c.ch) === String(ch.no) ? 'selected' : ''}>${ch.no}. ${esc(ch.title)}</option>`).join('')}</select></label>
    <label class="field">Marker<select name="marker"><option value="any">Any</option><option value="star" ${c.marker === 'star' ? 'selected' : ''}>★ only</option><option value="fire" ${c.marker === 'fire' ? 'selected' : ''}>🔥 only</option><option value="both" ${c.marker === 'both' ? 'selected' : ''}>★🔥 both</option></select></label>
    <label class="field">Level<select name="level"><option value="any">Any</option>${LEVELS.map(l => `<option ${c.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">Cards<select name="order"><option value="due" ${c.order === 'due' ? 'selected' : ''}>Due + new</option><option value="all" ${c.order === 'all' ? 'selected' : ''}>All matching</option><option value="weak" ${c.order === 'weak' ? 'selected' : ''}>Lapsed before</option></select></label>
    <label class="field">Session size<select name="limit">${[10, 20, 40, 80, 999].map(n => `<option value="${n}" ${c.limit === n ? 'selected' : ''}>${n === 999 ? 'No limit' : n}</option>`).join('')}</select></label>
  </div><div class="row" style="margin-top:12px"><label class="check"><input type="checkbox" name="shuffle" ${c.shuffle ? 'checked' : ''}> Shuffle</label><span class="sp" style="flex:1"></span><span class="muted" id="fc-count" aria-live="polite"></span><button class="btn primary" type="button" id="fc-start">Start session</button></div></form>
  <p class="muted" style="font-size:.85rem">Keys: <kbd>Space</kbd>/<kbd>f</kbd> flip · <kbd>1</kbd> Again · <kbd>2</kbd> Good · <kbd>3</kbd> Easy · <kbd>Esc</kbd> end. ${due} card${due === 1 ? '' : 's'} due in this source.</p>`;
  const form = $('#fcf', v);
  const pick = () => {
    const fd = new FormData(form);
    Object.assign(c, { source: fd.get('source'), ch: fd.get('ch'), marker: fd.get('marker'), level: fd.get('level'), order: fd.get('order'), limit: +fd.get('limit'), shuffle: !!fd.get('shuffle') }); save();
    let cards = cardsFor(c.source).filter(x => (c.ch === 'all' || String(x.ch) === String(c.ch)) && (c.marker === 'any' || (c.marker === 'star' && x.star) || (c.marker === 'fire' && x.fire) || (c.marker === 'both' && x.star && x.fire)) && (c.level === 'any' || x.level === c.level));
    const now = Date.now();
    if (c.order === 'due') { const due = cards.filter(x => S.srs[x.id] && S.srs[x.id].due <= now); const fresh = cards.filter(x => !S.srs[x.id]); cards = [...(c.shuffle ? shuffle(due) : due), ...(c.shuffle ? shuffle(fresh) : fresh)]; }
    else if (c.order === 'weak') { cards = cards.filter(x => S.srs[x.id] && S.srs[x.id].lapses > 0); if (c.shuffle) cards = shuffle(cards); }
    else if (c.shuffle) cards = shuffle(cards);
    return cards.slice(0, c.limit);
  };
  const upd = () => { const n = pick().length; $('#fc-count', v).textContent = `${n} card${n === 1 ? '' : 's'} in session`; $('#fc-start', v).disabled = !n; };
  form.addEventListener('change', upd); upd();
  $('#fc-start', v).addEventListener('click', () => { const q = pick(); if (!q.length) return; FC = { active: true, queue: q, i: 0, flipped: false, done: 0, tally: { 1: 0, 2: 0, 3: 0 } }; render(); });
}
function renderCard(v) {
  const card = FC.queue[FC.i];
  if (!card) {
    const t = FC.tally; FC.active = false;
    v.innerHTML = `<h1>Session complete</h1><div class="card"><p><strong>${FC.done}</strong> reviews · Again ${t[1]} · Good ${t[2]} · Easy ${t[3]}</p><div class="row"><button class="btn primary" type="button" id="fc-again">New session</button><a class="btn" href="#progress">See weak areas</a></div></div>`;
    $('#fc-again', v).addEventListener('click', () => { FC = null; render(); });
    return;
  }
  const left = FC.queue.length - FC.i;
  v.innerHTML = `<div class="row between"><h1 style="margin:0">Flashcards</h1><span class="muted" aria-live="polite">${left} left · ${FC.done} reviewed</span></div>
  <div class="flashcard ${FC.flipped ? 'flipped' : ''}" id="fc">
    <div class="fc-inner" role="button" tabindex="0" aria-label="${FC.flipped ? 'Answer side. Press space to flip back' : 'Question side. Press space to reveal the answer'}">
      <div class="fc-face fc-front" aria-hidden="${FC.flipped}"><div class="fc-meta">${marks(card)}${levelChip(card.level)}<span>${esc(card.meta || '')}</span></div><div class="fc-q">${md(card.front)}</div><div class="muted" style="font-size:.8rem">Click or press Space to flip</div></div>
      <div class="fc-face fc-back" aria-hidden="${!FC.flipped}"><div class="fc-meta">${marks(card)}${levelChip(card.level)}<span>${esc(card.meta || '')}</span>${card.route ? `<a href="${esc(card.route)}" style="margin-left:auto" data-leave>Open in notes</a>` : ''}</div><div class="fc-q" style="font-size:1rem;margin:12px 0 6px">${md(card.front)}</div><div class="fc-a">${md(card.back)}</div></div>
    </div></div>
  <div class="rate" ${FC.flipped ? '' : 'hidden'} id="rate">
    <button class="btn again" type="button" data-g="1">Again <small>1 · ${previewIv(card.id, 1)}</small></button>
    <button class="btn good" type="button" data-g="2">Good <small>2 · ${previewIv(card.id, 2)}</small></button>
    <button class="btn easy" type="button" data-g="3">Easy <small>3 · ${previewIv(card.id, 3)}</small></button></div>
  <div class="row" style="margin-top:12px"><button class="btn small" type="button" id="fc-flip">${FC.flipped ? 'Show question' : 'Show answer'} (f)</button><button class="btn small" type="button" id="fc-end">End session</button></div>`;
  const inner = $('.fc-inner', v);
  inner.addEventListener('click', ev => { if (ev.target.closest('a')) return; flipCard(); });
  $('#fc-flip', v).addEventListener('click', flipCard);
  $('#fc-end', v).addEventListener('click', () => { FC.queue = FC.queue.slice(0, FC.i); render(); });
  $('#rate', v).addEventListener('click', ev => { const b = ev.target.closest('[data-g]'); if (b) rateCard(+b.dataset.g); });
  $$('[data-leave]', v).forEach(a => a.addEventListener('click', () => { FC.active = false; FC = null; }));
}
function flipCard() { if (!FC || !FC.active) return; FC.flipped = !FC.flipped; const fc = $('#fc'); fc.classList.toggle('flipped', FC.flipped); $('#rate').hidden = !FC.flipped; $('#fc-flip').textContent = (FC.flipped ? 'Show question' : 'Show answer') + ' (f)'; $('.fc-front').setAttribute('aria-hidden', String(FC.flipped)); $('.fc-back').setAttribute('aria-hidden', String(!FC.flipped)); $('.fc-inner').focus(); }
function rateCard(g) {
  if (!FC || !FC.active || !FC.flipped) return;
  const card = FC.queue[FC.i]; schedule(card.id, g);
  bumpStat(card.topic, 'fn'); if (g === 1) bumpStat(card.topic, 'fa');
  FC.tally[g]++; FC.done++;
  if (g === 1) FC.queue.splice(Math.min(FC.queue.length, FC.i + 4), 0, card); // see it again this session
  FC.i++; FC.flipped = false; render();
}

/* =====================================================================
   QUIZ — multiple choice built from answers in the same section
   ===================================================================== */
let QZ = null;
function quizPool(source, ch) {
  if (source === 'rapid') return (EX.rapidfire || []).map(r => ({ id: `r|${r.n}`, q: r.q, a: r.a, section: r.section, topic: refTopic(r.a), star: r.star, fire: r.fire }));
  return ALL_Q.filter(x => ch === 'all' || String(x.e.ch.no) === String(ch)).map(x => ({ id: x.id, q: x.q.q, a: x.q.a, section: 'Chapter ' + x.e.ch.no, topic: x.e.t.id, star: x.q.star, fire: x.q.fire, level: x.q.level, route: `#${x.e.key}/q${x.q.n}` }));
}
function renderQuiz(r, v) {
  if (QZ && QZ.active) return renderQuizQ(v);
  if (QZ && QZ.finished) return renderQuizEnd(v);
  const hasRapid = !!(EX.rapidfire && EX.rapidfire.length);
  const c = S.qzSetup ||= { source: hasRapid ? 'rapid' : 'questions', ch: 'all', n: 10 };
  if (c.source === 'rapid' && !hasRapid) c.source = 'questions';
  v.innerHTML = `<h1>Quiz</h1><p class="lead">Each question has the correct answer plus three distractors drawn from other answers in the same section, so they are plausible.</p>
  ${hasRapid ? '' : '<p class="notice">The 100 rapid-fire Q&amp;A (16.1) are the main quiz source and arrive with Chapter 16. Until then, the quiz uses the interview-question answers from the loaded chapters.</p>'}
  <form class="card" id="qzf" onsubmit="return false"><div class="grid cols-3">
    <label class="field">Source<select name="source"><option value="rapid" ${c.source === 'rapid' ? 'selected' : ''} ${hasRapid ? '' : 'disabled'}>Rapid-fire Q&amp;A</option><option value="questions" ${c.source === 'questions' ? 'selected' : ''}>Interview questions</option></select></label>
    <label class="field">Chapter (interview questions)<select name="ch"><option value="all">All loaded</option>${chapters.map(ch => `<option value="${ch.no}" ${String(c.ch) === String(ch.no) ? 'selected' : ''}>${ch.no}. ${esc(ch.title)}</option>`).join('')}</select></label>
    <label class="field">Questions<select name="n">${[5, 10, 20, 30].map(n => `<option ${c.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  </div><div class="row" style="margin-top:12px"><button class="btn primary" type="button" id="qz-start">Start quiz</button></div></form>
  ${S.quiz.length ? `<h2>Recent scores</h2><ul>${S.quiz.slice(-6).reverse().map(q => `<li>${new Date(q.ts).toLocaleString()} — ${q.score}/${q.total} (${esc(q.source)})</li>`).join('')}</ul>` : ''}`;
  $('#qz-start', v).addEventListener('click', () => {
    const fd = new FormData($('#qzf', v)); Object.assign(c, { source: fd.get('source'), ch: fd.get('ch'), n: +fd.get('n') }); save();
    const pool = quizPool(c.source, c.ch);
    if (pool.length < 4) { toast('Not enough questions for a quiz in this selection'); return; }
    const items = shuffle(pool).slice(0, c.n).map(it => {
      let same = pool.filter(o => o.section === it.section && o.id !== it.id && o.a !== it.a);
      if (same.length < 3) same = pool.filter(o => o.id !== it.id && o.a !== it.a);
      const opts = shuffle([it.a, ...shuffle(same).slice(0, 3).map(o => o.a)]);
      return { ...it, opts, pick: null };
    });
    QZ = { active: true, items, i: 0, source: c.source }; render();
  });
}
function renderQuizQ(v) {
  const it = QZ.items[QZ.i];
  v.innerHTML = `<div class="row between"><h1 style="margin:0">Quiz</h1><span class="muted">Question ${QZ.i + 1} of ${QZ.items.length}</span></div>
  <div class="steps" aria-hidden="true" style="margin:10px 0">${QZ.items.map((x, k) => `<span class="${k < QZ.i ? 'done' : k === QZ.i ? 'cur' : ''}"></span>`).join('')}</div>
  <div class="card"><div class="fc-meta">${marks(it)}${levelChip(it.level)}<span>${esc(it.section)}${it.topic ? ' · ' + esc(it.topic) : ''}</span></div>
  <p style="font-size:1.1rem;font-weight:700">${md(it.q)}</p>
  <ul class="options" role="list">${it.opts.map((o, k) => `<li><button type="button" data-k="${k}" ${it.pick !== null ? 'disabled' : ''} class="${it.pick !== null ? (o === it.a ? 'right' : (k === it.pick ? 'wrong' : '')) : ''}"><span class="k">${k + 1}</span><span>${md(o)}</span></button></li>`).join('')}</ul>
  <p aria-live="polite" id="qz-fb">${it.pick !== null ? (it.opts[it.pick] === it.a ? '<strong style="color:var(--ok)">Correct.</strong>' : '<strong style="color:var(--bad)">Not quite</strong> — the correct answer is highlighted.') : '<span class="muted">Press 1–4 or click an option.</span>'}</p>
  <div class="row"><button class="btn primary" type="button" id="qz-next" ${it.pick === null ? 'disabled' : ''}>${QZ.i + 1 === QZ.items.length ? 'Finish' : 'Next'} (Enter)</button><button class="btn" type="button" id="qz-quit">Quit</button></div></div>`;
  $('.options', v).addEventListener('click', ev => { const b = ev.target.closest('[data-k]'); if (b) quizPick(+b.dataset.k); });
  $('#qz-next', v).addEventListener('click', quizNext);
  $('#qz-quit', v).addEventListener('click', () => { QZ = null; render(); });
}
function quizPick(k) { const it = QZ && QZ.active && QZ.items[QZ.i]; if (!it || it.pick !== null || k >= it.opts.length) return; it.pick = k; const ok = it.opts[k] === it.a; bumpStat(it.topic, 'qn'); if (ok) bumpStat(it.topic, 'qc'); render(); $('#qz-next') && $('#qz-next').focus(); }
function quizNext() { if (!QZ || !QZ.active) return; const it = QZ.items[QZ.i]; if (it.pick === null) return; QZ.i++; if (QZ.i >= QZ.items.length) { QZ.active = false; QZ.finished = true; const score = QZ.items.filter(x => x.opts[x.pick] === x.a).length; S.quiz.push({ ts: Date.now(), score, total: QZ.items.length, source: QZ.source }); S.quiz = S.quiz.slice(-50); save(); } render(); }
function renderQuizEnd(v) {
  const wrong = QZ.items.filter(x => x.opts[x.pick] !== x.a); const score = QZ.items.length - wrong.length;
  v.innerHTML = `<h1>Quiz result</h1><div class="card"><div class="stat">${score} / ${QZ.items.length}<small>${Math.round(score / QZ.items.length * 100)}% correct</small></div>
  <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="qz-new">New quiz</button>${wrong.length ? '<button class="btn" type="button" id="qz-retry">Retry the ones I missed</button>' : ''}</div></div>
  ${wrong.length ? `<h2>Review wrong answers</h2>${wrong.map(x => `<div class="card" style="margin:10px 0"><p><strong>${md(x.q)}</strong> ${x.route ? `<a href="${esc(x.route)}">Open</a>` : ''}</p><p style="color:var(--bad)">Your answer: ${md(x.opts[x.pick])}</p><p style="color:var(--ok)"><strong>Correct:</strong> ${md(x.a)}</p></div>`).join('')}` : '<p>Perfect score.</p>'}`;
  $('#qz-new', v).addEventListener('click', () => { QZ = null; render(); });
  const rt = $('#qz-retry', v); if (rt) rt.addEventListener('click', () => { QZ = { active: true, source: QZ.source, i: 0, items: wrong.map(x => ({ ...x, opts: shuffle(x.opts), pick: null })) }; render(); });
}

/* =====================================================================
   SCENARIO DRILL — 3-minute timer, write, reveal, self-rate
   ===================================================================== */
let DR = null;
function renderDrill(r, v) {
  const c = S.drSetup ||= { ch: 'all', order: 'unrated' };
  const pool = ALL_SC.filter(s => c.ch === 'all' || (s.e && String(s.e.ch.no) === String(c.ch)) || (c.ch === 'x' && s.ext));
  if (!DR || DR.ch !== c.ch) DR = { ch: c.ch, cur: null };
  if (!DR.cur || !pool.includes(DR.cur)) DR.cur = pickScenario(pool, c.order);
  const s = DR.cur;
  const rated = Object.keys(S.drill).filter(k => S.drill[k].r).length;
  v.innerHTML = `<h1>Scenario drill</h1><p class="lead">Read the prompt, answer within 3 minutes (clarify → diagnose → fix → prevent), then compare with the model answer and rate yourself.</p>
  <div class="card row" style="margin-bottom:12px"><label class="field">Chapter<select id="dr-ch"><option value="all">All (${ALL_SC.length})</option>${chapters.filter(ch => ALL_SC.some(x => x.e && x.e.ch === ch)).map(ch => `<option value="${ch.no}" ${String(c.ch) === String(ch.no) ? 'selected' : ''}>${ch.no}. ${esc(ch.title)}</option>`).join('')}${EX.scenarios ? `<option value="x" ${c.ch === 'x' ? 'selected' : ''}>16.2 · 50 architect scenarios</option>` : ''}</select></label>
  <label class="field">Pick<select id="dr-order"><option value="unrated" ${c.order === 'unrated' ? 'selected' : ''}>Not yet rated first</option><option value="weak" ${c.order === 'weak' ? 'selected' : ''}>Lowest self-rating first</option><option value="random" ${c.order === 'random' ? 'selected' : ''}>Random</option></select></label>
  <span class="muted" style="margin-left:auto;font-size:.85rem">${rated} of ${ALL_SC.length} rated</span></div>
  ${s ? drillCard(s) : '<div class="empty">No scenarios in this selection.</div>'}`;
  $('#dr-ch', v).addEventListener('change', ev => { c.ch = ev.target.value; save(); DR = null; render(); });
  $('#dr-order', v).addEventListener('change', ev => { c.order = ev.target.value; save(); DR.cur = pickScenario(pool, c.order); render(); });
  if (!s) return;
  wireDrill(v, s, () => { DR.cur = pickScenario(pool.filter(x => x !== s), c.order) || s; render(); });
}
function pickScenario(pool, order) {
  if (!pool.length) return null;
  if (order === 'unrated') { const u = pool.filter(s => !(S.drill[s.id] && S.drill[s.id].r)); return (u.length ? shuffle(u) : shuffle(pool))[0]; }
  if (order === 'weak') { const w = pool.slice().sort((a, b) => ((S.drill[a.id] || {}).r || 0) - ((S.drill[b.id] || {}).r || 0)); return w[0]; }
  return shuffle(pool)[0];
}
function drillCard(s, opts = {}) {
  const d = S.drill[s.id] || {};
  const src = s.e ? `<a href="#${s.e.key}/${s.anchor}">${esc(s.e.t.id)} ${esc(s.e.t.title)}</a>` : esc(s.section || '16.2');
  return `<div class="callout scenario" style="padding-bottom:14px"><div class="row between"><p class="ctitle">Scenario · ${src}</p>${opts.noTimer ? '' : `<div class="row"><span class="timer" id="dr-timer" role="timer" aria-live="off">3:00</span><button class="btn small" type="button" id="dr-pause">Pause</button><button class="btn small" type="button" id="dr-reset">Reset</button></div>`}</div>
    <p style="font-size:1.08rem"><strong>${md(s.prompt)}</strong> ${marks(s)}</p>
    <label class="sr-only" for="dr-ans">Your answer</label><textarea id="dr-ans" placeholder="Clarify → Stabilise/Diagnose → Decide/Fix → Prevent…">${esc(d.mine || '')}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="dr-reveal">Reveal model answer</button>${opts.noNext ? '' : '<button class="btn" type="button" id="dr-next">Next scenario</button>'}</div>
    <div id="dr-model" hidden><p class="ctitle" style="margin-top:14px">Model answer</p>${s.answerHtml}
      <p class="ctitle" style="margin-top:14px">Rate your answer</p><div class="scale" role="group" aria-label="Self-rating 1 to 5">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}" aria-pressed="${d.r === n}" title="${['', 'Missed it', 'Weak', 'Partial', 'Good', 'Nailed it'][n]}">${n}</button>`).join('')}</div>
      <p class="muted" style="font-size:.8rem">1 = missed it · 5 = nailed it${d.r ? ` · last rating ${d.r}` : ''}</p></div></div>`;
}
function wireDrill(v, s, next, opts = {}) {
  const ans = $('#dr-ans', v); let t;
  ans.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { (S.drill[s.id] ||= {}).mine = ans.value; save(); }, 400); });
  $('#dr-reveal', v).addEventListener('click', () => { $('#dr-model', v).hidden = false; highlightIn($('#dr-model', v)); $('#dr-reveal', v).disabled = true; stop(); });
  $('#dr-model', v).addEventListener('click', ev => {
    const b = ev.target.closest('[data-r]'); if (!b) return; const n = +b.dataset.r; const prev = (S.drill[s.id] || {}).r;
    (S.drill[s.id] ||= {}).r = n; S.drill[s.id].ts = Date.now();
    const tid = s.e ? s.e.t.id : refTopic(s.ref || s.answerText);
    if (tid) { const st = S.stats[tid] ||= {}; if (prev) { st.ds = (st.ds || 0) - prev; st.dn = (st.dn || 1) - 1; } st.ds = (st.ds || 0) + n; st.dn = (st.dn || 0) + 1; }
    save(); $$('[data-r]', v).forEach(x => x.setAttribute('aria-pressed', String(x === b))); toast('Rating saved'); if (opts.onRate) opts.onRate(n);
  });
  const nx = $('#dr-next', v); if (nx) nx.addEventListener('click', next);
  // timer
  const el = $('#dr-timer', v); if (!el) return;
  let left = 180, running = true, iv = null;
  const draw = () => { el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left <= 30); };
  const tick = () => { if (!running) return; left = Math.max(0, left - 1); draw(); if (left === 0) { stop(); el.textContent = "Time's up"; $('#dr-reveal', v).focus(); } };
  const start = () => { clearInterval(iv); iv = setInterval(tick, 1000); };
  function stop() { running = false; clearInterval(iv); const p = $('#dr-pause', v); if (p) p.disabled = true; }
  $('#dr-pause', v).addEventListener('click', ev => { running = !running; ev.target.textContent = running ? 'Pause' : 'Resume'; });
  $('#dr-reset', v).addEventListener('click', () => { left = 180; running = true; const p = $('#dr-pause', v); p.disabled = false; p.textContent = 'Pause'; draw(); start(); });
  draw(); start(); cleanup.push(() => clearInterval(iv));
}

/* =====================================================================
   MOCK INTERVIEW
   ===================================================================== */
let MK = null;
function hldPrompts() {
  const ch9 = chapterByNo.get(9); if (!ch9) return [];
  return (ch9.topics || []).filter(t => t.kind === 'hld' || /^(Design|HLD)/i.test(t.title)).map(t => ({ kind: 'Design (HLD)', prompt: t.title, answerHtml: topicBody({ ch: ch9, t, key: `ch9-${t.id}` }, { print: true }), route: `#ch9-${t.id}`, topic: t.id }));
}
function renderMock(r, v) {
  if (MK && MK.active) return renderMockStep(v);
  if (MK && MK.finished) return renderMockEnd(v);
  const hasRapid = !!(EX.rapidfire && EX.rapidfire.length); const hld = hldPrompts();
  v.innerHTML = `<h1>Mock interview</h1><p class="lead">A timed, mixed round: quick-recall questions, scenarios and a design prompt. Answer aloud or in the box, then reveal and score each one.</p>
  <div class="card"><ul>
    <li><strong>5 ${hasRapid ? 'rapid-fire questions (16.1)' : 'interview questions'}</strong>${hasRapid ? '' : ' — rapid-fire Q&amp;A replace these once Chapter 16 is loaded'}</li>
    <li><strong>2 scenarios</strong> from the loaded chapters${EX.scenarios ? ' and 16.2' : ''}</li>
    <li><strong>1 ${hld.length ? 'HLD design prompt (Chapter 9)' : 'Architect-level question'}</strong>${hld.length ? '' : ' — HLD case-study prompts replace this once Chapter 9 is loaded'}</li></ul>
    <div class="row"><label class="field">Time limit<select id="mk-min">${[20, 30, 45, 60].map(n => `<option ${n === (S.mkMin || 30) ? 'selected' : ''} value="${n}">${n} minutes</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" type="button" id="mk-start">Start mock</button></div></div>`;
  $('#mk-start', v).addEventListener('click', () => {
    S.mkMin = +$('#mk-min', v).value; save();
    const quick = hasRapid ? shuffle(EX.rapidfire).slice(0, 5).map(x => ({ kind: 'Rapid-fire', prompt: x.q, answerHtml: `<p>${md(x.a)}</p>`, topic: refTopic(x.a) }))
      : shuffle(ALL_Q).slice(0, 5).map(x => ({ kind: 'Interview question', level: x.q.level, prompt: x.q.q, answerHtml: `<p>${md(x.q.a)}</p>`, route: `#${x.e.key}/${x.anchor}`, topic: x.e.t.id }));
    const sc = shuffle(ALL_SC).slice(0, 2).map(s => ({ kind: 'Scenario', prompt: s.prompt, answerHtml: s.answerHtml, route: s.e ? `#${s.e.key}/${s.anchor}` : null, topic: s.e ? s.e.t.id : null }));
    const arch = ALL_Q.filter(x => x.q.level === 'Architect');
    const design = hld.length ? [shuffle(hld)[0]] : arch.length ? [shuffle(arch)[0]].map(x => ({ kind: 'Architect question', level: 'Architect', prompt: x.q.q, answerHtml: `<p>${md(x.q.a)}</p>`, route: `#${x.e.key}/${x.anchor}`, topic: x.e.t.id })) : [];
    MK = { active: true, steps: [...quick, ...sc, ...design].map(s => ({ ...s, mine: '', score: null, shown: false })), i: 0, end: Date.now() + S.mkMin * 60000, started: Date.now() };
    render();
  });
}
function renderMockStep(v) {
  const st = MK.steps[MK.i];
  v.innerHTML = `<div class="row between"><h1 style="margin:0">Mock interview</h1><span class="timer" id="mk-timer" role="timer">--:--</span></div>
  <div class="steps" aria-hidden="true" style="margin:10px 0">${MK.steps.map((x, k) => `<span class="${k < MK.i ? 'done' : k === MK.i ? 'cur' : ''}"></span>`).join('')}</div>
  <div class="card"><div class="fc-meta"><span class="chip neutral">${esc(st.kind)}</span>${levelChip(st.level)}<span>Step ${MK.i + 1} of ${MK.steps.length}</span></div>
  <p style="font-size:1.1rem;font-weight:700">${md(st.prompt)}</p>
  <label class="sr-only" for="mk-ans">Your answer</label><textarea id="mk-ans" placeholder="Answer here (or aloud), then reveal.">${esc(st.mine)}</textarea>
  <div class="row" style="margin-top:10px"><button class="btn" type="button" id="mk-show" ${st.shown ? 'disabled' : ''}>Reveal model answer</button></div>
  <div id="mk-model" ${st.shown ? '' : 'hidden'}><h3>Model answer ${st.route ? `<a href="${esc(st.route)}" target="_blank" rel="noopener" style="font-size:.8rem">open in notes</a>` : ''}</h3>${st.answerHtml}
    <p class="ctitle" style="font-weight:700">How did you do?</p><div class="seg" role="group" aria-label="Score">${[['2', 'Got it'], ['1', 'Partly'], ['0', 'Missed']].map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${String(st.score) === k}">${l}</button>`).join('')}</div></div>
  <div class="row" style="margin-top:14px"><button class="btn" type="button" id="mk-prev" ${MK.i === 0 ? 'disabled' : ''}>Back</button><button class="btn primary" type="button" id="mk-next">${MK.i + 1 === MK.steps.length ? 'Finish' : 'Next'}</button><button class="btn" type="button" id="mk-quit">End now</button></div></div>`;
  $('#mk-ans', v).addEventListener('input', ev => { st.mine = ev.target.value; });
  $('#mk-show', v).addEventListener('click', () => { st.shown = true; $('#mk-model', v).hidden = false; $('#mk-show', v).disabled = true; highlightIn(v); });
  $('#mk-model', v).addEventListener('click', ev => { const b = ev.target.closest('[data-s]'); if (!b) return; st.score = +b.dataset.s; $$('[data-s]', v).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('#mk-prev', v).addEventListener('click', () => { MK.i--; render(); });
  $('#mk-next', v).addEventListener('click', () => { if (MK.i + 1 >= MK.steps.length) finishMock(); else { MK.i++; render(); } });
  $('#mk-quit', v).addEventListener('click', finishMock);
  const el = $('#mk-timer', v);
  const draw = () => { const left = Math.max(0, Math.round((MK.end - Date.now()) / 1000)); el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left <= 120); if (left === 0) { el.textContent = "Time's up"; } };
  draw(); const iv = setInterval(draw, 1000); cleanup.push(() => clearInterval(iv));
}
function finishMock() {
  MK.active = false; MK.finished = true; MK.took = Date.now() - MK.started;
  MK.steps.forEach(s => { if (s.topic && s.score !== null) { bumpStat(s.topic, 'qn'); if (s.score === 2) bumpStat(s.topic, 'qc'); } });
  render();
}
function renderMockEnd(v) {
  const scored = MK.steps.filter(s => s.score !== null); const pts = scored.reduce((a, s) => a + s.score, 0);
  v.innerHTML = `<h1>Mock interview — summary</h1><div class="card"><div class="stat">${pts} / ${MK.steps.length * 2}<small>${scored.length} of ${MK.steps.length} self-scored · ${Math.round(MK.took / 60000)} min</small></div>
  <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="mk-again">New mock</button></div></div>
  ${MK.steps.map((s, i) => `<div class="card" style="margin:10px 0"><div class="fc-meta"><span class="chip neutral">${esc(s.kind)}</span><span>${s.score === 2 ? 'Got it' : s.score === 1 ? 'Partly' : s.score === 0 ? 'Missed' : 'Not scored'}</span>${s.route ? `<a href="${esc(s.route)}" style="margin-left:auto">Open</a>` : ''}</div><p><strong>${i + 1}. ${md(s.prompt)}</strong></p>${s.mine ? `<p class="muted">Your answer: ${esc(s.mine)}</p>` : ''}<details><summary>Model answer</summary>${s.answerHtml}</details></div>`).join('')}`;
  $('#mk-again', v).addEventListener('click', () => { MK = null; render(); });
}

/* =====================================================================
   CHEAT SHEETS, PLANNER, GLOSSARY, RAPID-FIRE, GUIDE
   ===================================================================== */
function renderCheatsheets(r, v) {
  v.className = 'content wide';
  const withCheat = chapters.filter(c => c.cheatsheet && c.cheatsheet.length);
  v.innerHTML = `<div class="row between"><h1>All cheat sheets</h1><button class="btn no-print" type="button" data-print>${ICON.print} Print</button></div>
  ${withCheat.length ? withCheat.map(c => `<section class="cheat-ch"><h2>Chapter ${c.no} — ${esc(c.title)}</h2><div class="cheat">${renderBlocks(c.cheatsheet, { cheat: true })}</div></section>`).join('') : '<div class="empty">No cheat sheets loaded.</div>'}
  ${EX.nightBefore && EX.nightBefore.length ? `<section class="cheat-ch"><h2>The Night Before — One-Page Sheet</h2><div class="cheat">${renderBlocks(EX.nightBefore, { cheat: true })}</div></section>` : ''}`;
}
function planRows(tb) { return (tb && tb.rows) || []; }
function planDay() { if (!S.plan.start) return null; const n = Math.floor((startOfDay(Date.now()) - startOfDay(S.plan.start)) / DAY) + 1; return { n }; }
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function planChecklist(plan, row, idx) {
  const head = (EX.plans[plan] && EX.plans[plan].head) || [];
  return row.slice(1).map((cell, k) => { const key = `${plan}:${idx}:${k}`; return `<label class="check" style="align-items:flex-start;margin:4px 0;display:flex"><input type="checkbox" data-plan="${key}" ${S.plan.done[key] ? 'checked' : ''}><span><span class="muted" style="font-size:.78rem;font-weight:700;text-transform:uppercase">${esc(plain(head[k + 1] || ''))}</span><br>${md(cell)}</span></label>`; }).join('');
}
document.addEventListener('change', e => { const c = e.target.closest('[data-plan]'); if (!c) return; if (c.checked) S.plan.done[c.dataset.plan] = Date.now(); else delete S.plan.done[c.dataset.plan]; save(); const box = c.closest('.plan-day'); if (box) box.classList.toggle('done', $$('[data-plan]', box).every(x => x.checked)); });
function renderPlanner(r, v) {
  const P = EX.plans;
  if (!P) { v.innerHTML = `<h1>Revision planner</h1><div class="empty">The 7-day and 30-day plans come from section 16.4 of the notes and show up here once Chapter 16 is loaded. ${loadedSummary()}</div>`; return; }
  const d = planDay();
  const sec = (key, title) => { const tb = P[key]; if (!tb) return ''; return `<h2>${esc(tb.title || title)}</h2>${planRows(tb).map((row, i) => { const all = row.slice(1).every((_, k) => S.plan.done[`${key}:${i}:${k}`]); const today = key === 'd7' && d && d.n === i + 1; return `<div class="plan-day ${today ? 'today' : ''} ${all ? 'done' : ''}"><strong>${esc(plain(tb.head ? tb.head[0] : ''))} ${md(row[0])}</strong>${today ? ' <span class="chip neutral">Today</span>' : ''}${planChecklist(key, row, i)}</div>`; }).join('')}${tb.after ? renderBlocks(tb.after) : ''}`; };
  v.innerHTML = `<h1>Revision planner</h1><div class="card row"><label class="field">Start date of your 7-day plan<input type="date" id="pl-start" value="${S.plan.start ? new Date(S.plan.start).toISOString().slice(0, 10) : ''}"></label>${d ? `<span class="muted">Today is day ${d.n}</span>` : ''}</div>${sec('d7', '7-day plan')}${sec('d30', '30-day plan')}`;
  $('#pl-start', v).addEventListener('change', ev => { const val = ev.target.value; S.plan.start = val ? new Date(val + 'T00:00:00').getTime() : null; save(); render(); });
}
function renderGlossary(r, v) {
  const G = EX.glossary;
  v.innerHTML = `<h1>Glossary</h1>${G ? `<div class="table-wrap"><table><thead><tr><th scope="col">Term</th><th scope="col">Meaning</th></tr></thead><tbody>${G.map(g => `<tr id="g-${esc(slug(g.term))}"><td>${md(g.term)}</td><td>${md(g.def)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">The glossary (16.5) arrives with Chapter 16.</div>`}`;
}
function renderRapid(r, v) {
  const R = EX.rapidfire;
  v.innerHTML = `<h1>100 rapid-fire Q&amp;A</h1>${R ? `<ol class="qa">${R.map(x => `<li id="rf${x.n}"><div class="qhead"><span class="qn">${x.n}.</span>${marks(x)}<span class="muted" style="font-size:.8rem">${esc(x.section || '')}</span></div><div class="q">${md(x.q)}</div><div class="a">${md(x.a)}</div></li>`).join('')}</ol>` : `<div class="empty">The rapid-fire set (16.1) arrives with Chapter 16.</div>`}`;
}
function renderGuide(r, v) {
  const m = DATA.meta || {};
  v.innerHTML = `<div class="crumbs"><a href="#home">Home</a></div><h1>How to Use These Notes</h1>${renderBlocks(m.howto)}
  <h2>Using this app</h2><ul><li><strong>Read</strong> each topic as accordions or tabs; mark it <em>Reading</em> or <em>Confident</em>, bookmark it, and keep notes.</li><li><strong>Search</strong> with <kbd>/</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>; <strong>Filter</strong> pulls one part type (e.g. all pitfalls) across chapters.</li><li><strong>Flashcards</strong>, <strong>Quiz</strong>, <strong>Scenario drill</strong> and <strong>Mock</strong> feed the weak-areas list on Home and Progress.</li><li>Progress is saved in this browser. Use <a href="#progress">Progress → Export</a> to back it up or move it.</li></ul>`;
}

/* =====================================================================
   PROGRESS
   ===================================================================== */
function renderProgress(r, v) {
  const o = overall(); const weak = weakAreas();
  const srsIds = Object.keys(S.srs); const due = srsIds.filter(k => S.srs[k].due <= Date.now()).length; const mature = srsIds.filter(k => S.srs[k].iv >= 21).length;
  const notes = Object.entries(S.notes).filter(([k]) => topicByKey.has(k));
  const bms = Object.keys(S.bookmarks).filter(k => topicByKey.has(k));
  const ratings = Object.values(S.drill).filter(d => d.r).map(d => d.r);
  v.innerHTML = `<h1>Progress</h1>
  ${storageOK ? '' : '<p class="notice">Browser storage is unavailable: progress is kept in memory for this tab only. Export it before you close the page.</p>'}
  <div class="card"><div class="row between"><strong>Overall</strong><span class="muted">${o.c} confident · ${o.r} reading · ${o.total - o.c - o.r} not started</span></div><div style="margin-top:8px">${bar(o)}</div>
  <div class="legend" style="margin-top:6px"><span class="lc">Confident</span><span class="lr">Reading</span><span>Not started</span></div></div>
  <h2>By chapter</h2><div class="card">${toc.map(tc => { const ch = chapterByNo.get(tc.no); if (!ch) return `<div style="margin:10px 0" class="muted">${tc.no}. ${esc(tc.title)} — not loaded</div>`; const p = chapterProgress(ch); return `<div style="margin:10px 0"><div class="row between"><a href="#ch${ch.no}">${ch.no}. ${esc(ch.title)}</a><span class="muted" style="font-size:.85rem">${p.c}/${p.total} confident</span></div>${bar(p)}</div>`; }).join('')}</div>
  <div class="grid cols-3" style="margin-top:14px"><div class="card"><div class="stat">${srsIds.length}<small>flashcards studied</small></div></div><div class="card"><div class="stat">${due}<small>due now</small></div></div><div class="card"><div class="stat">${mature}<small>mature (≥ 21-day interval)</small></div></div>
  <div class="card"><div class="stat">${S.quiz.length ? Math.round(S.quiz.reduce((a, q) => a + q.score / q.total, 0) / S.quiz.length * 100) + '%' : '—'}<small>average quiz score (${S.quiz.length} quizzes)</small></div></div><div class="card"><div class="stat">${ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—'}<small>average scenario self-rating (${ratings.length})</small></div></div></div>
  <h2>Weak areas</h2>${weak.length ? `<ul>${weak.map(w => `<li><a href="#${w.e.key}">${esc(w.e.t.id)} ${esc(w.e.t.title)}</a> — <span class="muted">${esc(w.reasons.join(' · '))}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing flagged yet.</p>'}
  <h2>Bookmarks</h2>${bms.length ? `<ul>${bms.map(k => { const e = topicByKey.get(k); return `<li><a href="#${k}">${esc(e.t.id)} ${esc(e.t.title)}</a> <button type="button" class="btn small" data-unbm="${k}">Remove</button></li>`; }).join('')}</ul>` : '<p class="muted">No bookmarks yet.</p>'}
  <h2>My notes</h2>${notes.length ? notes.map(([k, n]) => { const e = topicByKey.get(k); return `<div class="card" style="margin:8px 0"><a href="#${k}"><strong>${esc(e.t.id)} ${esc(e.t.title)}</strong></a><p style="white-space:pre-wrap;margin-bottom:0">${esc(n.length > 400 ? n.slice(0, 400) + '…' : n)}</p></div>`; }).join('') : '<p class="muted">No notes yet. Add them at the bottom of any topic.</p>'}
  <h2>Backup</h2><div class="card"><p>Export progress, bookmarks, notes, flashcard schedule and planner ticks as JSON, or import a previous export.</p>
  <div class="row"><button class="btn primary" type="button" id="pg-export">Export JSON</button><label class="btn" for="pg-import">Import JSON</label><input type="file" id="pg-import" accept="application/json,.json" class="sr-only"><button class="btn" type="button" id="pg-reset">Reset all progress</button></div></div>`;
  v.addEventListener('click', ev => { const b = ev.target.closest('[data-unbm]'); if (b) { delete S.bookmarks[b.dataset.unbm]; save(); render(); } });
  $('#pg-export', v).addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'senior-java-architect-notes', exported: new Date().toISOString(), state: S }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `java-notes-progress-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  $('#pg-import', v).addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const j = JSON.parse(rd.result); const st = j.state || j; if (!st || typeof st !== 'object' || !st.status) throw new Error('bad'); S = merge(DEFAULTS(), st); save(); applySettings(); toast('Progress imported'); render(); } catch (e) { toast('That file is not a progress export'); } };
    rd.readAsText(f);
  });
  $('#pg-reset', v).addEventListener('click', () => { if (confirm('Reset all progress, notes, bookmarks and flashcard history?')) { const keep = S.settings; S = DEFAULTS(); S.settings = keep; save(); render(); } });
}
function renderStorageNotice() { if (route().name === 'home' || route().name === 'progress') render(); }

/* =====================================================================
   SETTINGS: theme, font size, focus mode, drawer
   ===================================================================== */
function applySettings() {
  const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.fontSize = S.settings.font + '%';
  document.body.classList.toggle('focus', !!S.settings.focus);
  const tb = $('#theme-btn'); const label = t === 'auto' ? 'Theme: system' : t === 'dark' ? 'Theme: dark' : 'Theme: light';
  tb.setAttribute('aria-label', label + ' (click to change)'); tb.title = label;
  tb.innerHTML = t === 'dark' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' : t === 'light' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';
  $('#focus-btn').setAttribute('aria-pressed', String(!!S.settings.focus));
}
$('#theme-btn').addEventListener('click', () => { const order = ['auto', 'light', 'dark']; S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3]; save(); applySettings(); toast(S.settings.theme === 'auto' ? 'Theme follows your system' : `${S.settings.theme[0].toUpperCase() + S.settings.theme.slice(1)} theme`); });
$('#font-dec').addEventListener('click', () => { S.settings.font = Math.max(87.5, S.settings.font - 12.5); save(); applySettings(); });
$('#font-inc').addEventListener('click', () => { S.settings.font = Math.min(137.5, S.settings.font + 12.5); save(); applySettings(); });
$('#focus-btn').addEventListener('click', () => { S.settings.focus = !S.settings.focus; save(); applySettings(); toast(S.settings.focus ? 'Focus mode on — sidebar hidden' : 'Focus mode off'); });
$('#search-btn').addEventListener('click', () => openSearch());
$('#help-btn').addEventListener('click', openHelp);
$('#menu-btn').addEventListener('click', () => { const open = !document.body.classList.contains('drawer-open'); document.body.classList.toggle('drawer-open', open); $('#menu-btn').setAttribute('aria-expanded', String(open)); if (open) { const a = $('#sidebar a, #sidebar button'); if (a) a.focus(); } });
$('#backdrop').addEventListener('click', closeDrawer);
function closeDrawer() { document.body.classList.remove('drawer-open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }
function openHelp() { lastFocus = document.activeElement; $('#help').hidden = false; $('#help-close').focus(); }
function closeHelp() { $('#help').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#help-close').addEventListener('click', closeHelp);
$('#help').addEventListener('click', e => { if (e.target.id === 'help') closeHelp(); });

/* =====================================================================
   KEYBOARD
   ===================================================================== */
document.addEventListener('keydown', e => {
  const typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); sOverlay.hidden ? openSearch() : closeSearch(); return; }
  if (e.key === 'Escape') {
    if (!sOverlay.hidden) { closeSearch(); return; }
    if (!$('#help').hidden) { closeHelp(); return; }
    if (document.body.classList.contains('drawer-open')) { closeDrawer(); $('#menu-btn').focus(); return; }
    if (FC && FC.active && route().name === 'flashcards') { FC.queue = FC.queue.slice(0, FC.i); render(); return; }
  }
  // trap focus inside open overlays
  if (e.key === 'Tab') { const ov = !sOverlay.hidden ? sOverlay : !$('#help').hidden ? $('#help') : null; if (ov) { const f = $$('button,input,[href],[tabindex]:not([tabindex="-1"])', ov).filter(x => !x.disabled && x.offsetParent !== null); if (f.length) { const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } } }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!sOverlay.hidden || !$('#help').hidden) return;
  const r = route();
  if (e.key === '/') { e.preventDefault(); openSearch(); return; }
  if (e.key === '?') { e.preventDefault(); openHelp(); return; }
  if (r.name === 'flashcards' && FC && FC.active) {
    if (e.key === ' ' || e.key.toLowerCase() === 'f') { e.preventDefault(); flipCard(); return; }
    if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); rateCard(+e.key); return; }
  }
  if (r.name === 'quiz' && QZ && QZ.active) {
    if (['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); quizPick(+e.key - 1); return; }
    if (e.key === 'Enter' && !e.target.closest('button,a')) { e.preventDefault(); quizNext(); return; }
  }
  if (e.key === 'j' || e.key === 'k') {
    let cur = r.topic ? r.topic.i : (r.ch ? topics.findIndex(t => t.ch === r.ch) - (e.key === 'j' ? 1 : 0) : -1);
    const n = topics[cur + (e.key === 'j' ? 1 : -1)];
    if (n) { e.preventDefault(); location.hash = '#' + n.key; }
  }
});

/* =====================================================================
   BOOT
   ===================================================================== */
applySettings();
if (!location.hash && S.last) { /* land on home; "Continue" button offers the last topic */ }
render();
if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); const fn = () => { if (S.settings.theme === 'auto') applySettings(); }; mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn); }
window.addEventListener('hljs-ready', () => highlightIn(view()));
})();

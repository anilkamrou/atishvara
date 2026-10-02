const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const j = o => JSON.stringify(o).replace(/</g, '\u003c');
const dataTxt = `{"schema":${data.schema},"meta":${j(data.meta)},"chapters":[\n${data.chapters.map(j).join(',\n')}\n]}`;
JSON.parse(dataTxt); // validate
const js = fs.readFileSync('app.js', 'utf8');
if (/<\/script/i.test(js)) throw new Error('script close tag in js');
let html = fs.readFileSync('shell.html', 'utf8');
html = html.replace('/*__CSS__*/', () => fs.readFileSync('app.css', 'utf8')).replace('/*__DATA__*/', () => dataTxt).replace('/*__JS__*/', () => js);
fs.writeFileSync(process.argv[2] || 'out.html', html);
console.log('written', (html.length / 1024).toFixed(0) + ' KB');

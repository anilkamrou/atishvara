# Build pipeline for java.html

Source: `../Senior_Java_Architect.pdf`. The `_` prefix keeps this folder out of GitHub Pages (Jekyll skips it).

```
npm i pdfjs-dist@4.10.38          # once
node extract.mjs 1 311            # PDF -> pages_1_311.json (positioned text + fonts)
node build-data.js 1 2 3          # chapters to include -> data.json + chN.fragment.json
node build-html.js ../java.html   # inline app.css + data + app.js into shell.html
```

Edit the UI in `app.js` / `app.css` / `shell.html`; content always comes from the PDF via `parse.js`.

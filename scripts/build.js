// Build: src/index.html (bản đọc được) → public/index.html (bản nén để deploy)
// Chạy: npm install && npm run build
const { minify } = require("html-minifier-terser");
const fs = require("fs");
const path = require("path");
(async () => {
  const src = path.join(__dirname, "..", "src", "index.html");
  const out = path.join(__dirname, "..", "public", "index.html");
  const html = fs.readFileSync(src, "utf8");
  const min = await minify(html, {
    collapseWhitespace: true, removeComments: true, minifyCSS: true,
    minifyJS: { compress: { passes: 2 }, mangle: true },
    conservativeCollapse: false, removeRedundantAttributes: false
  });
  fs.writeFileSync(out, min);
  const v = (html.match(/name="app-v" content="(\d+)"/) || [])[1] || "?";
  console.log(`Đã build v${v}: ${html.length} → ${min.length} ký tự → public/index.html`);
})().catch(e => { console.error(e); process.exit(1); });

// Dựng bản demo GitHub Pages vào docs/:  node demo/build.mjs
// Máy chủ gói cho trình duyệt (esbuild + shims); server.js và seed.js được đổi vài dòng lúc gói, không sửa mã gốc.
import { build } from 'esbuild';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const S = f => path.join(ROOT, 'demo', 'shims', f);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const must = (s, a, b) => { if (!s.includes(a)) throw new Error('Không tìm thấy đoạn cần đổi: ' + a); return s.replace(a, b); };
const misc = { http: 'http', crypto: 'crypto', zlib: 'zlib', busboy: 'busboy' };
const shimPlugin = {
  name: 'node-shims',
  setup(b) {
    b.onResolve({ filter: /^(pg|fs|path)$/ }, a => ({ path: a.path === 'pg' ? S('pg.js') : a.path === 'fs' ? S('fs.js') : path.join(ROOT, 'node_modules/path-browserify/index.js') }));
    b.onResolve({ filter: /^(http|crypto|zlib|busboy)$/ }, a => ({ path: a.path, namespace: 'misc' }));
    b.onLoad({ filter: /.*/, namespace: 'misc' }, a => ({ contents: `module.exports = require(${JSON.stringify(S('node-misc.js'))})[${JSON.stringify(misc[a.path])}];`, resolveDir: ROOT, loader: 'js' }));
    b.onLoad({ filter: /server[\\/]server\.js$/ }, a => {
      let s = fs.readFileSync(a.path, 'utf8');
      s = must(s, 'const server = http.createServer(async (req, res) => {', 'const handle = async (req, res) => {');
      s = s.replace(/\}\);\r?\n\(async \(\) => \{ await migrate[\s\S]*$/, '};\nmodule.exports = { handle };\n');
      if (!s.includes('module.exports = { handle }')) throw new Error('Không tách được handle');
      return { contents: s, loader: 'js' };
    });
    b.onLoad({ filter: /server[\\/]reports\.js$/ }, a => ({ contents: must(fs.readFileSync(a.path, 'utf8'), 'Dữ liệu thực', 'Dữ liệu demo, không phải số thực'), loader: 'js' }));
    b.onLoad({ filter: /server[\\/]seed\.js$/ }, a => {
      let s = fs.readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n');
      s = must(s, '(async () => {\n  try {\n    if (process.argv', 'module.exports = (async () => {\n  try {\n    if (process.argv');
      s = must(s, 'Sheet NPT cho biết ${m} = Bùi Thị Thanh; ', '');
      s = s.replaceAll('99A-643.70', '99A-000.01');
      return { contents: s, loader: 'js' };
    });
  },
};
await build({
  entryPoints: [path.join(ROOT, 'demo/entry.js')], outfile: path.join(OUT, 'demo.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, charset: 'ascii',
  inject: [S('process.js')], define: { __dirname: '"/server"' }, plugins: [shimPlugin], logLevel: 'warning',
});

// giao diện: đường dẫn ảnh tương đối vì Pages chạy trong thư mục con
for (const f of ['ui.js', 'screens.js']) fs.writeFileSync(path.join(OUT, f), fs.readFileSync(path.join(ROOT, 'public', f), 'utf8').replace(/(["'(])\/logo\.png/g, '$1logo.png').replace('Nhân sự, VPP, BH, công đoàn là số thật', 'Nhân sự, lương, BH trong bản demo đều là dữ liệu giả'));
for (const f of ['app.css', 'logo.png']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));
fs.cpSync(path.join(ROOT, 'public/vendor'), path.join(OUT, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const ver = f => createHash('sha1').update(fs.readFileSync(path.join(OUT, f))).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(OUT, 'index.html'), fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8')
  .replace("'./demo.js'", `'./demo.js?v=${ver('demo.js')}'`).replace("'ui.js', 'screens.js'", `'ui.js?v=${ver('ui.js')}', 'screens.js?v=${ver('screens.js')}'`)
  .replace('href="app.css"', `href="app.css?v=${ver('app.css')}"`));
console.log('Đã dựng docs/ —', fs.readdirSync(OUT).map(f => f + ' ' + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + 'KB').join(', '));

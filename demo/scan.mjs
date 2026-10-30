// Quét docs/ tìm mọi tên, số định danh, SĐT, STK, MST, địa chỉ có trong dữ liệu thật. Có hit = không được đăng.
import fs from 'node:fs';
import path from 'node:path';
const S = JSON.parse(fs.readFileSync('data/seed/source.json', 'utf8')), T = new Set(['Bùi Thị Thanh', '99A-643.70']);
const add = v => { if (v != null && String(v).length > 5) T.add(String(v).normalize('NFC')); };
for (const e of S.emps) for (const k of ['name', 'cccd', 'phone', 'address', 'ins_no', 'tax', 'acct', 'cno', 'note', 'exp_ct', 'school', 'cert']) add(e[k]);
for (const n of S.npt) { add(n.name); add(n.id_no); add(n.emp); }
for (const i of S.ins) { add(i.name); add(i.ins_no); }
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
const decode = s => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));   // bundle charset=ascii giữ tiếng Việt dạng \uXXXX
let hits = 0;
for (const f of walk('docs')) {
  if (/\.(woff2|png)$/.test(f)) continue;
  const t = decode(fs.readFileSync(f, 'utf8')).normalize('NFC');
  for (const x of T) if (t.includes(x)) { hits++; console.log('HIT', f, 'độ dài', x.length); }
}
console.log('Quét', T.size, 'chuỗi nhạy cảm, số hit:', hits);
process.exitCode = hits ? 1 : 0;

// Sinh demo/source.demo.json từ data/seed/source.json: chỉ giữ cột không định danh (mã, pháp nhân, phòng, chức danh, loại HĐ…);
// tên, ngày sinh, CCCD, SĐT, địa chỉ, STK, MST, sổ BH, lương, người phụ thuộc đều giả. Chạy: node demo/make-source.mjs
import fs from 'node:fs';
const S = JSON.parse(fs.readFileSync('data/seed/source.json', 'utf8'));
const pad = (n, w) => String(n).padStart(w, '0');
const HO = ['Lâm', 'Tô', 'Quách', 'Kiều', 'Mạc', 'Thạch', 'La', 'Doãn'], DEM = ['Minh', 'Gia', 'Thanh', 'Hải', 'Bảo', 'Ngọc', 'An', 'Khánh'];
const TEN_NAM = ['Khoa', 'Phong', 'Quân', 'Sơn', 'Toàn', 'Vinh', 'Duy', 'Kiên'], TEN_NU = ['Châu', 'Diệp', 'Hân', 'Nhi', 'Quyên', 'Trâm', 'Vy', 'Yến'];
const real = new Set([...S.emps, ...S.npt, ...S.ins].map(x => x.name.normalize('NFC')));
const used = new Set();
let k = 0; const fake = g => { for (;;) { k++; const n = `${HO[k % 8]} ${DEM[(k >> 3) % 8]} ${(g === 'Nữ' ? TEN_NU : TEN_NAM)[(k * 5 + (k >> 6)) % 8]}`; if (!real.has(n) && !used.has(n)) { used.add(n); return n + ' (mẫu)'; } } };
const salary = i => (6 + (i * 7) % 19) * 1000000;
const byName = {}, npt = [];
const emps = S.emps.map((e, i) => {
  const name = byName[e.name] = fake(e.gender), n = i + 1;
  for (let j = 1; j <= (e.npt || 0); j++) npt.push({ code: e.code, emp: name, name: fake(j % 2 ? 'Nữ' : 'Nam'), rel: 'Con', dob: `201${j}-06-15`, id_no: '000000' + pad(n * 10 + j, 6), from_m: '2024-01', to_m: null, note: null });
  return { code: e.code, name, gender: e.gender, dob: `19${80 + n % 20}-0${1 + n % 9}-15`, cccd: '000000' + pad(n, 6), cccd_date: '2021-05-01', cccd_place: 'Cục CS QLHC về TTXH', phone: '090000' + pad(n, 4),
    address: `Số ${n} đường Mẫu, Bắc Ninh`, legal: e.legal, dept: e.dept, title: e.title, level: e.level, mgr: e.mgr, join: e.join, labor: e.labor, status: e.status, ins_no: '999' + pad(n, 7), tax: '8000' + pad(n, 6),
    union: e.union, bank: e.bank, acct: e.acct ? '9999' + pad(n, 8) : null, cond: e.cond, note: null, ctype: e.ctype, cno: e.cno ? `${e.code}/HĐLĐ-MẪU` : null, csign: e.csign, cfrom: e.cfrom, cto: e.cto, trial_pct: e.trial_pct, ctitle: e.ctitle ? e.title : null,
    npt: e.npt, school: null, cert: null, exp: null, exp_ct: null };
});
const nameOf = n => byName[n] ||= fake('Nữ');
const ins = S.ins.map((x, i) => ({ name: nameOf(x.name), ins_no: '888' + pad(i + 1, 7), title: x.title, salary: salary(i), note: x.note }));
const cd = S.cd.map((x, i) => ({ name: nameOf(x.name), salary: ins.find(y => y.name === nameOf(x.name))?.salary ?? salary(i), note: x.note }));
fs.writeFileSync('demo/source.demo.json', JSON.stringify({ emps, npt, cat: S.cat, t9: S.t9, t10: S.t10, ins, cd }));
console.log(emps.length, 'nhân sự giả,', npt.length, 'người phụ thuộc giả');

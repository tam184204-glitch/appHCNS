// Nạp dữ liệu gốc từ file của phòng HCNS (data/seed/source.json) + đối soát chéo giữa các file → bảng hr_issue (màn «Chất lượng dữ liệu»).
//   node server/seed.js           dữ liệu thật
//   node server/seed.js --demo    thêm dữ liệu mẫu (is_demo) cho các phân hệ chưa có số liệu
//   node server/seed.js --clear-demo
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q, one, pool } = require('./db');
const { migrate } = require('./schema');
const { E, CAND } = require('./meta');
const C = require('./core');
const B = require('./biz');

const SRC = ['source.json', 'source.sample.json'].map(f => path.join(__dirname, '..', 'data', 'seed', f)).find(f => fs.existsSync(f)); // không có dữ liệu thật thì nạp dữ liệu giả
const S = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
const ins = async (t, o) => { const k = Object.keys(o); return (await one(`INSERT INTO ${t} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, k.map(x => o[x] !== null && typeof o[x] === 'object' ? JSON.stringify(o[x]) : o[x]))).id; };
const upsert = async (t, key, o) => { const r = await one(`SELECT id FROM ${t} WHERE ${key} = $1`, [o[key]]); if (r) return r.id; return ins(t, o); };
const issue = (src, severity, title, detail) => q('INSERT INTO hr_issue (src, severity, title, detail) VALUES ($1,$2,$3,$4)', [src, severity, title, detail || null]);
const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/[(),.]/g, ' ').replace(/\b(hộp|cái|loại)\b/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

const LEGALS = [
  ['CT', 'Cát Tường', 'Công ty Cổ phần Cát Tường', '2300208362', 'Tầng 4 Chung cư Cát Tường New, đường Lý Thái Tổ, phường Kinh Bắc, tỉnh Bắc Ninh', 'dang_hd'],
  ['TN', 'Thống Nhất', 'Công ty Cổ phần Thương mại và Đầu tư Phát triển Thống Nhất', '2300280062', 'Tầng 3 chung cư Cát Tường New, đường Lý Thái Tổ, phường Kinh Bắc, tỉnh Bắc Ninh', 'dang_hd'],
  ['TD', 'Tiến Đạt', 'Công ty cổ phần Đầu tư Xây dựng và Thương mại Tổng hợp Tiến Đạt', '2300943739', 'Tầng 4 Cát Tường New, đường Lý Thái Tổ, phường Kinh Bắc, tỉnh Bắc Ninh', 'dang_hd'],
  ['CTXD', 'CTXD', 'Công ty Công trình Xây dựng (cần bổ sung tên đầy đủ)', null, null, 'can_bo_sung'],
  ['TC', 'Thành Công', 'Thành Công (cần bổ sung tên đầy đủ)', null, null, 'can_bo_sung'],
  ['AT', 'An Tâm', 'An Tâm (cần bổ sung tên đầy đủ)', null, null, 'can_bo_sung'],
  ['DHP', 'Đại Hưng Phát', 'Đại Hưng Phát (cần bổ sung tên đầy đủ)', null, null, 'can_bo_sung'],
];
const DEPTS = [['HOME-BLD', 'Ban lãnh đạo', 'Khối Home'], ['HOME-HCNS', 'Phòng Hành chính Nhân sự', 'Khối Home'], ['HOME-TCKT', 'Phòng Tài chính Kế toán', 'Khối Home'], ['HOME-QLDA', 'Phòng Quản lý dự án', 'Khối Home'], ['HOME-KD', 'Phòng Kinh doanh', 'Khối Home'], ['HOME-PC', 'Phòng Pháp chế', 'Khối Home'],
  ['CĐS', 'Ban Chuyển đổi số', 'Văn phòng công ty'], ['KSNB', 'Ban Tài chính và Kiểm soát nội bộ', 'Văn phòng công ty'], ['QLCL', 'Phòng QL chất lượng & Phát triển sản phẩm', 'Khối Xây lắp'], ['QLĐT', 'Phòng Quản lý đầu tư', 'Khối QLN và Đầu tư dịch vụ']];
// CC06 — chép từ ảnh «Danh mục ký hiệu chấm công»
const TYPES = `HC|Ca hành chính|1|8|Ca thời gian + hành chính|0
HC/2|Ca hành chính nửa ngày|0.5|4|Ca thời gian + hành chính|0
LB|Làm bù|1|8|Ca thời gian + hành chính|0
CÔ|Nghỉ con ốm (hưởng chế độ bảo hiểm)|1|8|Chế độ nghỉ ốm|1
CÔ/2|Nghỉ con ốm 1/2 ngày (hưởng chế độ bảo hiểm)|0.5|4|Chế độ nghỉ ốm|1
O|Nghỉ ốm (hưởng chế độ bảo hiểm)|1|8|Chế độ nghỉ ốm|1
O/2|Nghỉ ốm 1/2 ngày (hưởng chế độ bảo hiểm)|0.5|4|Chế độ nghỉ ốm|1
P|Nghỉ phép 1 ngày|1|8|Chế độ nghỉ phép|0
P/2|Phép 1/2 ngày|0.5|4|Chế độ nghỉ phép|0
P>1|Nghỉ phép>1 ngày|1|8|Chế độ nghỉ phép|0
CV5N|Nghỉ chăm vợ sinh|1|8|Chế độ nghỉ thai sản|1
CV7N|Nghỉ chăm vợ sinh mổ|1|8|Chế độ nghỉ thai sản|1
DS|Nghỉ dưỡng sức sau sinh|1|8|Chế độ nghỉ thai sản|1
TS|Nghỉ thai sản|1|8|Chế độ nghỉ thai sản|1
CT|Công tác ngày thường|1|8|Công tác|0
CT/2|Công tác 1/2 ngày thường|0.5|4|Công tác|0
CTCN|Công tác ngày nghỉ (chủ nhật)|||Công tác|0
CTN|Công tác nhiều ngày liên tục|1|8|Công tác|0
XI|Không chấm công thời gian vào|||Không có thời gian chấm vào - ra|0
XO|Không chấm công thời gian ra|||Không có thời gian chấm vào - ra|0
XX|Không chấm công thời gian vào và ra|||Không có thời gian chấm vào - ra|0
K|Nghỉ không hưởng lương 1 ngày|1|8|Không hưởng lương|1
K/2|Nghỉ không hưởng lương 1/2 ngày|0.5|4|Không hưởng lương|1
KLNG|Nghỉ không lương nhiều ngày|1|8|Không hưởng lương|1
T|Nghỉ tai nạn 1 ngày|1|8|Nghỉ tai nạn lao động|0
T/2|Nghỉ tai nạn 1/2 ngày|0.5|4|Nghỉ tai nạn lao động|0
VHH1|Nghỉ việc hiếu hỉ|1|8|Nghỉ việc riêng có hưởng lương|0
L|Nghỉ lễ tết|1|8|Nghỉ lễ|0`.split('\n').map(x => x.split('|'));

async function real() {
  await migrate({ q, one });
  await q('TRUNCATE hr_issue');
  const L = {}; for (const [code, short, name, tax_code, address, state] of LEGALS) L[short] = await upsert('hr_legal', 'code', { code, short, name, tax_code, address, state, has_union: code === 'CT' });
  const D = {}; for (const [code, name, block] of DEPTS) D[code] = await upsert('hr_dept', 'code', { code, name, block, from_on: '2026-01-01', version: '01' });
  for (const r of await q('SELECT id, code FROM hr_legal WHERE state = $1', ['can_bo_sung'])) await issue('CCTC06', 'can_cap_nhat', `Pháp nhân ${r.code}: thiếu tên đầy đủ, MST, địa chỉ`, 'Trong file chỉ có tên viết tắt ở cột «Pháp nhân ký HĐLĐ». Cần bổ sung để in hợp đồng, báo cáo.');

  // ---- nhân sự ----
  const insBy = Object.fromEntries(S.ins.map(x => [x.name, x])), E2 = {};
  const titles = new Set();
  for (const e of S.emps) {
    const code = e.code === 'Chưa có' ? 'NV-CHUA-CO' : e.code;
    const npts = S.npt.filter(n => n.code === e.code).map(n => ({ name: n.name, rel: n.rel, id_no: n.id_no, dob: n.dob, from_m: n.from_m, to_m: n.to_m }));
    const i = insBy[e.name];
    const id = await upsert('hr_employee', 'code', { code, full_name: e.name, gender: e.gender, dob: e.dob, cccd: e.cccd, cccd_date: e.cccd_date, cccd_place: e.cccd_place, phone: e.phone, address: e.address, legal_id: L[e.legal], dept_id: e.dept ? D[e.dept] : null, title: e.title, level: e.level, join_on: e.join, state: e.labor === 'Thử việc' || e.ctype === 'Thử việc' ? 'thu_viec' : 'dang_lam', work_cond: e.cond, ins_no: i?.ins_no || e.ins_no, tax_no: e.tax, union_member: e.union === 'C', bank: e.bank, bank_acct: e.acct, school: e.school, cert: e.cert, exp: e.exp, exp_ct: e.exp_ct, note: e.note, ins_salary: i?.salary || null, pay_p1: i?.salary || null, dependents: npts, docs: [], contacts: [] });
    E2[e.code] = id; titles.add(e.title);
    if (e.cno) {
      const kind = e.ctype === 'Thử việc' ? 'HD01' : e.ctype === 'Xác định thời hạn' ? 'HD02' : 'HD03';
      if (!await one('SELECT 1 AS x FROM hr_contract WHERE emp_id = $1 AND no = $2', [id, e.cno]))
        await ins('hr_contract', { emp_id: id, legal_id: L[e.legal], kind, no: e.cno, sign_on: e.csign, from_on: e.cfrom, to_on: e.cto, title: e.ctitle, state: 'hieu_luc', trial_pct: kind === 'HD01' ? (e.trial_pct || 0.85) * 100 : null });
    } else await issue('HS01', 'can_cap_nhat', `${e.name}: chưa có số hợp đồng`, 'Cột «Số HĐ / Phụ lục» trống.');
    if (!e.dept) await issue('HS01', 'can_cap_nhat', `${e.name} (${e.code}): chưa gán phòng ban`, e.note);
    if (e.code === 'Chưa có') await issue('HS01', 'can_cap_nhat', `${e.name}: chưa có mã nhân viên`, 'File ghi «Chưa có»; tạm dùng NV-CHUA-CO. Theo sheet tuần 12–17/10 đã chấm dứt HĐLĐ tại Tiến Đạt, điều chuyển sang QLN–HCNS — cần cập nhật hồ sơ.');
    if (['Xác định thời hạn', 'Thử việc'].includes(e.ctype) && !e.cto) await issue('HD12', 'can_cap_nhat', `${e.name}: HĐ có thời hạn nhưng thiếu ngày hết hạn`, `Số HĐ ${e.cno || '(trống)'}. Không đưa vào cảnh báo hết hạn cho tới khi có ngày.`);
    if (e.labor === 'Chính thức' && e.ctype === 'Thử việc') await issue('HD12', 'mau_thuan', `${e.name}: «Loại LĐ» = Chính thức nhưng HĐ đang là Thử việc`, 'Hai cột trong DS CBNV không khớp nhau.');
    if (e.ins_no === e.cccd && !i) await issue('BH-01', 'can_cap_nhat', `${e.name}: Số sổ BHXH trùng số CCCD`, 'File DS CBNV điền số định danh vào cột số sổ; cần đối chiếu mã số BHXH.');
    if (i && e.ins_no && i.ins_no && i.ins_no !== e.ins_no) await issue('BH-01', 'da_tu_xu_ly', `${e.name}: số sổ BHXH khác nhau giữa 2 file`, `DS CBNV: ${e.ins_no} · Bảng BHXH: ${i.ins_no}. App lấy theo bảng BHXH.`);
    if (i && i.title && !norm(i.title).includes(norm(e.title).split(' ')[0])) await issue('BH-01', 'thong_tin', `${e.name}: chức danh khác nhau giữa 2 file`, `DS CBNV: ${e.title} · Bảng BHXH: ${i.title}`);
  }
  for (const e of S.emps) {
    if (!e.mgr || e.mgr === e.code) continue;
    if (E2[e.mgr]) await q('UPDATE hr_employee SET manager_id = $1 WHERE id = $2', [E2[e.mgr], E2[e.code]]);
  }
  const orphan = {}; for (const e of S.emps) if (e.mgr && !E2[e.mgr]) (orphan[e.mgr] ||= []).push(e.name);
  for (const [m, xs] of Object.entries(orphan)) await issue('CCTC03', 'mau_thuan', `Quản lý trực tiếp ${m} không có trong danh sách nhân sự`, `${xs.length} người: ${xs.join(', ')}. Sheet NPT cho biết ${m} = Bùi Thị Thanh; DMCV ghi đã thu hồi máy tính — có thể đã nghỉ. Cần gán lại quản lý.`);
  for (const n of S.npt.filter(n => !E2[n.code]).reduce((a, n) => a.some(x => x.code === n.code) ? a : [...a, n], [])) await issue('HS01', 'mau_thuan', `Người phụ thuộc thuộc nhân viên không có hồ sơ: ${n.code} ${n.emp}`, `${S.npt.filter(x => x.code === n.code).length} người phụ thuộc chưa nạp được.`);
  for (const e of S.emps) { const c = S.npt.filter(n => n.code === e.code).length; if ((e.npt || 0) !== c) await issue('HS01', 'mau_thuan', `${e.name}: số người phụ thuộc lệch`, `Sheet NS ghi ${e.npt || 0}, sheet NPT có ${c} dòng. App tính theo sheet NPT.`); }
  for (const i of S.ins) if (!S.emps.find(e => e.name === i.name)) {
    const id = await upsert('hr_employee', 'code', { code: 'BH-' + i.ins_no, full_name: i.name, legal_id: L['Cát Tường'], title: i.title, join_on: '2020-01-01', state: 'thai_san', ins_no: i.ins_no, ins_salary: null, note: `Có trong bảng BHXH (${i.note}), không có trong DS CBNV — ngày vào làm chưa có`, dependents: [], docs: [], contacts: [] });
    await issue('BH-01', 'mau_thuan', `${i.name}: có trong bảng BHXH, không có trong DS CBNV`, `Ghi chú file: ${i.note}. Đã tạo hồ sơ tạm trạng thái Thai sản, ngày vào làm tạm 01/01/2020 — cần sửa.`); E2['BH' + i.name] = id;
  }
  const noPay = S.emps.filter(e => !insBy[e.name]);
  await issue('TL02', 'can_cap_nhat', `${noPay.length}/${S.emps.length} nhân sự chưa có mức lương`, 'Cột lương trên HĐ và mức đóng BHXH trong DS CBNV đều trống; chỉ 17 người Cát Tường có số từ file trích nộp (dùng tạm làm P1, chưa có P2). Pháp nhân còn lại sẽ báo «Cần cập nhật» trên bảng lương/BH.');
  for (const t of titles) if (!await one('SELECT 1 AS x FROM hr_position WHERE name = $1', [t])) await ins('hr_position', { code: 'CD' + String(((await one('SELECT count(*) n FROM hr_position')).n + 1)).padStart(3, '0'), name: t, state: 'hieu_luc' });
  await q(`UPDATE hr_dept d SET head_id = x.id FROM (SELECT DISTINCT ON (dept_id) id, dept_id FROM hr_employee WHERE level IN ('TP','TGĐ') ORDER BY dept_id, level) x WHERE x.dept_id = d.id AND d.head_id IS NULL`);

  // ---- tài khoản: mỗi nhân viên 1 tài khoản; vai trò & pháp nhân phụ trách lấy theo phân công trong DMCV ----
  const pw = hashPw(process.env.DEFAULT_PW || '123456');
  const roleOf = e => ({ NV049: 'tp_hcns', NV044: 'cv_hcns', NV151: 'cv_hcns', NV021: 'cv_hc', NV001: 'bgd', NV002: 'bgd', NV091: 'bgd', NV037: 'ke_toan' })[e.code] || (['TP'].includes(e.level) ? 'truong_bp' : /Kế toán/.test(e.title) ? 'ke_toan' : 'nld');
  const scope = { NV044: ['Cát Tường', 'CTXD'], NV151: ['Thống Nhất', 'Tiến Đạt'] };
  for (const e of S.emps) {
    const code = e.code === 'Chưa có' ? 'NV-CHUA-CO' : e.code;
    await q(`INSERT INTO hr_user (username, full_name, role, emp_id, dept_id, legal_ids, title, pw_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (lower(username)) DO NOTHING`, [code, e.name, roleOf(e), E2[e.code], e.dept ? D[e.dept] : null, scope[e.code]?.map(s => L[s]) || null, e.title, pw]);
  }
  await q(`INSERT INTO hr_user (username, full_name, role, pw_hash, title) VALUES ('admin','Quản trị hệ thống','admin',$1,'Quản trị') ON CONFLICT (lower(username)) DO NOTHING`, [pw]);

  // ---- danh mục chấm công: lấy từ ảnh trong Bộ 53 biểu mẫu ----
  for (const [code, name, days, hours, grp, unpaid] of TYPES) await upsert('hr_att_type', 'code', { code, name, days: days || null, hours: hours || null, grp, unpaid: unpaid === '1' });
  if (!(await one('SELECT count(*) n FROM hr_site')).n) { await ins('hr_site', { name: 'Công trường Yên Phong (CTS + TNS)', kind: 'Công trường', lat: 21.207846, lng: 106.004639, radius: 1000, state: 'on' }); await ins('hr_site', { name: 'Văn phòng trụ sở', kind: 'Văn phòng', lat: 21.174064, lng: 106.064013, radius: 100, state: 'on' }); }
  await upsert('hr_shift', 'code', { code: 'HC', name: 'Hành chính', kind: 'Có giờ', from_t: '08:00', to_t: '17:30', break_t: '12:00–13:30', hours: 8, applies: 'Cát Tường (VP TĐ + Home) · T2–T6 · ca mặc định khối văn phòng', state: 'on' });
  for (const [day, name] of [['2026-01-01', 'Tết Dương lịch'], ['2026-04-27', 'Giỗ Tổ Hùng Vương (nghỉ bù)'], ['2026-04-30', 'Ngày Chiến thắng'], ['2026-05-01', 'Quốc tế Lao động'], ['2026-09-01', 'Quốc khánh (ngày liền kề)'], ['2026-09-02', 'Quốc khánh 2/9']]) await upsert('hr_holiday', 'day', { day, name, applies: 'Mọi pháp nhân' });
  await issue('CC07', 'can_cap_nhat', 'Danh mục ngày lễ 2026: mới có đủ theo ảnh 2 ngày Quốc khánh', 'Các ngày còn lại do app điền sẵn và chưa có lịch nghỉ Tết âm lịch — cần rà theo thông báo nghỉ của công ty.');
  for (const [code, name] of [['PDT03', 'Phòng đào tạo tầng 3'], ['PH01', 'Phòng họp tầng 3'], ['PH02', 'Phòng họp tầng 4']]) await upsert('hr_room', 'code', { code, name, place: 'Văn phòng Bắc Ninh' });
  await upsert('hr_vehicle', 'code', { code: 'XE05', plate: '99A-643.70', legal_id: L['Cát Tường'], state: 'san_sang' });
  await issue('XC01', 'can_cap_nhat', 'Danh sách xe: chỉ có 1 xe 99A-643.70 (đọc từ ảnh XC04)', 'Chưa có file danh sách xe; thiếu hạn đăng kiểm, bảo hiểm, bảo dưỡng, chủ sở hữu thật — tạm gán Cát Tường.');

  // ---- VPP: danh mục 119 mã; sổ T9, T10 ghép theo tên ----
  const items = {}; for (const c of S.cat) { await upsert('hr_vpp_item', 'code', { code: c.code, name: c.name, unit: c.unit }); items[norm(c.name)] = c; }
  let next = S.cat.length + 1; const code4 = {}, unmatched = [];
  for (const x of [...S.t9, ...S.t10]) {
    if (code4[x.name]) continue; const hit = items[norm(x.name)];
    if (hit) code4[x.name] = hit; else { const c = { code: 'VPP' + next++, name: x.name.trim(), unit: x.unit }; await upsert('hr_vpp_item', 'name', { code: c.code, name: c.name, unit: c.unit, descr: 'Tạo từ sổ kho T9–T10' }); code4[x.name] = c; unmatched.push(x.name.trim()); }
  }
  const ct = L['Cát Tường'];
  await q("DELETE FROM hr_vpp_in WHERE code LIKE 'SO-%'"); await q("DELETE FROM hr_vpp_issue WHERE code LIKE 'SO-%'");
  const ln = (rows, k) => rows.filter(r => r[k]).map(r => ({ code: code4[r.name].code, name: code4[r.name].name, unit: r.unit, qty: String(r[k]), qty_out: String(r[k]), note: '' }));
  await ins('hr_vpp_in', { code: 'SO-DAU-KY', legal_id: ct, supplier: 'Tồn đầu kỳ T9/2026 (từ file Quản lý VPP)', in_on: '2026-09-01', lines: ln(S.t9, 'open') });
  await ins('hr_vpp_in', { code: 'SO-NHAP-T9', legal_id: ct, supplier: 'Tổng nhập T9/2026 (từ file)', in_on: '2026-09-30', lines: ln(S.t9, 'inq') });
  await ins('hr_vpp_issue', { code: 'SO-XUAT-T9', legal_id: ct, emp_id: E2.NV151, issue_on: '2026-09-30', lines: ln(S.t9, 'outq') });
  await ins('hr_vpp_in', { code: 'SO-NHAP-T10', legal_id: ct, supplier: 'Tổng nhập T10/2026 (từ file)', in_on: '2026-10-29', lines: ln(S.t10, 'inq') });
  await ins('hr_vpp_issue', { code: 'SO-XUAT-T10', legal_id: ct, emp_id: E2.NV151, issue_on: '2026-10-29', lines: ln(S.t10, 'outq') });
  if (unmatched.length) await issue('VPP05', 'thong_tin', `${unmatched.length} mặt hàng trong sổ kho không khớp tên danh mục VPP05`, `Đã tạo mã mới VPP120+ : ${unmatched.join('; ')}. Cần gộp nếu trùng mặt hàng.`);
  await issue('VPP06', 'da_tu_xu_ly', 'Sổ kho T10: «Bút bi xanh» thiếu tồn cuối', 'File để trống ô Tồn cuối; app tính 0 + 24 − 0 = 24.');
  await issue('VPP06', 'thong_tin', 'Sổ kho chỉ có tổng theo tháng, không có từng phiếu và không ghi pháp nhân', 'Đã nạp thành phiếu tổng SO-… dưới Cát Tường. Tách kho theo pháp nhân nếu các công ty giữ kho riêng.');

  // ---- BH-01, CĐ-01 T11/2026 Cát Tường: đúng file ----
  const [irate, crate] = [await C.setting('ins'), await C.setting('cd')];
  if (!await one("SELECT 1 AS x FROM hr_ins_sheet WHERE legal_id = $1 AND month = '2026-11'", [ct])) {
    const empId = async n => (await one('SELECT id, code FROM hr_employee WHERE full_name = $1', [n]));
    const il = []; for (const x of S.ins) { const e = await empId(x.name); il.push({ emp_id: e.id, code: e.code, name: x.name, ins_no: x.ins_no, title: x.title, salary: x.salary, note: x.note || '', change: /Tăng/.test(x.note || '') ? 'Tăng mới' : '' }); }
    const t = B.insTotals(il, irate);
    await ins('hr_ins_sheet', { legal_id: ct, month: '2026-11', n_emp: t.n, base_total: t.base, due: t.due, rates: irate, lines: il, status: 'nhap' });
    const cl = []; for (const x of S.cd) { const e = await empId(x.name); cl.push({ emp_id: e.id, code: e.code, name: x.name, salary: x.salary, member: true, note: x.note || '', change: /Tăng/.test(x.note || '') ? 'Tăng mới' : '' }); }
    const k = B.cdTotals(cl, crate);
    await ins('hr_cd_sheet', { legal_id: ct, month: '2026-11', n_emp: k.n, base_total: k.base, due: Math.round(k.due), kept: Math.round(k.kept), rates: crate, lines: cl, status: 'nhap' });
  }
  for (const [kind, l] of [['pli', 'Mẫu 01/PLI'], ['atvsld', 'ATVSLĐ'], ['yte', 'Y tế lao động'], ['tnld', 'TNLĐ']]) if (!await one('SELECT 1 AS x FROM hr_gov_report WHERE kind = $1', [kind])) await ins('hr_gov_report', { legal_id: ct, kind, period: 'Cả năm 2026', due_on: '2027-01-05', to_org: kind === 'yte' ? 'Trung tâm Y tế tỉnh Bắc Ninh' : 'Sở Nội vụ tỉnh Bắc Ninh', status: 'chua' });
  await issue('BC-6T', 'can_cap_nhat', 'Hạn nộp báo cáo lao động đang đặt tạm 05/01/2027', 'Cần xác nhận hạn theo yêu cầu cơ quan nhận.');
  await issue('HD01–11', 'can_cap_nhat', 'Mẫu văn bản hợp đồng / quyết định chưa có nội dung', 'Bộ 53 biểu mẫu trỏ tới file «Sổ quản lý lao động» trên SharePoint, không nằm trong thư mục gửi. App đang in bản khung thông tin, cần file mẫu để in đúng lời văn.');
  console.log('Xong dữ liệu thật:', (await one('SELECT count(*) n FROM hr_employee')).n, 'nhân sự,', (await one('SELECT count(*) n FROM hr_vpp_item')).n, 'mã VPP,', (await one('SELECT count(*) n FROM hr_issue')).n, 'vấn đề đối soát');
}

// ---------- dữ liệu mẫu: mọi bản ghi is_demo = true, xóa được 1 chạm ----------
async function clearDemo() {
  for (const e of Object.values(E).reverse()) await q(`DELETE FROM ${e.table} WHERE is_demo`).catch(err => console.log(e.key, err.message));
  await q('DELETE FROM hr_approval WHERE is_demo'); await q('DELETE FROM hr_audit WHERE is_demo'); await q("DELETE FROM hr_payroll WHERE status = 'nhap'"); await q("DELETE FROM hr_job WHERE name = 'nhap_luong'");
}
async function demo() {
  await clearDemo();
  const emps = await q("SELECT * FROM hr_employee WHERE state <> 'thai_san' ORDER BY id"), L = Object.fromEntries((await q('SELECT id, short FROM hr_legal')).map(r => [r.short, r.id])), D = Object.fromEntries((await q('SELECT id, code FROM hr_dept')).map(r => [r.code, r.id]));
  const ct = L['Cát Tường'], tn = L['Thống Nhất'], g = emps.find(e => e.code === 'NV049'), y = emps.find(e => e.code === 'NV044'), rnd = (() => { let s = 7; return n => (s = (s * 1103515245 + 12345) & 0x7fffffff) % n; })();
  const D0 = { is_demo: true }, hol = await B.holidays({ q });
  // bảng công T9, T10 đến hôm nay
  for (const m of ['2026-09', '2026-10']) for (let d = 1; d <= 31; d++) {
    const day = `${m}-${String(d).padStart(2, '0')}`; if (isNaN(Date.parse(day)) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day || day > '2026-10-29' || !B.isWorkday(day, hol)) continue;
    for (const e of emps) { if (day < e.join_on) continue; const x = rnd(100), mark = x < 2 ? 'XO' : x < 3 ? 'XI' : x < 5 ? 'P' : 'HC'; await q('INSERT INTO hr_attendance (emp_id, day, mark, in_t, out_t, source, is_demo) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING', [e.id, day, mark, mark === 'XI' ? null : '07:5' + rnd(9), mark === 'XO' ? null : '17:3' + rnd(9), 'may']); }
  }
  for (const [c, n, b, t] of [['TS-0001', 'Máy tính xách tay Dell Latitude', 'HOME-HCNS', 'dang_dung'], ['TS-0002', 'Máy in Canon LBP 2900', 'HOME-HCNS', 'dang_dung'], ['TS-0003', 'Máy chiếu Epson', 'HOME-HCNS', 'sua_chua'], ['TS-0004', 'Máy tính bàn HP', 'HOME-KD', 'dang_dung'], ['TS-0005', 'Tủ hồ sơ sắt', 'HOME-TCKT', 'dang_dung'], ['TS-0006', 'Điều hòa Daikin 12000BTU', 'HOME-QLDA', 'cho_thanh_ly'], ['TS-0007', 'Bàn họp 12 chỗ', 'HOME-BLD', 'dang_dung']])
    await ins('hr_asset', { ...D0, code: c, name: n, unit: 'Cái', legal_id: ct, dept_id: D[b], holder_id: t === 'dang_dung' && c !== 'TS-0007' ? y.id : null, in_on: '2025-06-01', status: t, repair_due: t === 'sua_chua' ? '2026-10-20' : null, location: 'Tầng 4' });
  await q("UPDATE hr_vehicle SET inspect_to = '2026-11-03', insure_to = '2026-11-25', service_to = '2026-10-25', km = 48250 WHERE code = 'XE05'");
  const v2 = await ins('hr_vehicle', { ...D0, code: 'XE-MAU', plate: '99A-000.00', brand: 'Xe mẫu', legal_id: tn, inspect_to: '2027-03-01', insure_to: '2027-02-01', service_to: '2026-12-15', km: 21000, state: 'san_sang' });
  const xe = (await one("SELECT id FROM hr_vehicle WHERE code = 'XE05'")).id, room = (await one("SELECT id FROM hr_room WHERE code = 'PH01'")).id;
  for (let i = 1; i <= 8; i++) { const d = `2026-10-${String(5 + i * 2).padStart(2, '0')}`, e = emps[3 + i * 2], s = `${d}T01:00:00Z`, end = `${d}T05:00:00Z`;
    const b = await ins('hr_car_book', { ...D0, code: `MAU-X${i}`, reg_on: d, legal_id: e.legal_id, emp_id: e.id, start_at: s, end_at: end, route: 'CTN - HN - CTN', vehicle_id: i % 3 ? xe : v2, status: i < 7 ? 'da_tra' : 'da_duyet' });
    if (i < 7) await ins('hr_car_return', { ...D0, code: `MAU-T${i}`, book_id: b, got_at: s, back_at: end, km_in: 48000 + i * 40, km_out: 48000 + i * 40 + 60 + rnd(50), cost: i % 2 ? 150000 : 0, cost_doc: i % 4 === 1 ? null : 'HĐ cầu đường', cond_in: 'tot', cond_out: 'tot', papers_back: true });
    await ins('hr_room_book', { ...D0, code: `MAU-P${i}`, reg_on: d, legal_id: e.legal_id, emp_id: e.id, host: e.full_name, start_at: `${d}T02:00:00Z`, end_at: `${d}T03:30:00Z`, room_id: room, descr: 'Họp giao ban', status: i < 7 ? 'hoan_thanh' : 'da_duyet', real_end: i < 7 ? `${d}T03:20:00Z` : null, clean_ok: i < 7 });
    await ins('hr_mail', { ...D0, code: `MAU-G${i}`, legal_id: e.legal_id, send_on: d, content: 'Hồ sơ gửi đối tác', emp_id: e.id, to_name: 'Đối tác ' + i, to_addr: 'Hà Nội', bill_no: 'VTP' + (10000 + i), carrier: 'Viettel Post', status: i < 6 ? 'da_giao' : 'dang_chuyen', done_on: i < 6 ? d : null, fee: 25000 + i * 3000 });
  }
  for (let d = 1; d <= 29; d++) { const day = `2026-10-${String(d).padStart(2, '0')}`; if (!B.isWorkday(day, hol)) continue; const a = 28 + rnd(6); await ins('hr_meal_day', { ...D0, legal_id: ct, day, actual: a, charged: a, price: 30000 }); await ins('hr_meal_out', { ...D0, code: `MAU-C${d}`, legal_id: ct, pay_on: day, content: 'Thực phẩm bếp', amount: 700000 + rnd(250) * 1000, doc: 'Phiếu chợ' }); }
  for (const e of emps.slice(0, 20)) { await ins('hr_meal_reg', { ...D0, legal_id: e.legal_id, emp_id: e.id, dept_id: e.dept_id, month: '2026-10', days: [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30], n_days: 22 }); await ins('hr_meal_in', { ...D0, code: 'MAU-A' + e.id, legal_id: ct, month: '2026-10', name: e.full_name, qty: 22, amount: 660000, got_on: '2026-10-05' }); }
  const ev = await ins('hr_event', { ...D0, code: 'MAU-SK1', legal_id: ct, name: 'Gặp mặt 20/10', org: 'Phòng HCNS', host_id: g.id, at: '2026-10-20T03:00:00Z', place: 'Phòng đào tạo tầng 3', invited: 40, attended: 36, budget: 12000000, goal_ok: true, review: 'Tổ chức tốt', status: 'dong', tasks: [{ task: 'Đặt hoa', who: 'Yến', due: '18/10', result: 'Đủ 25 bó', done: 'Xong' }] });
  await ins('hr_event_cost', { ...D0, code: 'MAU-CP1', event_id: ev, lines: [{ item: 'Hoa', plan: '5000000', actual: '4800000', doc: 'HĐ01' }, { item: 'Tiệc trà', plan: '7000000', actual: '7300000', doc: 'HĐ02' }], plan_total: 12000000, actual_total: 12100000 });
  const p1 = await ins('hr_rec_plan', { ...D0, code: 'MAU-TD1', legal_id: tn, dept_id: D['HOME-KD'], period: '2026', position: 'Nhân viên kinh doanh', qty: 2, channel: 'TopCV', req_on: '2026-09-15', due_on: '2026-10-20', rec_state: 'dang_tuyen', status: 'da_duyet' });
  await ins('hr_rec_plan', { ...D0, code: 'MAU-TD2', legal_id: ct, dept_id: D['HOME-KD'], period: '2026', position: 'Phó phòng kinh doanh', qty: 1, channel: 'Giới thiệu nội bộ', req_on: '2026-10-01', due_on: '2026-11-30', rec_state: 'dang_tuyen', status: 'da_duyet' });
  for (const [i, st] of ['S33', 'S34', 'S35', 'S12', 'S11', 'S53'].entries()) await ins('hr_candidate', { ...D0, code: `MAU-UV${i + 1}`, full_name: `Ứng viên mẫu ${i + 1}`, gender: i % 2 ? 'Nam' : 'Nữ', phone: '0900000000', source: i % 2 ? 'TopCV' : 'Facebook', legal_id: tn, status: st, got_on: '2026-10-05', position: 'Nhân viên kinh doanh', dept_id: D['HOME-KD'], plan_id: p1 });
  for (const [d, t, q1] of [['HOME-KD', 'Nhân viên kinh doanh', 6], ['HOME-QLDA', 'Chuyên viên QLDA', 8], ['HOME-HCNS', 'Chuyên viên HCNS', 3], ['HOME-TCKT', 'Kế toán tổng hợp', 3], ['HOME-PC', 'Chuyên viên pháp chế', 3]]) await ins('hr_headcount', { ...D0, legal_id: ct, dept_id: D[d], title: t, period: '2026', qty: q1, status: 'da_duyet' });
  for (const [c, m] of [['VPP01', 50], ['VPP02', 10], ['VPP28', 30], ['VPP06', 10]]) await ins('hr_vpp_norm', { ...D0, legal_id: ct, period: '2026', from_on: '2026-10-01', item_code: c, min_qty: m });
  const u = await one("SELECT id FROM hr_user WHERE username = 'NV044'");
  for (const [i, e] of [emps[6], emps[9], emps[14]].entries()) {
    await ins('hr_leave', { ...D0, code: `MAU-NP${i}`, emp_id: e.id, type_code: 'P', from_on: '2026-11-0' + (3 + i), to_on: '2026-11-0' + (3 + i), days: 1, reason: 'Việc gia đình', status: 'cho_duyet', created_by: u.id });
    await ins('hr_explain', { ...D0, code: `MAU-GT${i}`, emp_id: e.id, day: '2026-10-2' + i, kind: 'quen_ra', right_time: '17:30', reason: 'Quên chấm', status: 'cho_duyet', created_by: u.id });
    await ins('hr_ot', { ...D0, code: `MAU-TC${i}`, emp_id: e.id, day: '2026-10-1' + (i + 2), from_t: '17:30', to_t: '19:30', day_kind: 'thuong', task: 'Hoàn thiện hồ sơ', hours_reg: 2, hours_ok: 2, status: 'da_duyet', created_by: u.id });
  }
  for (const e of emps) await ins('hr_leave_bal', { ...D0, emp_id: e.id, year: 2026, opening: 2, earned: 10, adjust: 0 });
  console.log('Xong dữ liệu mẫu');
}

(async () => {
  try {
    if (process.argv.includes('--clear-demo')) { await clearDemo(); console.log('Đã xóa dữ liệu mẫu'); return; }
    await real();
    if (process.argv.includes('--demo')) await demo();
  } catch (e) { console.error(e); process.exitCode = 1; } finally { await pool.end(); }
})();

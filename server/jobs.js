// Việc chạy nền — thay HCNS làm phần lặp lại. Chạy khi khởi động và mỗi giờ; mỗi việc chỉ chạy 1 lần cho 1 kỳ (bảng hr_job).
const { q, one } = require('./db');
const C = require('./core');
const B = require('./biz');
const { SYS, today, addDays } = C;

async function once(name, period, fn) {
  if (await one('SELECT 1 AS x FROM hr_job WHERE name = $1 AND period = $2', [name, period])) return;
  const result = await fn();
  await q('INSERT INTO hr_job (name, period, result) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [name, period, result || 'xong']);
}
async function monthly(m) {
  const list = await q("SELECT l.id, l.short FROM hr_legal l WHERE EXISTS (SELECT 1 FROM hr_employee e WHERE e.legal_id = l.id AND e.state <> 'da_nghi')");
  await once('ky_cong', m, async () => { let c = 0; for (const l of list) if (!await one('SELECT 1 AS x FROM hr_att_period WHERE legal_id=$1 AND month=$2', [l.id, m])) { await C.create('att_period', { legal_id: l.id, month: m }, SYS, { system: true }); c++; } return `Mở ${c} kỳ công`; });
  await once('nhap_bh_cd', m, async () => { // nháp bảng BH, CĐ kế thừa nhân sự + tăng/giảm so với tháng trước
    let c = 0;
    for (const l of list) for (const ent of ['ins_sheet', 'cd_sheet']) if (!await one(`SELECT 1 AS x FROM hr_${ent} WHERE legal_id=$1 AND month=$2`, [l.id, m])) { await C.create(ent, { legal_id: l.id, month: m }, SYS, { system: true }); c++; }
    return `Tạo ${c} bảng nháp`;
  });
  await once('cong_phep', m, async () => {  // +1 ngày phép mỗi tháng cho người đang làm chính thức (quy tắc 12 ngày/năm, sửa ở cấu hình)
    const y = +m.slice(0, 4); const r = await q(`SELECT id FROM hr_employee WHERE state = 'dang_lam'`);
    for (const e of r) await q(`INSERT INTO hr_leave_bal (emp_id, year, opening, earned, adjust) VALUES ($1,$2,0,1,0) ON CONFLICT (emp_id, year) DO UPDATE SET earned = hr_leave_bal.earned + 1`, [e.id, y]);
    return `${r.length} người`;
  });
}
// đầu tháng sau: nháp bảng lương tháng trước từ công + tăng ca + hồ sơ
async function payrollDraft(prev) {
  await once('nhap_luong', prev, async () => {
    let c = 0;
    for (const l of await q("SELECT DISTINCT legal_id FROM hr_employee WHERE state <> 'da_nghi'")) if (!await one('SELECT 1 AS x FROM hr_payroll WHERE legal_id=$1 AND month=$2', [l.legal_id, prev])) { await C.create('payroll', { legal_id: l.legal_id, month: prev }, SYS, { system: true }); c++; }
    return `Tạo ${c} bảng lương nháp`;
  });
}
async function daily() {
  const t = today();
  // HĐ quá hạn không tự coi là vi phạm: chuyển «Hết hạn – chờ quyết định»
  await q("UPDATE hr_contract SET state = 'cho_quyet_dinh' WHERE state = 'hieu_luc' AND to_on IS NOT NULL AND to_on < $1 AND kind IN ('HD01','HD02')", [t]);
  await q("UPDATE hr_employee SET state = 'da_nghi' WHERE leave_on IS NOT NULL AND leave_on < $1 AND state <> 'da_nghi'", [t]);
  // báo cáo lao động: tự lập đầu việc cho kỳ 6 tháng và cả năm
  const y = t.slice(0, 4), mm = t.slice(5, 7);
  if (mm === '06' || mm === '12') await once('bc_dinh_ky', y + '-' + mm, async () => {
    const period = mm === '06' ? `6 tháng đầu năm ${y}` : `Cả năm ${y}`, due = mm === '06' ? `${y}-07-05` : `${+y + 1}-01-05`;
    for (const l of await q("SELECT id FROM hr_legal WHERE state = 'dang_hd'")) for (const kind of ['pli', 'atvsld', 'yte', 'tnld'])
      if (!await one('SELECT 1 AS x FROM hr_gov_report WHERE legal_id=$1 AND kind=$2 AND period=$3', [l.id, kind, period])) await C.create('gov_report', { legal_id: l.id, kind, period, due_on: due }, SYS, { system: true });
  });
}
async function tick() {
  try { const m = today().slice(0, 7); await monthly(m); await payrollDraft(B.prevMonth(m)); await daily(); } catch (e) { console.error('Việc nền lỗi:', e.message); }
}
const start = () => { tick(); setInterval(tick, 3600e3); };
module.exports = { start, tick };

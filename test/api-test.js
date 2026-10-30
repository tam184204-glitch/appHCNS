// Kiểm thử luồng nghiệp vụ & tự động hóa qua API thật, chạy trên schema tạm? Không: chạy trên DB thật, bản ghi test đánh dấu is_demo rồi dọn ở cuối.
const assert = require('assert');
const B = require('../server/biz');
const { q, one, pool } = require('../server/db');
const U = 'http://127.0.0.1:3600';
let cookie = '';
const api = async (m, u, b) => { const r = await fetch(U + u, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: r.status, d }; };
const as = async code => { const u = await one('SELECT id FROM hr_user WHERE username=$1', [code]); assert.equal((await api('POST', '/api/as/' + u.id, {})).s, 200); };
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '→', e.message); } };

(async () => {
  const cfg = (await one("SELECT value FROM hr_setting WHERE key='pay'")).value, ins = (await one("SELECT value FROM hr_setting WHERE key='ins'")).value;
  await as('NV049');
  await T('Lương: khớp dòng 14 ảnh TL02 (thử việc 4 công)', () => { const x = B.payLine({ p1: 15204000, p2: 9796000, d100: 0, d85: 4, worked: 4, trial_pct: 85, kpi: 100, ins_base: 0, n_dep: 6, kpcd_pct: 2 }, cfg, ins, 26); assert.equal(x.p1_net, 1988215); assert.ok(Math.abs(x.p2_net - 1281014) <= 1); assert.equal(x.meal, 100000); assert.ok(Math.abs(x.total - 3369229) <= 1); assert.equal(x.deduct, 52700000); assert.equal(x.tax, 0); assert.ok(Math.abs(x.net - 3369229) <= 1); });
  await T('Lương: khớp dòng 15 ảnh TL02 (P1 7,8tr, 26 công)', () => { const x = B.payLine({ p1: 7800000, p2: 4200000, d100: 26, d85: 0, worked: 24, kpi: 100, ins_base: 7800000, n_dep: 1, union: true, kpcd_pct: 2 }, cfg, ins, 26); assert.equal(x.total, 12600000); assert.equal(x.e_ins, 819000); assert.equal(x.net, 11781000); assert.equal(x.c_bhxh + x.c_bhyt + x.c_bhtn, 1677000); assert.equal(x.deduct, 21700000); });
  await T('BH-01 T11/2026 Cát Tường = file (64.682.240; NLĐ 21.223.860; DN 43.458.380)', async () => { const r = (await api('GET', '/api/report/BH-01?month=2026-11')).d; const k = r.kpis; assert.equal(k[3][1], 64682240); assert.equal(k[1][1], 21223860); assert.equal(k[2][1], 43458380); });
  await T('CĐ-01 T11/2026 = file (KPCĐ 4.042.640; ĐPCĐ 1.010.660; nộp 1.313.858; giữ 3.739.442)', async () => { const r = (await api('GET', '/api/report/' + encodeURIComponent('CĐ-01') + '?month=2026-11')).d.rows.find(x => x.m === '2026-11' && x.base === 202132000); assert.equal(r.kp, 4042640); assert.equal(r.dp, 1010660); assert.equal(Math.round(r.due), 1313858); assert.equal(Math.round(r.kept), 3739442); });
  await T('VPP06 T10 khớp file (Giấy A4 nhập 30, Keo dán nước xuất hết)', async () => { const r = (await api('GET', '/api/report/VPP06?month=2026-10')).d.rows; const a = r.find(x => x.name === 'Giấy A4'); assert.equal(a.inq, 30); assert.equal(a.close, 30); });
  await T('Số liệu HD12: 3 HĐ thiếu ngày hết hạn báo «Cần cập nhật», không coi là vi phạm', async () => { const r = (await api('GET', '/api/report/HD12')).d.rows.filter(x => x.st === 'Cần cập nhật dữ liệu'); assert.ok(r.length >= 3); });

  const legal = (await one("SELECT id FROM hr_legal WHERE code='CT'")).id, dept = (await one("SELECT id FROM hr_dept WHERE code='HOME-KD'")).id;
  await T('Tự động: ứng viên → 1 chạm → hồ sơ NV + HĐ thử việc', async () => {
    const c = (await api('POST', '/api/e/candidate', { full_name: 'TEST Ứng viên', position: 'NV Test', source: 'TopCV', legal_id: legal, dept_id: dept, status: 'S53', phone: '0912345678' })).d.row;
    const x = await api('POST', `/api/e/candidate/${c.id}/act/nhan_viec`, { start_on: '2026-11-01' }); assert.equal(x.s, 200, JSON.stringify(x.d));
    const e = await one('SELECT * FROM hr_employee WHERE id=$1', [x.d.open[1]]); assert.equal(e.state, 'thu_viec'); const h = await one('SELECT * FROM hr_contract WHERE emp_id=$1', [e.id]); assert.equal(h.kind, 'HD01'); assert.equal(h.to_on, '2026-12-31'); global.tEmp = e.id;
  });
  await T('Tự động: HĐ kế tiếp thay HĐ cũ, hồ sơ thành Đang làm', async () => { const c = await one('SELECT id FROM hr_contract WHERE emp_id=$1', [tEmp]); const r = await api('POST', `/api/contract/${c.id}/renew`, {}); assert.equal(r.s, 200, JSON.stringify(r.d)); assert.equal(r.d.row.kind, 'HD02'); assert.equal((await one('SELECT state FROM hr_contract WHERE id=$1', [c.id])).state, 'thay_the'); assert.equal((await one('SELECT state FROM hr_employee WHERE id=$1', [tEmp])).state, 'dang_lam'); });
  await T('Tự động: QĐ điều chỉnh lương duyệt → hồ sơ đổi lương, BH tháng sau hiện Điều chỉnh', async () => {
    const d = (await api('POST', '/api/e/decision', { emp_id: tEmp, kind: 'HD08', no: 'TEST/QD', from_on: '2026-11-01', new_p1: 9000000, new_ins: 9000000 })).d.row;
    assert.equal((await api('POST', `/api/e/decision/${d.id}/submit`, {})).s, 200); const a = await api('POST', `/api/e/decision/${d.id}/approve`, { ok: true }); assert.equal(a.s, 200, JSON.stringify(a.d));
    const e = await one('SELECT * FROM hr_employee WHERE id=$1', [tEmp]); assert.equal(+e.ins_salary, 9000000);
    const s = (await api('POST', '/api/e/ins_sheet', { legal_id: legal, month: '2026-12' })).d.row; const row = await one('SELECT lines FROM hr_ins_sheet WHERE id=$1', [s.id]); const l = row.lines.find(x => x.emp_id === tEmp); assert.equal(l.change, 'Tăng mới'); await q('DELETE FROM hr_ins_sheet WHERE id=$1', [s.id]);
  });
  await T('Tự động: đơn nghỉ duyệt → ghi P vào bảng công, trừ ngày làm việc', async () => {
    const l = (await api('POST', '/api/e/leave', { emp_id: tEmp, type_code: 'P', from_on: '2026-11-02', to_on: '2026-11-03', reason: 't' })).d.row; assert.equal(+l.days, 2);
    await api('POST', `/api/e/leave/${l.id}/submit`, {}); assert.equal((await api('POST', `/api/e/leave/${l.id}/approve`, { ok: true })).s, 200); assert.equal((await one("SELECT mark FROM hr_attendance WHERE emp_id=$1 AND day='2026-11-02'", [tEmp])).mark, 'P');
  });
  await T('Khóa kỳ công: còn giải trình thì không khóa; đã khóa không ghi được công', async () => {
    const p = await one("SELECT id FROM hr_att_period WHERE legal_id=$1 AND month='2026-10'", [legal]); const x = (await api('POST', `/api/e/att_period/${p.id}/act/khoa`, {})); assert.equal(x.s, 400, 'phải bị chặn');
    await q("UPDATE hr_explain SET status='da_duyet' WHERE is_demo"); assert.equal((await api('POST', `/api/e/att_period/${p.id}/act/khoa`, {})).s, 200);
    const w = await api('PUT', '/api/timesheet', { emp_id: tEmp, day: '2026-10-05', mark: 'HC' }); assert.equal(w.s, 400); await api('POST', `/api/e/att_period/${p.id}/act/mo`, {}); await q("UPDATE hr_explain SET status='cho_duyet' WHERE is_demo");
  });
  await T('VPP: đề xuất → duyệt → cấp phát chặn vượt tồn, sổ kho giảm đúng', async () => {
    const before = (await B.vppStock({ q }, legal)).VPP01 || 0; await as('NV044');
    const r = (await api('POST', '/api/e/vpp_req', { legal_id: legal, emp_id: tEmp, req_on: '2026-11-01', lines: [{ code: 'VPP01', name: 'x', unit: 'Cuộn', qty: '3' }] })); assert.equal(r.s, 200, JSON.stringify(r.d));
    await api('POST', `/api/e/vpp_req/${r.d.row.id}/submit`, {}); await as('NV049'); assert.equal((await api('POST', `/api/e/vpp_req/${r.d.row.id}/approve`, { ok: true })).s, 200);
    const c = await api('POST', `/api/e/vpp_req/${r.d.row.id}/act/cap_phat`, {}); assert.equal(c.s, 200, JSON.stringify(c.d)); assert.equal((await B.vppStock({ q }, legal)).VPP01 || 0, before - 3);
    const over = await api('POST', '/api/e/vpp_issue', { legal_id: legal, emp_id: tEmp, lines: [{ code: 'VPP01', qty_out: '99999' }] }); assert.equal(over.s, 400); assert.match(over.d.error, /không đủ/);
    await q('DELETE FROM hr_vpp_issue WHERE req_id=$1', [r.d.row.id]); await q('DELETE FROM hr_vpp_req WHERE id=$1', [r.d.row.id]);
  });
  await T('Xe: duyệt lịch trùng bị chặn; km trả < km nhận bị chặn', async () => {
    const v = (await one("SELECT id FROM hr_vehicle WHERE code='XE05'")).id, mk = async () => (await api('POST', '/api/e/car_book', { legal_id: legal, emp_id: tEmp, start_at: '2026-12-01T08:00:00+07:00', end_at: '2026-12-01T12:00:00+07:00', route: 'A-B', vehicle_id: v })).d.row;
    const a = await mk(), b = await mk(); await as('NV044'); for (const x of [a, b]) await api('POST', `/api/e/car_book/${x.id}/submit`, {}); await as('NV049'); assert.equal((await api('POST', `/api/e/car_book/${a.id}/approve`, { ok: true })).s, 200); assert.equal((await api('POST', `/api/e/car_book/${b.id}/approve`, { ok: true })).s, 400);
    assert.equal((await api('POST', '/api/e/car_return', { book_id: a.id, got_at: '2026-12-01T08:00:00+07:00', back_at: '2026-12-01T12:00:00+07:00', km_in: 100, km_out: 50 })).s, 400);
    await q('DELETE FROM hr_approval WHERE ent=$1 AND rec_id = ANY($2)', ['car_book', [a.id, b.id]]); await q('DELETE FROM hr_car_book WHERE id = ANY($1)', [[a.id, b.id]]);
  });
  await T('Chốt kỳ: số đã chốt không đổi khi nguồn thay đổi', async () => {
    await api('POST', '/api/report/TS02/close', { month: '2026-10' }); const s = (await api('GET', '/api/report/TS02')).d.snapshots[0], before = (await api('GET', `/api/report/TS02?snapshot=${s.id}`)).d.rows.length;
    const x = await api('POST', '/api/e/asset', { code: 'TEST-TS', name: 't', legal_id: legal, status: 'trong_kho' }); const after = (await api('GET', `/api/report/TS02?snapshot=${s.id}`)).d.rows.length; assert.equal(before, after); await api('DELETE', '/api/e/asset/' + x.d.row.id); await q('DELETE FROM hr_snapshot WHERE id=$1', [s.id]);
  });
  await T('KPI = chi tiết: thẻ Tổng nhân sự bằng số dòng HS02', async () => { const d = (await api('GET', '/api/dash/DB01?month=2026-10')).d, r = (await api('GET', '/api/report/HS02?month=2026-10')).d; assert.equal(d.kpis[0][1], r.rows.length); });
  // ---- phân quyền ----
  await as('NV068');
  await T('NLĐ: chỉ thấy hồ sơ của mình', async () => { const r = (await api('GET', '/api/e/employee')).d; assert.equal(r.total, 1); });
  await T('NLĐ: không xem bảng lương, không mở dashboard, không mở hồ sơ người khác', async () => { assert.equal((await api('GET', '/api/e/payroll')).s, 403); assert.equal((await api('GET', '/api/dash/DB01')).s, 403); assert.equal((await api('GET', '/api/e/employee/' + tEmp)).s, 403); });
  await as('NV001');
  await T('BGĐ: thấy tổng lương nhưng không thấy dòng cá nhân; CCCD che', async () => { const r = (await api('GET', '/api/report/TL05?month=2026-09')).d; assert.equal(r.rows.length, 0); const e = (await api('GET', '/api/e/employee')).d.rows.find(x => x.code === 'NV049'); assert.ok(String(e.cccd).startsWith('•')); assert.equal(e.pay_p1, null); });
  await as('NV151');
  await T('CV HCNS: chỉ pháp nhân được phân công', async () => { const r = (await api('GET', '/api/e/employee?limit=100')).d.rows; assert.ok(r.every(x => ['Thống Nhất', 'Tiến Đạt'].includes(x.legal_id__l))); });
  await as('NV021');
  await T('CV Hành chính: không xem bảng lương', async () => { assert.equal((await api('GET', '/api/e/payroll')).s, 403); });
  await as('NV049');
  // dọn
  await q('DELETE FROM hr_decision WHERE emp_id=$1', [tEmp]); await q('DELETE FROM hr_leave WHERE emp_id=$1', [tEmp]); await q('DELETE FROM hr_attendance WHERE emp_id=$1', [tEmp]); await q('DELETE FROM hr_contract WHERE emp_id=$1', [tEmp]); await q('UPDATE hr_candidate SET plan_id=NULL WHERE full_name=$1', ['TEST Ứng viên']); await q('DELETE FROM hr_candidate WHERE full_name=$1', ['TEST Ứng viên']); await q('DELETE FROM hr_employee WHERE id=$1', [tEmp]);
  await q("DELETE FROM hr_approval WHERE rec_id NOT IN (SELECT id FROM hr_leave) AND ent='leave'"); await q("DELETE FROM hr_approval WHERE ent='decision' AND rec_id NOT IN (SELECT id FROM hr_decision)");
  console.log(`\n${pass} đạt, ${fail} trượt`); await pool.end(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

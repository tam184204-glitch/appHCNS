// Nghiệp vụ & tự động hóa: mỗi thao tác của HCNS kéo theo các dữ liệu liên quan, để không phải nhập lại.
//   Ứng viên nhận Offer → hồ sơ NV + HĐ thử việc · QĐ duyệt → cập nhật hồ sơ, lương, lịch sử · HĐ mới → thay HĐ cũ
//   Đơn nghỉ / công tác / giải trình / chấm bù duyệt → tự ghi bảng công · Đơn nghỉ việc duyệt → QĐ chấm dứt nháp, thu hồi tài sản
//   Mỗi tháng (jobs.js): nháp bảng công – lương – BH – CĐ, tăng/giảm lao động so với tháng trước, cộng phép.
const C = require('./core');
const { q, one } = require('./db');
const { bad, today, addDays, dayDiff } = C;

const setting = k => C.setting(k);
const n = v => +String(v ?? '').replace(/\./g, '').replace(',', '.') || 0;
const lastDay = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const monthsOf = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
const nextMonth = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)); return d.toISOString().slice(0, 7); };
const prevMonth = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); };
const hoursBetween = (a, b) => { const p = s => { const [h, m] = String(s).split(':').map(Number); return h + (m || 0) / 60; }; let x = p(b) - p(a); if (x < 0) x += 24; return Math.round(x * 100) / 100; };
const isWorkday = (d, hol) => new Date(d + 'T00:00:00Z').getUTCDay() !== 0 && !hol.has(d);
const holidays = async db => new Set((await db.q('SELECT day FROM hr_holiday')).map(r => r.day));

// ---------- kỳ công ----------
async function assertOpen(db, empId, day) {
  const r = await db.one(`SELECT p.status FROM hr_att_period p JOIN hr_employee e ON e.legal_id = p.legal_id WHERE e.id = $1 AND p.month = $2`, [empId, day.slice(0, 7)]);
  if (r?.status === 'khoa') bad(`Kỳ công ${day.slice(5, 7)}/${day.slice(0, 4)} đã khóa — không ghi được công`);
}
async function setMark(db, empId, day, mark, patch = {}, source = 'don', demo = false) {
  await assertOpen(db, empId, day);
  await db.q(`INSERT INTO hr_attendance (emp_id, day, mark, in_t, out_t, source, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (emp_id, day) DO UPDATE SET mark = EXCLUDED.mark, in_t = coalesce(EXCLUDED.in_t, hr_attendance.in_t), out_t = coalesce(EXCLUDED.out_t, hr_attendance.out_t), source = EXCLUDED.source, updated_at = now()`,
  [empId, day, mark, patch.in_t || null, patch.out_t || null, source, demo]);
}
async function markRange(db, empId, from, to, mark, source, demo) {
  const hol = await holidays(db); let c = 0;
  for (const d of monthsOf(from, to)) if (isWorkday(d, hol)) { await setMark(db, empId, d, mark, {}, source, demo); c++; }
  return c;
}

// ---------- tồn kho VPP ----------
async function vppStock(db, legalId, upto) {
  const s = {}, W = upto ? ' AND d <= $2' : '', p = upto ? [legalId, upto] : [legalId];
  const add = (code, v) => { s[code] = (s[code] || 0) + v; };
  for (const r of await db.q(`SELECT lines, in_on AS d FROM hr_vpp_in t, LATERAL (SELECT t.in_on AS d) x WHERE legal_id = $1${W}`, p)) for (const l of r.lines || []) add(l.code, n(l.qty));
  for (const r of await db.q(`SELECT lines, issue_on AS d FROM hr_vpp_issue t, LATERAL (SELECT t.issue_on AS d) x WHERE legal_id = $1${W}`, p)) for (const l of r.lines || []) add(l.code, -n(l.qty_out));
  return s;
}

// ---------- hook từng loại ----------
const empFill = async (rec, db) => { if (rec.emp_id && (!rec.dept_id || !rec.legal_id)) { const e = await db.one('SELECT legal_id, dept_id FROM hr_employee WHERE id = $1', [rec.emp_id]); if (e) { rec.dept_id ??= e.dept_id; rec.legal_id ??= e.legal_id; } } };
const chkTime = r => { if (r.start_at && r.end_at && r.end_at <= r.start_at) bad('Thời gian kết thúc phải sau thời gian bắt đầu'); };
const overlap = async (db, tbl, col, id, r, label) => {
  const x = await db.one(`SELECT code FROM ${tbl} WHERE ${col} = $1 AND id <> $2 AND status IN ('da_duyet','dang_di') AND tstzrange(start_at, end_at) && tstzrange($3::timestamptz, $4::timestamptz) LIMIT 1`, [r[col], id || 0, r.start_at, r.end_at]);
  return x && `${label} đã được giữ bởi ${x.code} trong khung giờ này`;
};
const empOfCode = (db, code) => db.one('SELECT * FROM hr_employee WHERE code = $1', [code]);

const H = {
  employee: {
    async beforeSave(r, old, ctx) {
      if (r.leave_on && r.join_on && r.leave_on < r.join_on) bad('Ngày nghỉ việc không được trước ngày vào làm');
      if (r.state === 'da_nghi' && !r.leave_on) r.leave_on = today();
      r.docs = (r.docs || []).filter(Boolean);
    },
  },
  contract: {
    async beforeSave(r, old, ctx) {
      await empFill(r, ctx.db);
      if (r.kind === 'HD03') r.to_on = null;
      else if (['HD01', 'HD02'].includes(r.kind) && !r.to_on) ctx.warn.push('Hợp đồng có thời hạn chưa có ngày hết hạn — sẽ vào danh sách «Cần cập nhật dữ liệu»');
      if (r.to_on && r.to_on < r.from_on) bad('Ngày hết hạn phải sau ngày hiệu lực');
      if (r.kind === 'HD01' && r.trial_pct == null) r.trial_pct = (await setting('pay')).trial_pct;
    },
    async afterSave(r, old, ctx) {   // HĐ mới (không phải phụ lục) → HĐ cũ thành «Đã thay thế», hồ sơ đồng bộ theo
      if (old || r.kind === 'HD04') return;
      await ctx.db.q("UPDATE hr_contract SET state = 'thay_the' WHERE emp_id = $1 AND id <> $2 AND kind <> 'HD04' AND state IN ('hieu_luc','cho_quyet_dinh')", [r.emp_id, r.id]);
      await ctx.db.q("UPDATE hr_employee SET state = CASE WHEN $2 = 'HD01' THEN 'thu_viec' WHEN state = 'thu_viec' THEN 'dang_lam' ELSE state END WHERE id = $1", [r.emp_id, r.kind]);
    },
  },
  decision: {
    async beforeSave(r, old, ctx) { if (r.kind === 'HD08' && !(r.new_p1 || r.new_p2 || r.new_ins)) ctx.warn.push('QĐ điều chỉnh lương chưa có mức lương mới'); },
    async afterApprove(r, ok, ctx) {
      if (!ok) return;
      const db = ctx.db, p = {};
      if (['HD05', 'HD06', 'HD07'].includes(r.kind)) { if (r.legal_id) p.legal_id = r.legal_id; if (r.dept_id) p.dept_id = r.dept_id; if (r.title) p.title = r.title; }
      if (r.kind === 'HD08') { if (r.new_p1 != null) p.pay_p1 = r.new_p1; if (r.new_p2 != null) p.pay_p2 = r.new_p2; if (r.new_ins != null) p.ins_salary = r.new_ins; }
      if (['HD10', 'HD11'].includes(r.kind)) {
        p.state = 'da_nghi'; p.leave_on = r.from_on;
        await db.q("UPDATE hr_contract SET state = 'cham_dut' WHERE emp_id = $1 AND state = 'hieu_luc'", [r.emp_id]);
        await db.q('UPDATE hr_user SET active = false WHERE emp_id = $1', [r.emp_id]);
      }
      if (Object.keys(p).length) await C.sys(db, 'employee', r.emp_id, p, ctx.user, 'tu_dong', `Theo ${r.no}`);
    },
  },
  resign: {
    async afterApprove(r, ok, ctx) {
      if (!ok) return;
      const db = ctx.db, e = await db.one('SELECT e.*, (SELECT kind FROM hr_contract c WHERE c.emp_id = e.id AND c.state = $2 ORDER BY from_on DESC LIMIT 1) AS ck FROM hr_employee e WHERE e.id = $1', [r.emp_id, 'hieu_luc']);
      const kind = e.ck === 'HD01' ? 'HD11' : 'HD10';
      await C.create('decision', { emp_id: r.emp_id, kind, no: `${r.code}/QĐ`, from_on: r.last_day, legal_id: e.legal_id, reason: `Theo đơn xin nghỉ việc ${r.code}: ${r.reason}` }, ctx.user, { db, system: true, note: 'Tự tạo nháp từ đơn nghỉ việc' });
      const held = await db.q('SELECT code, name FROM hr_asset WHERE holder_id = $1', [r.emp_id]);
      if (held.length) ctx.warn.push(`Cần thu hồi ${held.length} tài sản: ${held.map(x => x.code).join(', ')}`);
    },
  },
  vpp_req: {
    async beforeSave(r, old, ctx) { await empFill(r, ctx.db); if (!(r.lines || []).some(l => n(l.qty) > 0)) bad('Phiếu đề xuất cần ít nhất 1 dòng có số lượng'); },
    acts: { async cap_phat(r, d, ctx) {   // kế thừa danh mục sao chép từ phiếu đề xuất; tồn không đủ thì cấp theo số tồn
      const st = await vppStock(ctx.db, r.legal_id);
      const lines = r.lines.map(l => { const have = Math.max(st[l.code] || 0, 0), q2 = Math.min(n(l.qty), have); return { ...l, qty_out: String(q2), note: q2 < n(l.qty) ? `Tồn chỉ còn ${have}` : l.note }; });
      const out = await C.create('vpp_issue', { legal_id: r.legal_id, req_id: r.id, issuer_id: ctx.user.emp_id, emp_id: r.emp_id, dept_id: r.dept_id, issue_on: today(), lines }, ctx.user, { db: ctx.db, system: true });
      return { patch: { status: 'da_cap' }, open: ['vpp_issue', out.row.id] };
    } },
  },
  vpp_issue: { async beforeSave(r, old, ctx) {
    await empFill(r, ctx.db);
    const st = await vppStock(ctx.db, r.legal_id);
    if (old) for (const l of old.lines || []) st[l.code] = (st[l.code] || 0) + n(l.qty_out);
    for (const l of r.lines || []) { if (n(l.qty_out) > (st[l.code] || 0)) bad(`${l.code} ${l.name || ''}: tồn ${st[l.code] || 0}, không đủ cấp ${n(l.qty_out)}`); st[l.code] = (st[l.code] || 0) - n(l.qty_out); }
  } },
  vpp_norm: { async beforeSave(r, o, ctx) { if (!await ctx.db.one('SELECT 1 AS x FROM hr_vpp_item WHERE code = $1', [r.item_code])) bad(`Mã ${r.item_code} không có trong danh mục`); } },
  asset_in: { async afterSave(r, old, ctx) {    // nhập kho tự tạo / cập nhật danh mục tài sản
    if (old) return;
    for (const l of r.lines || []) {
      if (!l.code) continue;
      const a = await ctx.db.one('SELECT id FROM hr_asset WHERE code = $1', [l.code]);
      if (a) await C.sys(ctx.db, 'asset', a.id, { in_on: r.in_on, status: 'trong_kho', ...(l.model ? { model: l.model } : {}), ...(l.place ? { location: l.place } : {}) }, ctx.user, 'tu_dong', `Theo ${r.code}`);
      else await C.create('asset', { code: l.code, name: l.name || l.code, unit: l.unit || 'Cái', model: l.model, legal_id: r.legal_id, in_on: r.in_on, location: l.place, status: 'trong_kho' }, ctx.user, { db: ctx.db, system: true, demo: r.is_demo });
    }
  } },
  asset_move: { acts: { async da_nhan(r, d, ctx) {
    for (const l of r.lines || []) { const a = await ctx.db.one('SELECT id FROM hr_asset WHERE code = $1', [l.code]); if (a) await C.sys(ctx.db, 'asset', a.id, { dept_id: r.to_dept_id, holder_id: r.to_emp_id, status: 'dang_dung', ...(r.to_legal_id ? { legal_id: r.to_legal_id } : {}) }, ctx.user, 'tu_dong', `Theo ${r.code}`); }
    return { patch: { status: 'da_nhan' } };
  } } },
  asset_out: { async afterApprove(r, ok, ctx) {
    if (!ok) return;
    for (const l of r.lines || []) { const a = await ctx.db.one('SELECT id FROM hr_asset WHERE code = $1', [l.code]); if (a) await C.sys(ctx.db, 'asset', a.id, { status: r.purpose === 'thanh_ly' ? 'da_thanh_ly' : 'sua_chua', repair_due: r.due_on || null }, ctx.user, 'tu_dong', `Theo ${r.code}`); }
  } },
  asset_count: { async beforeSave(r, old, ctx) {   // kế thừa sổ quản lý tài sản
    if ((r.lines || []).length) return;
    r.lines = (await ctx.db.q(`SELECT a.code, a.name, a.status, e.full_name FROM hr_asset a LEFT JOIN hr_employee e ON e.id = a.holder_id WHERE a.legal_id = $1 AND a.status <> 'da_thanh_ly' ORDER BY a.code`, [r.legal_id])).map(a => ({ code: a.code, name: a.name, holder: a.full_name || '', sys: a.status, found: '', note: '' }));
  } },
  car_book: {
    async beforeSave(r, old, ctx) { chkTime(r); await empFill(r, ctx.db); const w = await overlap(ctx.db, 'hr_car_book', 'vehicle_id', r.id, r, 'Xe'); if (w) ctx.warn.push(w); },
    async onApprove(r, ok, ctx) { if (ok) { const w = await overlap(ctx.db, 'hr_car_book', 'vehicle_id', r.id, r, 'Xe'); if (w) bad(w); } },
    acts: { async di_xe() { return { patch: { status: 'dang_di' } }; }, async huy() { return { patch: { status: 'huy' } }; } },
  },
  car_return: {
    async beforeSave(r, old, ctx) {
      if (r.km_out < r.km_in) bad('Km khi trả không được nhỏ hơn km khi nhận');
      if (r.back_at <= r.got_at) bad('Giờ trả phải sau giờ nhận');
      if (r.cost > 0 && !r.cost_doc) ctx.warn.push('Có chi phí phát sinh nhưng chưa có chứng từ');
    },
    async afterSave(r, old, ctx) {
      const b = await ctx.db.one('SELECT id, vehicle_id FROM hr_car_book WHERE id = $1', [r.book_id]);
      await ctx.db.q("UPDATE hr_car_book SET status = 'da_tra' WHERE id = $1", [b.id]);
      await ctx.db.q('UPDATE hr_vehicle SET km = greatest(coalesce(km,0), $1) WHERE id = $2', [r.km_out, b.vehicle_id]);
    },
  },
  meal_reg: { async beforeSave(r, o, ctx) { await empFill(r, ctx.db); r.n_days = (r.days || []).length; } },
  meal_out: { beforeSave(r) { if (r.qty != null && r.price != null && !r.amount) r.amount = Math.round(r.qty * r.price); } },
  event_cost: { beforeSave(r) { r.plan_total = (r.lines || []).reduce((s, l) => s + n(l.plan), 0); r.actual_total = (r.lines || []).reduce((s, l) => s + n(l.actual), 0); } },
  event: { acts: { async dong(r, d, ctx) {
    const miss = []; if (r.attended == null) miss.push('số tham gia'); if (!r.review) miss.push('đánh giá / bài học rút ra');
    if (!await ctx.db.one('SELECT 1 AS x FROM hr_event_cost WHERE event_id = $1', [r.id])) miss.push('phiếu chi phí');
    if (miss.length) bad('Cần hoàn thiện trước khi đóng sự kiện: ' + miss.join(', '));
    return { patch: { status: 'dong' } };
  } } },
  room_book: {
    async beforeSave(r, old, ctx) { chkTime(r); await empFill(r, ctx.db); const w = await overlap(ctx.db, 'hr_room_book', 'room_id', r.id, r, 'Phòng'); if (w) ctx.warn.push(w); },
    async onApprove(r, ok, ctx) { if (ok) { const w = await overlap(ctx.db, 'hr_room_book', 'room_id', r.id, r, 'Phòng'); if (w) bad(w); } },
    acts: { async dong(r) { return { patch: { status: 'hoan_thanh', real_end: r.real_end || r.end_at } }; }, async huy() { return { patch: { status: 'huy' } }; } },
  },
  candidate: {
    acts: { async nhan_viec(r, d, ctx) {    // một chạm: hồ sơ NV + HĐ thử việc + kiểm kê hồ sơ
      const db = ctx.db;
      const next = (await db.one("SELECT coalesce(max(substring(code from 3)::int),0)+1 AS n FROM hr_employee WHERE code ~ '^NV[0-9]+$'")).n;
      const start = d.start_on || today();
      const e = await C.create('employee', { code: 'NV' + String(next).padStart(3, '0'), full_name: r.full_name, gender: r.gender, dob: r.dob, cccd: r.id_no, phone: r.phone, email: r.email, address: r.address, school: [r.school, r.major].filter(Boolean).join(' / ') || null, exp: r.exp, legal_id: r.legal_id, dept_id: r.dept_id, title: r.position, join_on: start, state: 'thu_viec', note: `Từ ứng viên ${r.code}` }, ctx.user, { db, system: true, demo: r.is_demo });
      const pay = await setting('pay');
      await C.create('contract', { emp_id: e.row.id, legal_id: r.legal_id, kind: 'HD01', no: `${e.row.code}/HĐTV`, from_on: start, to_on: addDays(start, 60), title: r.position, state: 'hieu_luc', trial_pct: pay.trial_pct }, ctx.user, { db, system: true, demo: r.is_demo });
      if (r.plan_id) {
        const p = await db.one('SELECT qty FROM hr_rec_plan WHERE id = $1', [r.plan_id]), got = (await db.one("SELECT count(*) AS n FROM hr_candidate WHERE plan_id = $1 AND status = 'S60'", [r.plan_id])).n + 1;
        if (got >= p.qty) await db.q("UPDATE hr_rec_plan SET rec_state = 'da_tuyen' WHERE id = $1", [r.plan_id]);
      }
      return { patch: { status: 'S60', start_on: start }, open: ['employee', e.row.id] };
    } },
  },
  interview: {
    async beforeSave(r, o, ctx) { for (const l of r.lines || []) if (l.code && !l.start && r.start_at) { const t = new Date(new Date(r.start_at).getTime() + 7 * 3600e3).toISOString().slice(11, 16); l.start = t; } },
    async afterApprove(r, ok, ctx) { if (ok) for (const l of r.lines || []) await ctx.db.q("UPDATE hr_candidate SET status = 'S33' WHERE code = $1 AND status IN ('S12')", [l.code]); },
    async afterSave(r, old, ctx) {   // ghi kết quả → cập nhật trạng thái ứng viên
      for (const l of r.lines || []) if (l.result) await ctx.db.q('UPDATE hr_candidate SET status = $1 WHERE code = $2 AND status IN ($3,$4,$5)', [l.result === 'Đạt' ? 'S35' : 'S34', l.code, 'S12', 'S33', 'S34']);
    },
  },
  leave: {
    async beforeSave(r, o, ctx) {
      if (r.to_on < r.from_on) bad('Đến ngày phải sau hoặc bằng Từ ngày');
      const hol = await holidays(ctx.db); const wd = monthsOf(r.from_on, r.to_on).filter(d => isWorkday(d, hol)).length;
      if (r.days == null) r.days = wd;
      const t = await ctx.db.one('SELECT 1 AS x FROM hr_att_type WHERE code = $1', [r.type_code]); if (!t) bad(`Loại nghỉ ${r.type_code} không có trong danh mục CC06`);
      if (['P', 'P/2', 'P>1'].includes(r.type_code)) {
        const b = await leaveLeft(ctx.db, r.emp_id, r.from_on.slice(0, 4), r.id);
        if (b != null && r.days > b) ctx.warn.push(`Số ngày phép còn lại ${b}, đơn này xin ${r.days} ngày`);
      }
    },
    async afterApprove(r, ok, ctx) { if (ok) await markRange(ctx.db, r.emp_id, r.from_on, r.to_on, r.type_code === 'P>1' ? 'P' : r.type_code, 'CC04', r.is_demo); },
  },
  leave_bal: { async decorate(rows, { db }) { for (const r of rows) { r.used = await leaveUsed(db, r.emp_id, r.year); r.closing = +r.opening + +r.earned + +r.adjust - r.used; } } },
  trip: { beforeSave(r) { if (r.to_on < r.from_on) bad('Đến ngày phải sau hoặc bằng Từ ngày'); }, async afterApprove(r, ok, ctx) { if (ok) await markRange(ctx.db, r.emp_id, r.from_on, r.to_on, 'CT', 'CC08', r.is_demo); } },
  explain: { async afterApprove(r, ok, ctx) {
    if (!ok) return; const t = /(\d{1,2}:\d{2})/.exec(r.right_time || '')?.[1];
    await setMark(ctx.db, r.emp_id, r.day, 'HC', r.kind === 'quen_vao' ? { in_t: t } : r.kind === 'quen_ra' ? { out_t: t } : {}, 'CC03', r.is_demo);
  } },
  att_add: { async afterApprove(r, ok, ctx) { if (ok) await setMark(ctx.db, r.emp_id, r.day, 'HC', r.dir === 'vao' ? { in_t: r.time } : { out_t: r.time }, 'CC10', r.is_demo); } },
  ot: {
    beforeSave(r) { r.hours_reg = hoursBetween(r.from_t, r.to_t); },
    async onApprove(r, ok) { if (ok && r.hours_ok == null) return { patch: { hours_ok: r.hours_reg } }; },   // mặc định giờ duyệt = giờ đăng ký, HCNS sửa theo thực tế
  },
  att_auto: {
    async afterSave(r, old, ctx) {   // ghi đủ công; ngày có dữ liệu máy giữ nguyên
      if (old) return; const db = ctx.db, hol = await holidays(db); let c = 0;
      for (const x of r.emps || []) {
        const e = await empOfCode(db, x.code); if (!e) continue;
        for (const d of monthsOf(r.month + '-01', lastDay(r.month))) {
          if (!isWorkday(d, hol) || (e.join_on && d < e.join_on) || (e.leave_on && d > e.leave_on)) continue;
          if (await db.one('SELECT 1 AS x FROM hr_attendance WHERE emp_id = $1 AND day = $2', [e.id, d])) continue;
          await setMark(db, e.id, d, 'HC', {}, 'CC11', r.is_demo); c++;
        }
      }
      await db.q('UPDATE hr_att_auto SET n_days = $1 WHERE id = $2', [c, r.id]);
    },
  },
  att_period: { acts: {
    async khoa(r, d, ctx) {
      const open = (await ctx.db.one(`SELECT (SELECT count(*) FROM hr_explain x JOIN hr_employee e ON e.id = x.emp_id WHERE e.legal_id = $1 AND to_char(x.day,'YYYY-MM') = $2 AND x.status IN ('nhap','cho_duyet'))
        + (SELECT count(*) FROM hr_leave x JOIN hr_employee e ON e.id = x.emp_id WHERE e.legal_id = $1 AND to_char(x.from_on,'YYYY-MM') = $2 AND x.status = 'cho_duyet') AS n`, [r.legal_id, r.month])).n;
      if (open) bad(`Còn ${open} giải trình / đơn nghỉ chưa xử lý trong kỳ — chưa khóa được`);
      return { patch: { status: 'khoa', locked_at: new Date().toISOString() } };
    },
    async mo() { return { patch: { status: 'mo', locked_at: null } }; },
  } },
  payroll: { noDelete: r => r.status === 'da_chuyen' && 'Bảng lương đã chuyển tiền', async afterSave(r, old, ctx) { if (!old) await calcPayroll(ctx.db, r); },
    onSubmit: async (r, ctx) => { const miss = (r.lines || []).filter(l => !l.p1); if (miss.length) ctx.warn.push(`${miss.length} người chưa có lương P1`); },
    acts: { async tao_lai(r, d, ctx) { await calcPayroll(ctx.db, r); }, async chot() { return { patch: { status: 'da_chuyen' } }; } } },
  ins_sheet: { async afterSave(r, old, ctx) { if (!old && !(r.lines || []).length) await calcIns(ctx.db, r); }, acts: { async tao_lai(r, d, ctx) { await calcIns(ctx.db, r); }, async chot(r) { return { patch: { status: 'da_chuyen', paid: r.paid ?? r.due } }; } } },
  cd_sheet: { async afterSave(r, old, ctx) { if (!old && !(r.lines || []).length) await calcCd(ctx.db, r); }, acts: { async tao_lai(r, d, ctx) { await calcCd(ctx.db, r); }, async chot(r) { return { patch: { status: 'da_chuyen', paid: r.paid ?? r.due } }; } } },
};
C.hooks(H);
for (const [k, v] of Object.entries({ candidate: [{ k: 'nhan_viec', l: 'Tạo hồ sơ NV + HĐ thử việc', ico: 'fa-user-check', from: ['S35', 'S52', 'S53'], roles: ['cv_hcns', 'tp_hcns'], ask: [{ k: 'start_on', l: 'Ngày nhận việc', t: 'date', req: 1, def: 'today' }] }] })) C.E[k].acts = v;

async function leaveUsed(db, empId, year) {
  return (await db.one(`SELECT coalesce(sum(days),0) AS n FROM hr_leave WHERE emp_id = $1 AND status = 'da_duyet' AND type_code IN ('P','P/2','P>1') AND to_char(from_on,'YYYY') = $2`, [empId, String(year)])).n;
}
async function leaveLeft(db, empId, year, exceptId) {
  const b = await db.one('SELECT * FROM hr_leave_bal WHERE emp_id = $1 AND year = $2', [empId, +year]); if (!b) return null;
  return +b.opening + +b.earned + +b.adjust - await leaveUsed(db, empId, year);
}

// ---------- tổng hợp công tháng: nguồn duy nhất cho CC12, TL01, lương ----------
async function monthAtt(db, month, where = '', params = []) {
  const types = Object.fromEntries((await db.q('SELECT code, days, unpaid, grp FROM hr_att_type')).map(t => [t.code, t]));
  const rows = await db.q(`SELECT a.emp_id, a.day, a.mark, a.in_t, a.out_t, a.source FROM hr_attendance a JOIN hr_employee e ON e.id = a.emp_id WHERE to_char(a.day,'YYYY-MM') = $1 ${where} ORDER BY a.day`, [month, ...params]);
  const by = {};
  for (const r of rows) {
    const x = by[r.emp_id] ||= { days: {}, work: 0, paid_leave: 0, unpaid: 0, miss: 0 }, t = types[r.mark];
    x.days[+r.day.slice(8)] = r.mark;
    if (['XI', 'XO', 'XX'].includes(r.mark)) x.miss++;
    else if (t) { const d = +t.days || 0; if (t.unpaid) x.unpaid += d; else if (/nghỉ phép|lễ|việc riêng/i.test(t.grp || '')) x.paid_leave += d; else x.work += d; }
  }
  return by;
}

// ---------- lương: công thức đã khớp ảnh Bảng lương T09/2026 (TL02) ----------
function taxOf(income, brackets) { let tax = 0, low = 0; for (const [top, pct] of brackets) { const hi = top ?? Infinity; if (income <= low) break; tax += (Math.min(income, hi) - low) * pct / 100; low = hi; } return Math.round(tax); }
function payLine(l, cfg, ins, std) {
  const x = { ...l }, r = v => Math.round(v);
  const trialPct = (x.trial_pct ?? cfg.trial_pct) / 100, eq = (+x.d100 || 0) + (+x.d85 || 0) * trialPct;
  const kpi = (x.kpi ?? 100) / 100;
  x.p1_net = r((+x.p1 || 0) * eq / std); x.p2_net = r((+x.p2 || 0) * eq / std * kpi);
  x.meal = x.meal_override ?? r((+x.worked || 0) * cfg.meal_day);
  x.gross_base = x.p1_net + x.p2_net;
  x.total = x.gross_base + x.meal + (+x.ot_pay || 0) + (+x.trip_pay || 0) + (+x.bonus || 0);
  const base = +x.ins_base || 0;
  x.e_bhxh = r(base * ins.nld_bhxh / 100); x.e_bhyt = r(base * ins.nld_bhyt / 100); x.e_bhtn = r(base * ins.nld_bhtn / 100); x.e_ins = x.e_bhxh + x.e_bhyt + x.e_bhtn;
  x.deduct = cfg.ded_self + (+x.n_dep || 0) * cfg.ded_dep;
  x.taxable = x.gross_base + (+x.ot_taxable || 0) + (+x.bonus || 0);
  x.tax_base = Math.max(x.taxable - x.e_ins - x.deduct, 0);
  x.tax = taxOf(x.tax_base, cfg.tax);
  x.other_ded = +x.other_ded || 0;
  x.all_ded = x.e_ins + x.tax + x.other_ded;
  x.net = x.total - x.all_ded;
  x.c_bhxh = r(base * ins.dn_bhxh / 100); x.c_bhyt = r(base * ins.dn_bhyt / 100); x.c_bhtn = r(base * ins.dn_bhtn / 100);
  x.c_kpcd = x.union ? r(base * x.kpcd_pct / 100) : 0;
  return x;
}
async function calcPayroll(db, r) {
  const cfg = await setting('pay'), ins = await setting('ins'), cd = await setting('cd'), std = +r.std_days || cfg.std_days, m = r.month;
  const old = Object.fromEntries((r.lines || []).map(l => [l.emp_id, l]));
  const emps = await db.q(`SELECT e.*, (SELECT c.kind FROM hr_contract c WHERE c.emp_id = e.id AND c.state = 'hieu_luc' AND c.kind <> 'HD04' ORDER BY c.from_on DESC LIMIT 1) AS ckind,
    (SELECT c.trial_pct FROM hr_contract c WHERE c.emp_id = e.id AND c.kind = 'HD01' ORDER BY c.from_on DESC LIMIT 1) AS tp
    FROM hr_employee e WHERE e.legal_id = $1 AND e.join_on <= $2 AND (e.leave_on IS NULL OR e.leave_on >= $3) ORDER BY e.full_name`, [r.legal_id, lastDay(m), m + '-01']);
  const att = await monthAtt(db, m, 'AND e.legal_id = $2', [r.legal_id]);
  const ots = Object.fromEntries((await db.q(`SELECT emp_id, sum(hours_ok) FILTER (WHERE day_kind='thuong') h1, sum(hours_ok) FILTER (WHERE day_kind='nghi') h2, sum(hours_ok) FILTER (WHERE day_kind='le') h3 FROM hr_ot WHERE status='da_duyet' AND to_char(day,'YYYY-MM')=$1 GROUP BY 1`, [m])).map(o => [o.emp_id, o]));
  const lines = emps.map(e => {
    const a = att[e.id] || { work: 0, paid_leave: 0 }, o = ots[e.id] || {}, prev = old[e.id] || {};
    const trial = e.ckind === 'HD01', paidDays = a.work + a.paid_leave;
    const p1 = +e.pay_p1 || 0, hourly = (p1 + (+e.pay_p2 || 0)) / std / 8;
    const ot_pay = Math.round(((+o.h1 || 0) * 1.5 + (+o.h2 || 0) * 2 + (+o.h3 || 0) * 3) * hourly);
    return payLine({ emp_id: e.id, code: e.code, name: e.full_name, dept_id: e.dept_id, bank: e.bank, acct: e.bank_acct, worked: a.work, d100: trial ? 0 : paidDays, d85: trial ? paidDays : 0, trial_pct: +(e.tp ?? cfg.trial_pct) * (+(e.tp ?? cfg.trial_pct) <= 1 ? 100 : 1), p1, p2: +e.pay_p2 || 0, kpi: prev.kpi ?? 100,
      ot_pay, ot_h: (+o.h1 || 0) + (+o.h2 || 0) + (+o.h3 || 0), ot_taxable: ot_pay, trip_pay: prev.trip_pay || 0, bonus: prev.bonus || 0, other_ded: prev.other_ded || 0, ins_base: trial ? 0 : (+e.ins_salary || 0), n_dep: (e.dependents || []).filter(d => !d.to_m || d.to_m >= m).length, union: !!e.union_member, kpcd_pct: cd.kpcd, no_att: !att[e.id], no_pay: !p1 }, cfg, ins, std);
  });
  const net = lines.reduce((s, l) => s + l.net, 0);
  await db.q('UPDATE hr_payroll SET lines = $1, n_emp = $2, net_total = $3, std_days = $4 WHERE id = $5', [JSON.stringify(lines), lines.length, net, std, r.id]);
}
const editPayLine = async (db, r, empId, patch) => {
  if (['cho_duyet', 'da_duyet', 'da_chuyen'].includes(r.status)) bad('Bảng lương đã khóa — không sửa được');
  const cfg = await setting('pay'), ins = await setting('ins');
  const lines = r.lines.map(l => l.emp_id !== empId ? l : payLine({ ...l, ...Object.fromEntries(['kpi', 'bonus', 'trip_pay', 'other_ded'].filter(k => k in patch).map(k => [k, +patch[k] || 0])) }, cfg, ins, +r.std_days));
  await db.q('UPDATE hr_payroll SET lines = $1, net_total = $2 WHERE id = $3', [JSON.stringify(lines), lines.reduce((s, l) => s + l.net, 0), r.id]);
};

// ---------- bảo hiểm & công đoàn: tăng/giảm tự so với tháng trước ----------
function insTotals(lines, rt) {
  const sum = lines.reduce((s, l) => s + (+l.salary || 0), 0), pct = rt.dn_bhxh + rt.dn_bhyt + rt.dn_bhtn + rt.nld_bhxh + rt.nld_bhyt + rt.nld_bhtn;
  return { n: lines.length, base: sum, dn: sum * (rt.dn_bhxh + rt.dn_bhyt + rt.dn_bhtn) / 100, nld: sum * (rt.nld_bhxh + rt.nld_bhyt + rt.nld_bhtn) / 100, due: Math.round(sum * pct / 100) };
}
const staffFor = async (db, legalId, month, cond = '') => db.q(`SELECT e.* FROM hr_employee e WHERE e.legal_id = $1 AND e.join_on <= $2 AND (e.leave_on IS NULL OR e.leave_on >= $3) ${cond} ORDER BY e.full_name`, [legalId, lastDay(month), month + '-01']);
function diffLines(cur, prev, key = 'emp_id') {
  if (!prev) return cur;
  const p = Object.fromEntries(prev.lines.map(l => [l[key], l])), c = new Set(cur.map(l => l[key]));
  for (const l of cur) { const o = p[l[key]]; l.change = !o ? 'Tăng mới' : +o.salary !== +l.salary ? `Điều chỉnh (${(+o.salary).toLocaleString('vi-VN')} → ${(+l.salary).toLocaleString('vi-VN')})` : ''; }
  return [...cur, ...prev.lines.filter(l => !c.has(l[key]) && +l.salary > 0).map(l => ({ ...l, salary: 0, change: 'Báo giảm' }))];
}
async function calcIns(db, r) {
  const rt = (await db.one('SELECT rates FROM hr_ins_sheet WHERE id = $1', [r.id])).rates || await setting('ins');
  const emps = await staffFor(db, r.legal_id, r.month, "AND e.state NOT IN ('da_nghi')");
  const prev = await db.one('SELECT lines FROM hr_ins_sheet WHERE legal_id = $1 AND month = $2', [r.legal_id, prevMonth(r.month)]);
  const trialIds = new Set((await db.q("SELECT emp_id FROM hr_contract WHERE kind = 'HD01' AND state = 'hieu_luc'")).map(x => x.emp_id));
  const lines = diffLines(emps.filter(e => !trialIds.has(e.id)).map(e => ({ emp_id: e.id, code: e.code, name: e.full_name, ins_no: e.ins_no, title: e.title, salary: +e.ins_salary || 0, need_data: !e.ins_salary, note: ['thai_san', 'nghi_kl'].includes(e.state) ? 'Tạm dừng (thai sản / nghỉ không lương)' : '' })), prev);
  for (const l of lines) if (/Tạm dừng/.test(l.note || '')) l.salary = 0;
  const t = insTotals(lines.filter(l => l.change !== 'Báo giảm'), rt);
  await db.q('UPDATE hr_ins_sheet SET lines = $1, rates = $2, n_emp = $3, base_total = $4, due = $5 WHERE id = $6', [JSON.stringify(lines), JSON.stringify(rt), t.n, t.base, t.due, r.id]);
}
function cdTotals(lines, rt) {
  const on = lines.filter(l => l.change !== 'Báo giảm'), base = on.reduce((s, l) => s + (+l.salary || 0), 0);
  const memberBase = on.filter(l => l.member !== false).reduce((s, l) => s + (+l.salary || 0), 0), kp = base * rt.kpcd / 100, dp = memberBase * rt.dpcd / 100;
  const due = kp * rt.kpcd_nop / 100 + dp * rt.dpcd_nop / 100, kept = kp * rt.kpcd_giu / 100 + dp * rt.dpcd_giu / 100;
  return { n: on.length, base, kp, dp, due, kept };
}
async function calcCd(db, r) {
  const rt = (await db.one('SELECT rates FROM hr_cd_sheet WHERE id = $1', [r.id])).rates || await setting('cd');
  const emps = await staffFor(db, r.legal_id, r.month, "AND e.state NOT IN ('da_nghi')");
  const prev = await db.one('SELECT lines FROM hr_cd_sheet WHERE legal_id = $1 AND month = $2', [r.legal_id, prevMonth(r.month)]);
  const trialIds = new Set((await db.q("SELECT emp_id FROM hr_contract WHERE kind = 'HD01' AND state = 'hieu_luc'")).map(x => x.emp_id));
  const lines = diffLines(emps.filter(e => !trialIds.has(e.id)).map(e => ({ emp_id: e.id, code: e.code, name: e.full_name, salary: +e.ins_salary || 0, member: !!e.union_member, need_data: !e.ins_salary })), prev);
  const t = cdTotals(lines, rt);
  await db.q('UPDATE hr_cd_sheet SET lines = $1, rates = $2, n_emp = $3, base_total = $4, due = $5, kept = $6 WHERE id = $7', [JSON.stringify(lines), JSON.stringify(rt), t.n, t.base, Math.round(t.due), Math.round(t.kept), r.id]);
}

module.exports = { H, n, lastDay, nextMonth, prevMonth, monthAtt, vppStock, setMark, calcPayroll, calcIns, calcCd, editPayLine, insTotals, cdTotals, payLine, taxOf, leaveUsed, isWorkday, holidays, hoursBetween };

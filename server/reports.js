// 23 biểu mẫu đầu ra (cột H) + Mẫu 01/PLI, cảnh báo và 6 dashboard. Mọi số đều tính từ phiếu gốc, bộ lọc pháp nhân áp theo quyền người xem.
const { q, one } = require('./db');
const C = require('./core');
const B = require('./biz');
const M = require('./meta');
const { today, addDays, dayDiff, dmy } = C;
const n = B.n;
const lbl = (o, v) => (o.find(x => x[0] === v) || [])[1] || v || '';
const curMonth = () => today().slice(0, 7);
const legals = u => u.legal_ids?.length ? u.legal_ids : null;
const canPay = u => M.PAY_ROLES.includes(u.role);
function lg(u, p, col = 'legal_id', params = []) {   // lọc pháp nhân: ∩ phạm vi được phân công và bộ lọc màn hình
  const a = legals(u), w = [];
  if (a) { params.push(a); w.push(`${col} = ANY($${params.length})`); }
  if (p.legal) { params.push(+p.legal); w.push(`${col} = $${params.length}`); }
  return w.length ? ' AND ' + w.join(' AND ') : '';
}
const mq = (sql, params) => q(sql, params);
const days = (m) => `${m}-01`;
const SPEC = {
  VPP06: ['Sổ kho văn phòng phẩm', 'Tồn cuối = Tồn đầu + tổng nhập − tổng xuất; tính riêng từng pháp nhân, mã VPP.', 'Cảnh báo dưới định mức VPP04.', 'VPP01–VPP05', 'NLĐ đề xuất → CV Hành chính duyệt và cấp phát → TP HCNS kiểm tra'],
  TS02: ['Sổ quản lý tài sản', 'Trạng thái lấy theo giao dịch hợp lệ gần nhất.', 'Cảnh báo thiếu người quản lý, đang sửa chữa quá hạn.', 'TS01; TS03; TS04; TS05', 'CV HCNS cập nhật → TP HCNS kiểm tra'],
  XC02: ['Báo cáo sử dụng xe', 'Km thực chạy = km trả − km nhận.', 'Đánh dấu chi phí chưa chứng từ.', 'XC01; XC04; XC05', 'Hành chính lập → TP HCNS duyệt báo cáo tháng'],
  XC03: ['Nhắc hạn xe: bảo dưỡng – đăng kiểm – bảo hiểm', 'Ngày còn lại = ngày đến hạn − hôm nay.', 'Ngưỡng 30/7/0 ngày (cấu hình được).', 'XC01', 'Hành chính cập nhật hạn → TP HCNS theo dõi'],
  GT02: ['Sổ quản lý chuyển phát nhanh', 'Đếm theo trạng thái; tổng cước.', 'Cảnh báo thất lạc / giao trễ.', 'GT01', 'Hành chính cập nhật → TP HCNS đối soát'],
  SA04: ['Báo cáo tổng hợp suất ăn tháng', 'Chênh lệch = thực tế − đăng ký; thành tiền = suất tính phí × đơn giá.', 'Phân biệt đăng ký – thực ăn – suất tính phí.', 'SA01; đối soát bếp', 'NV bếp → CV HCNS đối soát → TP HCNS xác nhận'],
  SA05: ['Báo cáo thu chi bếp', 'Số dư cuối = đầu + thu − chi.', 'Đối soát SA04; cảnh báo thiếu chứng từ.', 'SA02; SA03; SA04', 'Quản lý bếp → CV HCNS → TP HCNS'],
  SK03: ['Báo cáo sự kiện', 'Tỷ lệ tham gia = tham gia / mời; chênh lệch = thực chi − dự toán.', 'Hoàn thiện nghiệm thu trước khi đóng.', 'SK01; Sk02', 'Đầu mối → HCNS tổng hợp → TP HCNS nghiệm thu'],
  PH02: ['Tình hình sử dụng phòng họp', 'Giờ sử dụng = kết thúc thực tế − bắt đầu.', 'Cảnh báo lịch chưa đóng.', 'PH01', 'CV HCNS / lễ tân lập → TP HCNS theo dõi'],
  XC06: ['Lịch trình sử dụng xe', 'Kiểm tra xung đột theo xe + khoảng thời gian; chỉ lịch đã duyệt mới giữ xe.', 'Màu theo trạng thái.', 'XC04; XC05; XC01', 'Người đăng ký → HCNS điều phối và duyệt'],
  TD04: ['Báo cáo tuyển dụng', 'Tỷ lệ hoàn thành = nhận việc / nhu cầu được duyệt.', 'Theo dõi quá hạn; không cộng trùng.', 'TD-01; TD02; TD03', 'CV tuyển dụng → TP HCNS → BGĐ'],
  HS02: ['Sổ quản lý lao động', 'Cuối kỳ = đầu kỳ + tăng − giảm; riêng từng pháp nhân.', 'Chỉ người được phân quyền xem.', 'HS01; HD01–HD11', 'CV HCNS cập nhật → TP HCNS kiểm tra'],
  HD12: ['Tình trạng hợp đồng lao động', 'HĐ không xác định thời hạn không có ngày hết hạn, không vào cảnh báo.', 'Ngưỡng 30/15/7 ngày; phân biệt thử việc.', 'HD01–HD04; HS01', 'CV HCNS lập → TP HCNS xử lý → BGĐ xem'],
  HD13: ['Lịch sử làm việc của NLĐ', 'Nhiều chặng ở các pháp nhân; không gộp quan hệ lao động.', 'Lưu theo hiệu lực từng quyết định.', 'HS01; HD01–HD11', 'CV HCNS → TP HCNS'],
  CC12: ['Bảng chấm công', 'Công thực tế theo ký hiệu CC06; ưu tiên đơn đã duyệt.', 'Chỉ chốt kỳ khi đã xử lý giải trình.', 'CC01–CC11', 'NLĐ giải trình → Trưởng BP → HCNS đối soát → TP chốt'],
  CC13: ['Bảng tăng ca', 'Giờ tính trong khung được duyệt.', 'Không tự duyệt từ máy chấm công; tách loại ngày.', 'CC09; CC10; CC12', 'NLĐ đề xuất → quản lý duyệt → HCNS tổng hợp'],
  TL05: ['Hồ sơ lương tháng', 'Thực nhận = tổng thu nhập − các khoản khấu trừ.', 'Khóa sau duyệt; BGĐ chỉ xem tổng.', 'TL01–TL04; CC12; CC13', 'CV lương → TP HCNS → BGĐ'],
  'BH-01': ['Bảng trích nộp bảo hiểm hàng tháng', 'Khoản trích = căn cứ × tỷ lệ cấu hình theo thời điểm.', 'Đối chiếu phải nộp / đã nộp.', 'HĐLĐ; bảng công; cấu hình', 'CV BH → TP HCNS → duyệt'],
  'BH-02': ['Tổng hợp trích nộp bảo hiểm theo năm', 'Công nợ = đầu kỳ + phải nộp − đã nộp.', 'Không cộng gộp số người giữa các tháng.', 'BH-01 12 kỳ', 'CV BH → TP HCNS → kế toán'],
  'CĐ-01': ['Bảng trích nộp công đoàn hàng tháng', 'Tách KPCĐ và ĐPCĐ; tỷ lệ cấu hình.', 'Quản lý riêng công ty đã/chưa có CĐCS.', 'HĐLĐ; hồ sơ CĐ', 'CV HCNS → TP HCNS → duyệt'],
  'CĐ-02': ['Tổng hợp trích nộp công đoàn theo năm', 'Số dư = đầu + được để lại − đã chi.', 'Tỷ lệ phân phối không ấn định mặc định.', 'CĐ-01', 'HCNS → TP HCNS → kế toán'],
  CCTC05: ['Định biên nhân sự', 'Thiếu/thừa = định biên − hiện có; còn thiếu trừ người đã chốt nhận việc.', 'Đối chiếu TD-01.', 'CCTC01–03, 06; kế hoạch định biên', 'Trưởng BP → HCNS → TP → BGĐ'],
  PLI: ['Báo cáo tình hình sử dụng lao động (Mẫu 01/PLI)', 'Lấy từ hồ sơ, HĐLĐ, lương đóng BH theo từng pháp nhân.', 'Gửi Sở Nội vụ, BHXH.', 'HS01; HD01–04', 'CV HCNS lập → TP HCNS ký'],
};
const R = {};

R.VPP06 = async (p, u) => {
  const m = p.month || curMonth(), first = days(m), last = B.lastDay(m), pr = [], w = lg(u, p, 'legal_id', pr);
  const ids = (await mq(`SELECT id, short FROM hr_legal WHERE true ${w}`, pr));
  const items = Object.fromEntries((await q('SELECT code, name, unit FROM hr_vpp_item')).map(i => [i.code, i]));
  const rows = [];
  for (const l of ids) {
    const open = await B.vppStock({ q }, l.id, addDays(first, -1)), close = await B.vppStock({ q }, l.id, last);
    const inq = {}, out = {};
    for (const r of await q('SELECT lines FROM hr_vpp_in WHERE legal_id=$1 AND in_on BETWEEN $2 AND $3', [l.id, first, last])) for (const x of r.lines || []) inq[x.code] = (inq[x.code] || 0) + n(x.qty);
    for (const r of await q('SELECT lines FROM hr_vpp_issue WHERE legal_id=$1 AND issue_on BETWEEN $2 AND $3', [l.id, first, last])) for (const x of r.lines || []) out[x.code] = (out[x.code] || 0) + n(x.qty_out);
    const norms = Object.fromEntries((await q('SELECT item_code, min_qty FROM hr_vpp_norm WHERE legal_id=$1', [l.id])).map(x => [x.item_code, +x.min_qty]));
    for (const c of new Set([...Object.keys(open), ...Object.keys(inq), ...Object.keys(out), ...Object.keys(norms)])) {
      const c1 = close[c] || 0, mn = norms[c];
      rows.push({ legal: l.short, code: c, name: items[c]?.name, unit: items[c]?.unit, open: open[c] || 0, inq: inq[c] || 0, outq: out[c] || 0, close: c1, min: mn ?? '', need: mn != null && c1 < mn ? mn - c1 : '', warn: mn != null && c1 < mn ? 'Dưới định mức' : '' });
    }
  }
  rows.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  return { kpis: [['Mặt hàng có phát sinh', rows.length], ['Tổng nhập', rows.reduce((s, r) => s + r.inq, 0)], ['Tổng xuất', rows.reduce((s, r) => s + r.outq, 0)], ['Dưới định mức', rows.filter(r => r.warn).length]],
    cols: [['legal', 'Pháp nhân'], ['code', 'Mã VPP'], ['name', 'Tên hàng'], ['unit', 'ĐVT'], ['open', 'Tồn đầu kỳ', 'n'], ['inq', 'Nhập trong kỳ', 'n'], ['outq', 'Xuất trong kỳ', 'n'], ['close', 'Tồn cuối kỳ', 'n'], ['min', 'Định mức', 'n'], ['need', 'Cần mua bổ sung', 'n'], ['warn', 'Cảnh báo', 'w']], rows };
};
R.TS02 = async (p, u) => {
  const pr = [], w = lg(u, p, 'a.legal_id', pr);
  const rows = (await mq(`SELECT a.id, a.code, a.name, a.model, l.short legal, d.name dept, e.full_name holder, a.in_on, a.status, a.location, a.repair_due FROM hr_asset a LEFT JOIN hr_legal l ON l.id=a.legal_id LEFT JOIN hr_dept d ON d.id=a.dept_id LEFT JOIN hr_employee e ON e.id=a.holder_id WHERE true ${w} ORDER BY a.code`, pr))
    .map(r => ({ ...r, status_l: lbl(M.ASSET_ST, r.status), warn: !r.holder && r.status === 'dang_dung' ? 'Thiếu người quản lý' : r.status === 'sua_chua' && r.repair_due && r.repair_due < today() ? 'Sửa chữa quá hạn' : '', _e: ['asset', r.id] }));
  const c = s => rows.filter(r => r.status === s).length;
  return { kpis: [['Tổng tài sản', rows.length], ['Đang sử dụng', c('dang_dung')], ['Đang sửa chữa', c('sua_chua')], ['Chờ thanh lý', c('cho_thanh_ly')]],
    cols: [['code', 'Mã tài sản'], ['name', 'Tên tài sản'], ['model', 'Model / số seri'], ['legal', 'Pháp nhân sở hữu'], ['dept', 'Bộ phận sử dụng'], ['holder', 'Người giữ'], ['in_on', 'Ngày ghi nhận', 'd'], ['status_l', 'Trạng thái'], ['location', 'Vị trí'], ['warn', 'Cảnh báo', 'w']], rows };
};
R.XC02 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 'b.legal_id', pr);
  const rows = (await mq(`SELECT b.id, b.start_at, b.end_at, v.plate, e.full_name who, d.name dept, b.route, r.km_in, r.km_out, r.cost, r.cost_doc, b.status FROM hr_car_book b JOIN hr_vehicle v ON v.id=b.vehicle_id JOIN hr_employee e ON e.id=b.emp_id LEFT JOIN hr_dept d ON d.id=e.dept_id LEFT JOIN hr_car_return r ON r.book_id=b.id
    WHERE to_char(b.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')=$1 AND b.status NOT IN ('nhap','tu_choi','huy') ${w} ORDER BY b.start_at`, pr))
    .map(r => ({ ...r, km: r.km_out != null ? r.km_out - r.km_in : null, warn: r.status === 'dang_di' && r.end_at < new Date().toISOString() ? 'Chưa trả xe' : r.cost > 0 && !r.cost_doc ? 'Chi phí chưa chứng từ' : '', _e: ['car_book', r.id] }));
  return { kpis: [['Số lượt sử dụng', rows.length], ['Tổng km vận hành', rows.reduce((s, r) => s + (r.km || 0), 0)], ['Chi phí phát sinh', rows.reduce((s, r) => s + (+r.cost || 0), 0), 'đ'], ['Số lượt trả muộn', rows.filter(r => r.warn === 'Chưa trả xe').length]],
    cols: [['start_at', 'Giờ đi', 'dt'], ['end_at', 'Giờ về', 'dt'], ['plate', 'Biển số'], ['who', 'Người sử dụng'], ['dept', 'Phòng ban'], ['route', 'Nơi đi – đến'], ['km_in', 'Km đầu', 'n'], ['km_out', 'Km cuối', 'n'], ['km', 'Km thực chạy', 'n'], ['cost', 'Chi phí', 'm'], ['warn', 'Cảnh báo', 'w']], rows };
};
const vehicleDue = async (u, p = {}) => {
  const pr = [], w = lg(u, p, 'legal_id', pr), t = today(), out = [];
  for (const v of await mq(`SELECT v.*, e.full_name owner FROM hr_vehicle v LEFT JOIN hr_employee e ON e.id=v.owner_id WHERE true ${w}`, pr))
    for (const [k, l] of [['service_to', 'Bảo dưỡng'], ['inspect_to', 'Đăng kiểm'], ['insure_to', 'Bảo hiểm']]) out.push({ id: v.id, plate: `${v.code} · ${v.plate}`, kind: l, due: v[k], left: v[k] ? dayDiff(t, v[k]) : null, owner: v.owner || '' });
  return out;
};
R.XC03 = async (p, u) => {
  const rows = (await vehicleDue(u, p)).map(r => ({ ...r, st: r.left == null ? 'Cần cập nhật dữ liệu' : r.left < 0 ? 'Quá hạn' : r.left <= 30 ? 'Sắp đến hạn' : 'Bình thường', _e: ['vehicle', r.id] })).sort((a, b) => (a.left ?? 1e9) - (b.left ?? 1e9));
  return { kpis: [['Quá hạn', rows.filter(r => r.left < 0 && r.left != null).length], ['Đến hạn ≤ 7 ngày', rows.filter(r => r.left >= 0 && r.left <= 7).length], ['Đến hạn 8–30 ngày', rows.filter(r => r.left > 7 && r.left <= 30).length], ['Thiếu ngày hạn', rows.filter(r => r.left == null).length]],
    cols: [['plate', 'Mã xe / biển số'], ['kind', 'Loại công việc'], ['due', 'Ngày đến hạn', 'd'], ['left', 'Còn (ngày)', 'n'], ['owner', 'Người phụ trách'], ['st', 'Tình trạng', 'w']], rows };
};
R.GT02 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr);
  const rows = (await mq(`SELECT t.*, e.full_name who, d.name dept FROM hr_mail t LEFT JOIN hr_employee e ON e.id=t.emp_id LEFT JOIN hr_dept d ON d.id=t.dept_id WHERE to_char(t.send_on,'YYYY-MM')=$1 ${w} ORDER BY t.send_on`, pr)).map(r => ({ ...r, st: lbl(M.MAIL, r.status), _e: ['mail', r.id] }));
  return { kpis: [['Số kiện đã gửi', rows.length], ['Đang vận chuyển', rows.filter(r => r.status === 'dang_chuyen').length], ['Đã giao', rows.filter(r => r.status === 'da_giao').length], ['Tổng cước phí', rows.reduce((s, r) => s + (+r.fee || 0), 0), 'đ']],
    cols: [['send_on', 'Ngày gửi', 'd'], ['code', 'Mã yêu cầu'], ['who', 'Người gửi'], ['dept', 'Phòng'], ['to_name', 'Người nhận'], ['bill_no', 'Mã vận đơn'], ['st', 'Trạng thái'], ['done_on', 'Ngày giao', 'd'], ['fee', 'Cước phí', 'm']], rows };
};
R.SA04 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 'legal_id', pr), regs = {};
  for (const r of await mq(`SELECT days FROM hr_meal_reg WHERE month=$1 ${w}`, pr)) for (const d of r.days || []) regs[d] = (regs[d] || 0) + 1;
  const rows = (await mq(`SELECT id, day, actual, charged, price, note FROM hr_meal_day WHERE to_char(day,'YYYY-MM')=$1 ${w} ORDER BY day`, pr)).map(r => { const reg = regs[+r.day.slice(8)] || 0, ch = r.charged ?? r.actual; return { ...r, reg, diff: r.actual - reg, amount: ch * r.price, _e: ['meal_day', r.id] }; });
  const sum = k => rows.reduce((s, r) => s + (+r[k] || 0), 0);
  return { kpis: [['Suất đăng ký', sum('reg')], ['Suất thực phục vụ', sum('actual')], ['Chênh lệch suất', sum('diff')], ['Chi phí bình quân / suất', sum('actual') ? Math.round(sum('amount') / sum('actual')) : 0, 'đ']],
    cols: [['day', 'Ngày', 'd'], ['reg', 'Đăng ký', 'n'], ['actual', 'Thực tế', 'n'], ['diff', 'Chênh lệch', 'n'], ['price', 'Đơn giá', 'm'], ['amount', 'Thành tiền', 'm'], ['note', 'Ghi chú']], rows, total: ['reg', 'actual', 'diff', 'amount'] };
};
R.SA05 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 'legal_id', pr), first = days(m), pr0 = [first], w0 = lg(u, p, 'legal_id', pr0);
  const inA = (await mq(`SELECT coalesce(sum(amount),0) n FROM hr_meal_in WHERE month < to_char($1::date,'YYYY-MM') ${w0}`, pr0).catch(() => [{ n: 0 }]))[0].n, outA = (await mq(`SELECT coalesce(sum(amount),0) n FROM hr_meal_out WHERE pay_on < $1 ${w0}`, pr0))[0].n;
  const ins_ = (await mq(`SELECT id, got_on d, 'Thu' typ, 'Thu tiền ăn: '||name content, amount FROM hr_meal_in WHERE month=$1 ${w}`, pr)), outs = await mq(`SELECT id, pay_on d, 'Chi' typ, content, amount, doc FROM hr_meal_out WHERE to_char(pay_on,'YYYY-MM')=$1 ${w}`, pr);
  let bal = inA - outA; const open = bal;
  const rows = [...ins_, ...outs].sort((a, b) => a.d.localeCompare(b.d)).map(r => { const i = r.typ === 'Thu' ? +r.amount : 0, o = r.typ === 'Chi' ? +r.amount : 0; bal += i - o; return { d: r.d, typ: r.typ, content: r.content, inn: i || '', out: o || '', bal, warn: r.typ === 'Chi' && !r.doc ? 'Thiếu chứng từ' : '', _e: [r.typ === 'Thu' ? 'meal_in' : 'meal_out', r.id] }; });
  const ti = ins_.reduce((s, r) => s + +r.amount, 0), to = outs.reduce((s, r) => s + +r.amount, 0);
  return { kpis: [['Tổng thu', ti, 'đ'], ['Tổng chi', to, 'đ'], ['Chênh lệch thu – chi', ti - to, 'đ'], ['Dư cuối kỳ', open + ti - to, 'đ']], cols: [['d', 'Ngày', 'd'], ['typ', 'Loại thu/chi'], ['content', 'Nội dung'], ['inn', 'Thu (đ)', 'm'], ['out', 'Chi (đ)', 'm'], ['bal', 'Số dư', 'm'], ['warn', 'Cảnh báo', 'w']], rows };
};
R.SK03 = async (p, u) => {
  const y = String(p.year || today().slice(0, 4)), pr = [y], w = lg(u, p, 't.legal_id', pr);
  const rows = (await mq(`SELECT t.*, e.full_name host, (SELECT sum(actual_total) FROM hr_event_cost c WHERE c.event_id=t.id) actual FROM hr_event t LEFT JOIN hr_employee e ON e.id=t.host_id WHERE to_char(t.at,'YYYY')=$1 ${w} ORDER BY t.at`, pr)).map(r => ({ ...r, ratio: r.invited ? `${r.attended ?? 0} / ${r.invited}` : '', goal: r.goal_ok ? 'Đạt' : '', diff: (r.actual || 0) - (r.budget || 0), _e: ['event', r.id] }));
  const inv = rows.reduce((s, r) => s + (r.invited || 0), 0), att = rows.reduce((s, r) => s + (r.attended || 0), 0);
  return { kpis: [['Số hoạt động hoàn thành', rows.filter(r => r.status === 'dong').length], ['Tỷ lệ tham gia', inv ? Math.round(att / inv * 100) : 0, '%'], ['Dự toán', rows.reduce((s, r) => s + (+r.budget || 0), 0), 'đ'], ['Thực chi', rows.reduce((s, r) => s + (+r.actual || 0), 0), 'đ']],
    cols: [['code', 'Mã sự kiện'], ['name', 'Tên sự kiện'], ['at', 'Ngày tổ chức', 'dt'], ['host', 'Chủ trì'], ['ratio', 'Tham dự / mời'], ['goal', 'Đạt mục tiêu'], ['budget', 'Dự toán', 'm'], ['actual', 'Thực chi', 'm'], ['review', 'Đánh giá']], rows };
};
R.PH02 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr);
  const rows = (await mq(`SELECT t.*, r.name room, e.full_name who FROM hr_room_book t JOIN hr_room r ON r.id=t.room_id JOIN hr_employee e ON e.id=t.emp_id WHERE to_char(t.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')=$1 ${w} ORDER BY t.start_at`, pr)).map(r => { const end = r.real_end || r.end_at, h = Math.round((Date.parse(end) - Date.parse(r.start_at)) / 36e5 * 10) / 10; return { ...r, hours: h, st: lbl(M.E.room_book.fields.find(f => f.k === 'status').o, r.status), warn: r.status === 'da_duyet' && r.end_at < new Date().toISOString() ? 'Lịch chưa đóng' : '', _e: ['room_book', r.id] }; });
  const used = rows.filter(r => r.status === 'hoan_thanh'), hrs = used.reduce((s, r) => s + r.hours, 0);
  const avail = (await q('SELECT count(*) n FROM hr_room')).at(0).n * 8 * 26;
  return { kpis: [['Lượt đăng ký', rows.length], ['Lượt sử dụng', used.length], ['Giờ sử dụng', Math.round(hrs * 10) / 10], ['Tỷ lệ sử dụng khung giờ', avail ? Math.round(hrs / avail * 1000) / 10 : 0, '%']],
    cols: [['start_at', 'Bắt đầu', 'dt'], ['end_at', 'Kết thúc', 'dt'], ['room', 'Phòng họp'], ['who', 'Người đăng ký'], ['host', 'Người chủ trì'], ['hours', 'Thời lượng (giờ)', 'n'], ['st', 'Trạng thái'], ['service', 'Phục vụ hậu cần'], ['warn', 'Cảnh báo', 'w']], rows };
};
R.XC06 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr), o = M.E.car_book.fields.find(f => f.k === 'status').o;
  const rows = (await mq(`SELECT t.*, v.plate, e.full_name who, d.name dept FROM hr_car_book t JOIN hr_vehicle v ON v.id=t.vehicle_id JOIN hr_employee e ON e.id=t.emp_id LEFT JOIN hr_dept d ON d.id=e.dept_id WHERE to_char(t.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')=$1 ${w} ORDER BY t.start_at`, pr)).map(r => ({ ...r, st: lbl(o, r.status), _e: ['car_book', r.id] }));
  const held = rows.filter(r => ['da_duyet', 'dang_di'].includes(r.status));
  const clash = held.filter((a, i) => held.some((b, j) => j !== i && a.vehicle_id === b.vehicle_id && a.start_at < b.end_at && b.start_at < a.end_at)).length;
  return { kpis: [['Xe sẵn sàng', (await q("SELECT count(*) n FROM hr_vehicle WHERE state='san_sang'"))[0].n], ['Xe đã đặt', held.length], ['Lịch trùng', clash], ['Lượt đang sử dụng', rows.filter(r => r.status === 'dang_di').length]],
    cols: [['start_at', 'Từ', 'dt'], ['end_at', 'Đến', 'dt'], ['plate', 'Xe / biển số'], ['who', 'Người đăng ký'], ['dept', 'Phòng ban'], ['route', 'Hành trình'], ['st', 'Trạng thái duyệt'], ['reason', 'Ghi chú']], rows };
};
R.TD04 = async (p, u) => {
  const pr = [], w = lg(u, p, 'p.legal_id', pr);
  const rows = (await mq(`SELECT p.*, l.short legal, d.name dept, (SELECT count(*) FROM hr_candidate c WHERE c.plan_id=p.id) cand, (SELECT count(*) FROM hr_candidate c WHERE c.plan_id=p.id AND c.status IN ('S34','S35','S36','S52','S53','S60')) pv, (SELECT count(*) FROM hr_candidate c WHERE c.plan_id=p.id AND c.status IN ('S35','S36','S52','S53','S60')) pass, (SELECT count(*) FROM hr_candidate c WHERE c.plan_id=p.id AND c.status='S60') got FROM hr_rec_plan p JOIN hr_legal l ON l.id=p.legal_id LEFT JOIN hr_dept d ON d.id=p.dept_id WHERE p.status='da_duyet' ${w} ORDER BY p.due_on`, pr))
    .map(r => ({ ...r, warn: r.due_on < today() && r.got < r.qty ? 'Quá hạn tuyển' : '', _e: ['rec_plan', r.id] }));
  const need = rows.reduce((s, r) => s + r.qty, 0), got = rows.reduce((s, r) => s + r.got, 0);
  return { kpis: [['Nhu cầu tuyển', need], ['Ứng viên nhận', rows.reduce((s, r) => s + r.cand, 0)], ['Nhận việc', got], ['Tỷ lệ hoàn thành tuyển', need ? Math.round(got / need * 100) : 0, '%']],
    cols: [['position', 'Vị trí'], ['legal', 'Pháp nhân'], ['dept', 'Phòng ban'], ['qty', 'Định biên cần', 'n'], ['cand', 'Ứng viên', 'n'], ['pv', 'Phỏng vấn', 'n'], ['pass', 'Trúng tuyển', 'n'], ['got', 'Nhận việc', 'n'], ['due_on', 'Ngày cần', 'd'], ['warn', 'Cảnh báo', 'w']], rows };
};
const staffRows = async (u, p, m) => {
  const last = B.lastDay(m), pr = [last, m + '-01'], w = lg(u, p, 'e.legal_id', pr); let dw = ''; if (p.dept) { pr.push(+p.dept); dw = ` AND e.dept_id=$${pr.length}`; }
  return mq(`SELECT e.*, l.short legal, d.name dept, (SELECT kind FROM hr_contract c WHERE c.emp_id=e.id AND c.kind<>'HD04' ORDER BY c.from_on DESC LIMIT 1) ckind FROM hr_employee e JOIN hr_legal l ON l.id=e.legal_id LEFT JOIN hr_dept d ON d.id=e.dept_id WHERE e.join_on <= $1 AND (e.leave_on IS NULL OR e.leave_on >= $2) ${w}${dw} ORDER BY e.full_name`, pr);
};
const stL = v => lbl(M.E.employee.fields.find(f => f.k === 'state').o, v);
R.HS02 = async (p, u) => {
  const m = p.month || curMonth(), s = await staffRows(u, p, m), f = m + '-01', l = B.lastDay(m);
  const inc = s.filter(e => e.join_on >= f && e.join_on <= l).length, dec = s.filter(e => e.leave_on && e.leave_on >= f && e.leave_on <= l).length, ini = s.length - inc;
  const pay = canPay(u), rows = s.map(e => ({ code: e.code, name: e.full_name, dob: M.PII_ROLES.includes(u.role) ? e.dob : '', gender: e.gender, title: `${e.title} / ${e.dept || 'Chưa gán'}`, legal: e.legal, join: e.join_on, ck: e.ckind || '', sal: pay ? e.ins_salary : '', st: stL(e.state), _e: ['employee', e.id] }));
  return { kpis: [['Lao động đầu kỳ', ini], ['Tăng trong kỳ', inc], ['Giảm trong kỳ', dec], ['Lao động cuối kỳ', ini + inc - dec]], cols: [['code', 'Mã NV'], ['name', 'Họ tên'], ['dob', 'Ngày sinh', 'd'], ['gender', 'Giới tính'], ['title', 'Chức danh / bộ phận'], ['legal', 'Pháp nhân'], ['join', 'Ngày bắt đầu', 'd'], ['ck', 'Loại HĐLĐ'], ['sal', 'Tiền lương HĐ', 'm'], ['st', 'Trạng thái']], rows };
};
R.HD12 = async (p, u) => {
  const pr = [], w = lg(u, p, 'c.legal_id', pr), t = today(), o = M.E.contract.fields.find(f => f.k === 'kind').o;
  const rows = (await mq(`SELECT c.*, e.code ec, e.full_name, l.short legal FROM hr_contract c JOIN hr_employee e ON e.id=c.emp_id JOIN hr_legal l ON l.id=c.legal_id WHERE c.state IN ('hieu_luc','cho_quyet_dinh') AND e.state<>'da_nghi' ${w} ORDER BY c.to_on NULLS LAST`, pr)).map(c => {
    const left = c.to_on ? dayDiff(t, c.to_on) : null, need = ['HD01', 'HD02'].includes(c.kind) && !c.to_on;
    return { ec: c.ec, name: c.full_name, legal: c.legal, kind: lbl(o, c.kind).split(' · ')[1], no: c.no, sign: c.sign_on, from: c.from_on, to: c.to_on, left, st: need ? 'Cần cập nhật dữ liệu' : left == null ? 'Không xác định thời hạn' : left < 0 ? 'Quá hạn' : left <= 30 ? 'Sắp đến hạn' : 'Hiệu lực', _e: ['contract', c.id] };
  });
  return { kpis: [['HĐ đang hiệu lực', rows.length], ['Sắp hết hạn ≤ 30 ngày', rows.filter(r => r.st === 'Sắp đến hạn').length], ['Đã hết hạn', rows.filter(r => r.st === 'Quá hạn').length], ['Chưa cập nhật hồ sơ', rows.filter(r => r.st === 'Cần cập nhật dữ liệu').length]],
    cols: [['ec', 'Mã NV'], ['name', 'Họ tên'], ['legal', 'Pháp nhân ký HĐ'], ['kind', 'Loại HĐ'], ['no', 'Số HĐ'], ['sign', 'Ngày ký', 'd'], ['from', 'Ngày hiệu lực', 'd'], ['to', 'Ngày hết hạn', 'd'], ['left', 'Còn (ngày)', 'n'], ['st', 'Tình trạng', 'w']], rows };
};
R.HD13 = async (p, u) => {
  const pr = [], w = lg(u, p, 'e.legal_id', pr); let f = ''; if (p.emp) { pr.push(+p.emp); f = ` AND e.id=$${pr.length}`; }
  const rows = [];
  const scope = M.E.employee; const sc = []; C.scopeSql(scope, u, (s, ...v) => { let i = 0; sc.push(s.replace(/\$(\d+)/g, () => '$' + (pr.push(v[i++]), pr.length)).replace(/\bt\./g, 'e.')); });
  const es = await mq(`SELECT e.*, l.short legal, d.name dept FROM hr_employee e JOIN hr_legal l ON l.id=e.legal_id LEFT JOIN hr_dept d ON d.id=e.dept_id WHERE true ${w}${f}${sc.length ? ' AND ' + sc.join(' AND ') : ''} ORDER BY e.full_name`, pr);
  for (const e of es) {
    for (const c of await q('SELECT c.*, l.short FROM hr_contract c JOIN hr_legal l ON l.id=c.legal_id WHERE c.emp_id=$1 ORDER BY c.from_on', [e.id])) rows.push({ name: e.full_name, from: c.from_on, to: c.to_on, legal: c.short, dept: e.dept, title: c.title || e.title, kind: { HD01: 'Thử việc', HD02: 'HĐLĐ có thời hạn', HD03: 'HĐLĐ không thời hạn', HD04: 'Phụ lục' }[c.kind], no: c.no, _e: ['contract', c.id] });
    for (const d of await q("SELECT d.*, l.short, x.name dn FROM hr_decision d LEFT JOIN hr_legal l ON l.id=d.legal_id LEFT JOIN hr_dept x ON x.id=d.dept_id WHERE d.emp_id=$1 AND d.status='da_duyet' ORDER BY d.from_on", [e.id])) rows.push({ name: e.full_name, from: d.from_on, to: null, legal: d.short || e.legal, dept: d.dn || e.dept, title: d.title || e.title, kind: { HD05: 'Điều chuyển', HD06: 'Bổ nhiệm', HD07: 'Miễn nhiệm', HD08: 'Điều chỉnh lương', HD10: 'Chấm dứt HĐLĐ', HD11: 'Chấm dứt thử việc' }[d.kind], no: d.no, _e: ['decision', d.id] });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || String(a.from).localeCompare(b.from));
  const e0 = es.length === 1 ? es[0] : null, yrs = e0 ? Math.floor(dayDiff(e0.join_on, today()) / 365.25 * 10) / 10 : '';
  return { kpis: [['Ngày vào làm', e0 ? dmy(e0.join_on) : `${es.length} người`], ['Thâm niên', e0 ? yrs + ' năm' : '—'], ['Pháp nhân hiện tại', e0?.legal || '—'], ['Chức danh hiện tại', e0?.title || '—']], cols: [['name', 'Họ tên'], ['from', 'Từ ngày', 'd'], ['to', 'Đến ngày', 'd'], ['legal', 'Pháp nhân'], ['dept', 'Phòng ban'], ['title', 'Chức danh'], ['kind', 'Loại biến động'], ['no', 'Số HĐ/QĐ']], rows };
};
R.CC12 = async (p, u) => {
  const m = p.month || curMonth(), s = await staffRows(u, p, m), a = await B.monthAtt({ q }, m), hol = await B.holidays({ q }), last = +B.lastDay(m).slice(8); let std = 0; for (let d = 1; d <= last; d++) if (B.isWorkday(`${m}-${String(d).padStart(2, '0')}`, hol)) std++;
  const pend = Object.fromEntries((await q(`SELECT emp_id, count(*) n FROM hr_explain WHERE to_char(day,'YYYY-MM')=$1 AND status IN ('nhap','cho_duyet') GROUP BY 1`, [m])).map(r => [r.emp_id, r.n]));
  const ots = Object.fromEntries((await q(`SELECT emp_id, sum(hours_ok) h FROM hr_ot WHERE to_char(day,'YYYY-MM')=$1 AND status='da_duyet' GROUP BY 1`, [m])).map(r => [r.emp_id, +r.h]));
  const rows = s.map(e => { const x = a[e.id] || { work: 0, paid_leave: 0, unpaid: 0, miss: 0 }; return { code: e.code, name: e.full_name, dept: e.dept, std, work: x.work, leave: x.paid_leave, unpaid: x.unpaid, ot: ots[e.id] || 0, st: !a[e.id] ? 'Chưa có dữ liệu' : pend[e.id] ? `Còn ${pend[e.id]} giải trình` : x.miss ? `Thiếu công ${x.miss} lượt` : 'Đã đối soát', _e: ['employee', e.id] }; });
  const pr = [m], w = lg(u, p, 'legal_id', pr), per = await mq(`SELECT status FROM hr_att_period WHERE month=$1 ${w}`, pr);
  return { kpis: [['Tổng ngày công', rows.reduce((t, r) => t + r.work, 0)], ['Ngày nghỉ phép', rows.reduce((t, r) => t + r.leave, 0)], ['Lượt thiếu công', Object.values(a).reduce((t, r) => t + r.miss, 0)], ['Tình trạng chốt kỳ', `${per.filter(x => x.status === 'khoa').length}/${per.length} khóa`]],
    cols: [['code', 'Mã NV'], ['name', 'Họ tên'], ['dept', 'Phòng ban'], ['std', 'Công chuẩn', 'n'], ['work', 'Công thực tế', 'n'], ['leave', 'Phép hưởng lương', 'n'], ['unpaid', 'Nghỉ không lương', 'n'], ['ot', 'Tăng ca (giờ)', 'n'], ['st', 'Trạng thái đối soát']], rows };
};
R.CC13 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 'e.legal_id', pr), o = { thuong: 'Ngày thường', nghi: 'Ngày nghỉ', le: 'Lễ/tết' };
  const rows = (await mq(`SELECT t.*, e.code ec, e.full_name, d.name dept FROM hr_ot t JOIN hr_employee e ON e.id=t.emp_id LEFT JOIN hr_dept d ON d.id=e.dept_id WHERE to_char(t.day,'YYYY-MM')=$1 AND t.status='da_duyet' ${w} ORDER BY t.day`, pr)).map(r => ({ ...r, dk: o[r.day_kind], _e: ['ot', r.id] }));
  const s = k => rows.filter(r => !k || r.day_kind === k).reduce((t, r) => t + (+r.hours_ok || 0), 0);
  return { kpis: [['Tổng giờ tăng ca', s()], ['Giờ ngày thường', s('thuong')], ['Giờ ngày nghỉ', s('nghi')], ['Giờ lễ/tết', s('le')]], cols: [['day', 'Ngày', 'd'], ['ec', 'Mã NV'], ['full_name', 'Họ tên'], ['dept', 'Bộ phận'], ['dk', 'Loại ngày'], ['hours_reg', 'Giờ đăng ký', 'n'], ['hours_real', 'Giờ thực tế', 'n'], ['hours_ok', 'Giờ được duyệt', 'n'], ['task', 'Công việc']], rows };
};
R.TL05 = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr), o = M.E.payroll.fields.find(f => f.k === 'status').o;
  const runs = await mq(`SELECT t.*, l.short FROM hr_payroll t JOIN hr_legal l ON l.id=t.legal_id WHERE t.month=$1 ${w}`, pr);
  const all = runs.flatMap(r => (r.lines || []).map(l => ({ ...l, legal: r.short })));
  const gross = all.reduce((s, l) => s + l.total, 0), ded = all.reduce((s, l) => s + l.all_ded, 0), net = all.reduce((s, l) => s + l.net, 0);
  const rows = canPay(u) ? all.map(l => ({ code: l.code, name: l.name, legal: l.legal, p: l.p1 + l.p2, days: l.d100 + l.d85, add: l.meal + (l.ot_pay || 0) + (l.bonus || 0), total: l.total, ded: l.all_ded, net: l.net, bank: l.acct ? 'Chuyển khoản' : 'Thiếu TK' })) : [];
  return { kpis: [['Quỹ lương gộp', gross, 'đ'], ['Các khoản giảm trừ', ded, 'đ'], ['Thu nhập thực nhận', net, 'đ'], ['Trạng thái chuyển tiền', runs.map(r => `${r.short}: ${lbl(o, r.status)}`).join(' · ') || 'Chưa lập']],
    cols: [['code', 'Mã NV'], ['name', 'Họ tên'], ['legal', 'Pháp nhân'], ['p', 'Lương hợp đồng', 'm'], ['days', 'Công tính lương', 'n'], ['add', 'Phụ cấp / tăng ca', 'm'], ['total', 'Tổng thu nhập', 'm'], ['ded', 'BH, thuế, khấu trừ', 'm'], ['net', 'Thực nhận', 'm'], ['bank', 'Chuyển khoản']], rows, note: canPay(u) ? '' : 'Vai trò của bạn chỉ xem số tổng; lương cá nhân được ẩn.' };
};
R['BH-01'] = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr), rows = [];
  let base = 0, dn = 0, nld = 0;
  for (const s of await mq(`SELECT t.*, l.short FROM hr_ins_sheet t JOIN hr_legal l ON l.id=t.legal_id WHERE t.month=$1 ${w}`, pr)) { const r = s.rates; for (const l of s.lines || []) { const a = +l.salary || 0, d = a * (r.dn_bhxh + r.dn_bhyt + r.dn_bhtn) / 100, e = a * (r.nld_bhxh + r.nld_bhyt + r.nld_bhtn) / 100; base += a; dn += d; nld += e; rows.push({ code: l.code, name: l.name, legal: s.short, sal: canPay(u) || u.role === 'ke_toan' ? a : '', e: canPay(u) || u.role === 'ke_toan' ? e : '', d: canPay(u) || u.role === 'ke_toan' ? d : '', t: canPay(u) || u.role === 'ke_toan' ? d + e : '', ch: l.change || '', note: l.need_data ? 'Cần cập nhật dữ liệu' : l.note || '', _e: ['ins_sheet', s.id] }); } }
  return { kpis: [['Quỹ lương đóng BH', base, 'đ'], ['Phần NLĐ', Math.round(nld), 'đ'], ['Phần doanh nghiệp', Math.round(dn), 'đ'], ['Tổng phải nộp', Math.round(nld + dn), 'đ']], cols: [['code', 'Mã NV'], ['name', 'Họ tên'], ['legal', 'Pháp nhân'], ['sal', 'Mức lương đóng BH', 'm'], ['e', 'Phần NLĐ', 'm'], ['d', 'Phần doanh nghiệp', 'm'], ['t', 'Tổng phải nộp', 'm'], ['ch', 'Tăng / giảm'], ['note', 'Ghi chú hồ sơ']], rows };
};
R['BH-02'] = async (p, u) => {
  const y = String(p.year || today().slice(0, 4)), pr = [y + '%'], w = lg(u, p, 't.legal_id', pr);
  const sh = await mq(`SELECT t.* FROM hr_ins_sheet t WHERE t.month LIKE $1 ${w}`, pr); let debt = 0;
  const rows = []; for (let i = 1; i <= 12; i++) { const m = `${y}-${String(i).padStart(2, '0')}`, x = sh.filter(s => s.month === m), d = x.reduce((s, r) => s + (+r.due || 0), 0), paid = x.reduce((s, r) => s + (+r.paid || 0), 0), base = x.reduce((s, r) => s + (+r.base_total || 0), 0); debt += d - paid; if (x.length) rows.push({ m: i, n: x.reduce((s, r) => s + r.n_emp, 0), base, nld: x.reduce((s, r) => s + (+r.base_total || 0) * (r.rates.nld_bhxh + r.rates.nld_bhyt + r.rates.nld_bhtn) / 100, 0), dn: x.reduce((s, r) => s + (+r.base_total || 0) * (r.rates.dn_bhxh + r.rates.dn_bhyt + r.rates.dn_bhtn) / 100, 0), d, paid, diff: d - paid, doc: x.map(r => r.paid_doc).filter(Boolean).join(', ') }); }
  return { kpis: [['Tổng phải nộp năm', rows.reduce((s, r) => s + r.d, 0), 'đ'], ['Tổng đã nộp năm', rows.reduce((s, r) => s + r.paid, 0), 'đ'], ['Công nợ cuối năm', debt, 'đ'], ['Tháng chênh lệch', rows.filter(r => r.diff).length]], cols: [['m', 'Tháng', 'n'], ['n', 'Số NLĐ', 'n'], ['base', 'Quỹ đóng BH', 'm'], ['nld', 'NLĐ phải nộp', 'm'], ['dn', 'DN phải nộp', 'm'], ['d', 'Tổng phải nộp', 'm'], ['paid', 'Đã nộp', 'm'], ['diff', 'Chênh lệch', 'm'], ['doc', 'Chứng từ']], rows };
};
R['CĐ-01'] = async (p, u) => {
  const m = p.month || curMonth(), pr = [m], w = lg(u, p, 't.legal_id', pr), rows = [];
  for (const s of await mq(`SELECT t.*, l.short, l.has_union FROM hr_cd_sheet t JOIN hr_legal l ON l.id=t.legal_id WHERE t.month=$1 ${w}`, pr)) { const r = s.rates, x = B.cdTotals(s.lines || [], r); rows.push({ legal: s.short, m: s.month, grp: s.has_union ? 'Đã có CĐCS' : 'Chưa có CĐCS', base: x.base, kp: x.kp, dp: x.dp, total: x.kp + x.dp, due: x.due, kept: x.kept, paid: s.paid || 0, diff: x.due - (s.paid || 0), _e: ['cd_sheet', s.id] }); }
  const S = k => rows.reduce((s, r) => s + r[k], 0);
  return { kpis: [['Căn cứ tính', S('base'), 'đ'], ['Kinh phí công đoàn', Math.round(S('kp')), 'đ'], ['Đoàn phí', Math.round(S('dp')), 'đ'], ['Số đã nộp', S('paid'), 'đ']], cols: [['legal', 'Pháp nhân'], ['m', 'Tháng'], ['grp', 'Đối tượng / nhóm'], ['base', 'Căn cứ trích', 'm'], ['kp', 'Kinh phí CĐ', 'm'], ['dp', 'Đoàn phí', 'm'], ['total', 'Tổng trích', 'm'], ['due', 'Phải nộp', 'm'], ['kept', 'Được giữ', 'm'], ['paid', 'Đã nộp', 'm'], ['diff', 'Chênh lệch', 'm']], rows };
};
R['CĐ-02'] = async (p, u) => {
  const y = String(p.year || today().slice(0, 4)), pr = [y + '%'], w = lg(u, p, 't.legal_id', pr), rows = []; let bal = 0;
  for (const s of await mq(`SELECT t.*, l.short FROM hr_cd_sheet t JOIN hr_legal l ON l.id=t.legal_id WHERE t.month LIKE $1 ${w} ORDER BY t.month`, pr)) { const x = B.cdTotals(s.lines || [], s.rates); bal += x.kept - (+s.used || 0); rows.push({ m: +s.month.slice(5), legal: s.short, kp: x.kp, dp: x.dp, due: x.due, paid: s.paid || 0, kept: x.kept, used: s.used || 0, bal }); }
  const S = k => rows.reduce((s, r) => s + r[k], 0);
  return { kpis: [['Tổng kinh phí CĐ', Math.round(S('kp')), 'đ'], ['Tổng đoàn phí', Math.round(S('dp')), 'đ'], ['Đã nộp / đã chi', S('paid') + S('used'), 'đ'], ['Số dư theo dõi', Math.round(bal), 'đ']], cols: [['m', 'Tháng', 'n'], ['legal', 'Pháp nhân'], ['kp', 'Kinh phí CĐ', 'm'], ['dp', 'Đoàn phí', 'm'], ['due', 'Tổng phải nộp', 'm'], ['paid', 'Đã nộp', 'm'], ['kept', 'Được để lại', 'm'], ['used', 'Đã sử dụng', 'm'], ['bal', 'Số dư', 'm']], rows };
};
R.CCTC05 = async (p, u) => {
  const pr = [], w = lg(u, p, 'h.legal_id', pr), m = curMonth();
  const hc = await mq(`SELECT h.*, l.short, d.name dept FROM hr_headcount h JOIN hr_legal l ON l.id=h.legal_id JOIN hr_dept d ON d.id=h.dept_id WHERE h.status='da_duyet' ${w}`, pr);
  const rows = []; for (const h of hc) {
    const cur = (await one("SELECT count(*) n FROM hr_employee WHERE dept_id=$1 AND legal_id=$2 AND title=$3 AND state<>'da_nghi'", [h.dept_id, h.legal_id, h.title])).n;
    const doing = (await one("SELECT coalesce(sum(qty),0) n FROM hr_rec_plan WHERE dept_id=$1 AND position=$2 AND status='da_duyet' AND rec_state='dang_tuyen'", [h.dept_id, h.title])).n;
    const sure = (await one("SELECT count(*) n FROM hr_candidate WHERE dept_id=$1 AND position=$2 AND status='S53'", [h.dept_id, h.title])).n;
    rows.push({ legal: h.short, dept: h.dept, title: h.title, plan: h.qty, cur, gap: h.qty - cur, doing, left: h.qty - cur - sure, note: h.note, _e: ['headcount', h.id] });
  }
  const pl = rows.reduce((s, r) => s + r.plan, 0), cu = rows.reduce((s, r) => s + r.cur, 0);
  return { kpis: [['Định biên được duyệt', pl], ['Nhân sự hiện có', cu], ['Chênh lệch định biên', pl - cu], ['Vị trí đang tuyển', rows.reduce((s, r) => s + r.doing, 0)]], cols: [['legal', 'Pháp nhân'], ['dept', 'Phòng ban'], ['title', 'Chức danh'], ['plan', 'Định biên duyệt', 'n'], ['cur', 'Hiện có', 'n'], ['gap', 'Thiếu / thừa', 'n'], ['doing', 'Đang tuyển', 'n'], ['left', 'Còn thiếu sau tuyển', 'n'], ['note', 'Ghi chú']], rows };
};
R.PLI = async (p, u) => {
  const m = p.month || curMonth(), s = await staffRows(u, p, m), pii = M.PII_ROLES.includes(u.role);
  const ct = Object.fromEntries((await q("SELECT DISTINCT ON (emp_id) emp_id, kind, from_on, to_on FROM hr_contract WHERE kind<>'HD04' ORDER BY emp_id, from_on DESC")).map(c => [c.emp_id, c]));
  const rows = s.map(e => { const c = ct[e.id] || {}; return { legal: e.legal, name: e.full_name, ins: pii ? e.ins_no : '', dob: pii ? e.dob : '', gender: e.gender, cccd: pii ? e.cccd : '', title: e.title, pos: ['TGĐ', 'PTGĐ', 'GĐ', 'TP', 'PP'].includes(e.level) ? 'Nhà quản lý' : e.level === 'CV' ? 'CMKT bậc cao' : 'Khác', sal: canPay(u) ? e.ins_salary : '', cond: e.work_cond, c3: c.kind === 'HD03' ? c.from_on : '', c2a: c.kind === 'HD02' ? c.from_on : '', c2b: c.kind === 'HD02' ? c.to_on : '', c1a: c.kind === 'HD01' ? c.from_on : '', c1b: c.kind === 'HD01' ? c.to_on : '', _e: ['employee', e.id] }; });
  return { kpis: [['Tổng lao động', s.length], ['Lao động nữ', s.filter(e => e.gender === 'Nữ').length], ['Nặng nhọc, độc hại', s.filter(e => e.work_cond === 'Nặng nhọc').length], ['Pháp nhân', new Set(s.map(e => e.legal)).size]], cols: [['legal', 'Pháp nhân'], ['name', 'Họ tên'], ['ins', 'Mã số BHXH'], ['dob', 'Ngày sinh', 'd'], ['gender', 'Giới tính'], ['cccd', 'Số CCCD'], ['title', 'Chức danh'], ['pos', 'Vị trí việc làm'], ['sal', 'Mức lương', 'm'], ['c3', 'HĐ không XĐTH từ', 'd'], ['c2a', 'HĐ XĐTH từ', 'd'], ['c2b', 'HĐ XĐTH đến', 'd'], ['c1a', 'Thử việc từ', 'd'], ['c1b', 'Thử việc đến', 'd']], rows };
};
async function report(code, p, u) { const fn = R[code]; if (!fn) C.notFound(null, 'báo cáo'); const s = SPEC[code]; return { code, title: s[0], rule: s[1], control: s[2], source: s[3], flow: s[4], ...(await fn(p, u)) }; }

// ---------- cảnh báo: Cần cập nhật dữ liệu / Sắp đến hạn / Quá hạn / Đã xử lý — có nguồn, người phụ trách, hành động ----------
async function alerts(u) {
  const t = today(), out = [], pr = [], w = lg(u, {}, 'c.legal_id', pr);
  const hcns = (await one("SELECT full_name FROM hr_user WHERE role='tp_hcns' LIMIT 1"))?.full_name || 'HCNS';
  const push = (key, grp, title, detail, level, due, src, link, owner = hcns) => out.push({ key, grp, title, detail, level, due, src, link, owner });
  const lv = d => d < 0 ? 'qua_han' : 'sap_den_han';
  for (const c of await mq(`SELECT c.id, c.no, c.kind, c.to_on, c.state, e.full_name, l.short FROM hr_contract c JOIN hr_employee e ON e.id=c.emp_id JOIN hr_legal l ON l.id=c.legal_id WHERE c.state IN ('hieu_luc','cho_quyet_dinh') AND e.state<>'da_nghi' AND c.kind IN ('HD01','HD02') ${w}`, pr)) {
    if (!c.to_on) { push('hd-' + c.id, 'HĐLĐ', `${c.full_name}: thiếu ngày hết hạn HĐ`, `${c.no} · ${c.short}`, 'can_cap_nhat', null, 'HD12', `e/contract/${c.id}`); continue; }
    const d = dayDiff(t, c.to_on); if (d <= 30) push('hd-' + c.id + '-' + c.to_on, 'HĐLĐ', `${c.kind === 'HD01' ? 'Hết thử việc' : 'HĐ hết hạn'}: ${c.full_name}`, `${c.no} · ${c.short} · ${d < 0 ? 'quá ' + -d : 'còn ' + d} ngày${c.state === 'cho_quyet_dinh' ? ' · chờ quyết định' : ''}`, lv(d), c.to_on, 'HD12', `e/contract/${c.id}`);
  }
  for (const v of await vehicleDue(u)) { if (v.left == null) push(`xe-${v.id}-${v.kind}`, 'Xe – tài sản', `${v.plate}: thiếu ngày ${v.kind.toLowerCase()}`, '', 'can_cap_nhat', null, 'XC03', `e/vehicle/${v.id}`); else if (v.left <= 30) push(`xe-${v.id}-${v.kind}-${v.due}`, 'Xe – tài sản', `${v.kind} xe ${v.plate}`, `${v.left < 0 ? 'quá ' + -v.left : 'còn ' + v.left} ngày`, lv(v.left), v.due, 'XC03', `e/vehicle/${v.id}`, v.owner || hcns); }
  const pa = [], wa = lg(u, {}, 'a.legal_id', pa);
  for (const a of await mq(`SELECT a.id, a.code, a.name, a.status, a.holder_id, a.repair_due FROM hr_asset a WHERE a.status IN ('dang_dung','sua_chua') ${wa}`, pa)) {
    if (a.status === 'dang_dung' && !a.holder_id) push('ts-' + a.id, 'Xe – tài sản', `Tài sản ${a.code}: thiếu người quản lý`, a.name, 'can_cap_nhat', null, 'TS02', `e/asset/${a.id}`);
    if (a.status === 'sua_chua' && a.repair_due && a.repair_due < t) push('ts-sc-' + a.id, 'Xe – tài sản', `Tài sản ${a.code}: sửa chữa quá hạn`, a.name, 'qua_han', a.repair_due, 'TS02', `e/asset/${a.id}`);
  }
  const m = t.slice(5, 7), pb = [m], wb = lg(u, {}, 'e.legal_id', pb);
  for (const e of await mq(`SELECT e.id, e.full_name, e.dob, d.name dept FROM hr_employee e LEFT JOIN hr_dept d ON d.id=e.dept_id WHERE to_char(e.dob,'MM')=$1 AND e.state<>'da_nghi' ${wb} ORDER BY to_char(e.dob,'DD')`, pb)) push(`sn-${e.id}-${t.slice(0, 7)}`, 'Nhân sự', `Sinh nhật ${e.dob.slice(8, 10)}/${m}: ${e.full_name}`, e.dept || '', 'sap_den_han', `${t.slice(0, 4)}-${m}-${e.dob.slice(8, 10)}`, 'HS02', `e/employee/${e.id}`);
  const pc = [], wc = lg(u, {}, 'e.legal_id', pc);
  for (const e of await mq(`SELECT e.id, e.full_name, e.dept_id, e.phone, e.bank_acct, e.manager_id, e.level FROM hr_employee e WHERE e.state<>'da_nghi' AND (e.dept_id IS NULL OR e.phone IS NULL OR e.bank_acct IS NULL OR (e.manager_id IS NULL AND e.level NOT IN ('TGĐ','PTGĐ','GĐ'))) ${wc}`, pc)) {
    const miss = [!e.dept_id && 'phòng ban', !e.phone && 'điện thoại', !e.bank_acct && 'tài khoản', !e.manager_id && !['TGĐ', 'PTGĐ', 'GĐ'].includes(e.level) && 'quản lý trực tiếp'].filter(Boolean);
    push('hs-' + e.id, 'Nhân sự', `${e.full_name}: hồ sơ thiếu thông tin`, miss.join(', '), 'can_cap_nhat', null, 'HS01', `e/employee/${e.id}`);
  }
  if (!u.legal_ids) for (const r of (await R.VPP06({ month: t.slice(0, 7) }, u)).rows.filter(r => r.warn)) push(`vpp-${r.code}-${t.slice(0, 7)}`, 'Khác', `VPP dưới định mức: ${r.name}`, `Tồn ${r.close}/${r.min} ${r.unit || ''}`, 'sap_den_han', null, 'VPP06', 'r/VPP06');
  for (const r of (await R.TD04({}, u)).rows.filter(r => r.warn)) push('td-' + r.id, 'Khác', `Vị trí quá hạn tuyển: ${r.position}`, `${r.got}/${r.qty} · hạn ${dmy(r.due_on)}`, 'qua_han', r.due_on, 'TD04', `e/rec_plan/${r.id}`);
  for (const r of await q("SELECT id, kind, period, due_on FROM hr_gov_report WHERE status='chua' AND due_on <= $1", [addDays(t, 30)])) push('bc-' + r.id, 'Khác', `Báo cáo lao động đến hạn nộp`, `${r.period}`, lv(dayDiff(t, r.due_on)), r.due_on, 'BC-6T', `e/gov_report/${r.id}`);
  const st = Object.fromEntries((await q('SELECT key, state, note FROM hr_alert_state')).map(r => [r.key, r]));
  for (const a of out) if (st[a.key]) { a.done = true; a.level = 'da_xu_ly'; a.note = st[a.key].note; }
  const ord = { qua_han: 0, sap_den_han: 1, can_cap_nhat: 2, da_xu_ly: 3 };
  return out.sort((a, b) => ord[a.level] - ord[b.level] || String(a.due || 'z').localeCompare(b.due || 'z'));
}

// ---------- hộp việc: phiếu chờ tôi duyệt ----------
async function inbox(u) {
  const rows = await q("SELECT a.*, r.full_name by_name FROM hr_approval a LEFT JOIN hr_user r ON r.id=a.requested_by WHERE a.status='cho_duyet' ORDER BY a.requested_at");
  return rows.filter(a => u.role === 'admin' || a.roles.includes(u.role));
}

// ---------- dashboard ----------
const sMonths = (m, c = 6) => { const o = []; for (let i = c - 1; i >= 0; i--) { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 - i, 1)); o.push(d.toISOString().slice(0, 7)); } return o; };
const share = items => { const t = items.reduce((s, x) => s + x[1], 0) || 1; return items.map(([l, v, link]) => ({ l, v, pct: Math.round(v / t * 100), link })); };
async function dash(id, p, u) {
  const m = p.month || curMonth(), A = await alerts(u), open = A.filter(a => !a.done), cnt = f => open.filter(f).length, ms = sMonths(m);
  const staff = await staffRows(u, p, m), r = c => report(c, p, u), inb = await inbox(u);
  const sal = async mm => (await q('SELECT coalesce(sum(net_total),0) n FROM hr_payroll WHERE month=$1', [mm]))[0].n;
  const hist = [];
  if (id === 'DB01') {
    for (const x of ms) hist.push((await staffRows(u, p, x)).length);
    const grp = {}; for (const e of staff) grp[e.dept || 'Chưa gán phòng'] = (grp[e.dept || 'Chưa gán phòng'] || 0) + 1;
    return { title: 'Tổng quan điều hành HCNS', sub: `Dữ liệu thực tế · ${staff.length} nhân sự · Kỳ ${m.slice(5)}/${m.slice(0, 4)}`,
      todo: [['fa-signature', cnt(a => 0), 'Phiếu chờ tôi duyệt', inb.length, 'v/inbox', 'v'], ['fa-file-contract', 0, 'HĐ hết hạn ≤ 30 ngày', cnt(a => a.src === 'HD12' && a.level !== 'can_cap_nhat'), 'r/HD12', 'a'], ['fa-car', 0, 'Hạn xe cần xử lý', cnt(a => a.src === 'XC03' && a.level !== 'can_cap_nhat'), 'r/XC03', 'b'], ['fa-database', 0, 'Hồ sơ cần cập nhật', cnt(a => a.level === 'can_cap_nhat'), 'd/DB06', 'g']],
      kpis: [['Tổng nhân sự', staff.length, 'người', 'r/HS02', 'g', 'fa-users'], ['Pháp nhân', new Set(staff.map(e => e.legal)).size, 'công ty', 'e/legal', 'n', 'fa-landmark'], ['Đầu việc cần xử lý', open.filter(a => a.level !== 'can_cap_nhat').length + inb.length, 'việc', 'd/DB06', 'b', 'fa-list-check'], ['Cảnh báo đến hạn', cnt(a => ['qua_han', 'sap_den_han'].includes(a.level) && a.src !== 'HS02'), 'mục', 'd/DB06', 'a', 'fa-triangle-exclamation']],
      bar: { title: 'Biến động nhân sự theo tháng', labels: ms.map(x => 'T' + +x.slice(5)), values: hist, unit: 'người', link: 'r/HS02' }, share: { title: 'Cơ cấu theo phòng ban', items: share(Object.entries(grp).sort((a, b) => b[1] - a[1]).slice(0, 7)) },
      alerts: [['Hợp đồng sắp hết hạn', cnt(a => a.src === 'HD12' && a.level !== 'can_cap_nhat'), 'r/HD12'], ['Xe đến hạn', cnt(a => a.src === 'XC03' && a.level !== 'can_cap_nhat'), 'r/XC03'], ['Hồ sơ thiếu thông tin', cnt(a => a.src === 'HS01'), 'd/DB06']] };
  }
  if (id === 'DB02') {
    const h = await r('CCTC05'), plan = h.rows.reduce((s, x) => s + x.plan, 0), cur = h.rows.reduce((s, x) => s + x.cur, 0), blk = {}; for (const e of staff) blk[e.legal] = (blk[e.legal] || 0) + 1;
    return { title: 'Nhân sự – cơ cấu – định biên', sub: 'Định biên lấy từ kế hoạch đã duyệt (CCTC05)', kpis: [['Nhân sự hiện có', staff.length, 'người', 'r/HS02', 'g', 'fa-users'], ['Định biên duyệt', plan, 'vị trí', 'r/CCTC05', 'n', 'fa-people-group'], ['Vị trí còn thiếu', Math.max(plan - cur, 0), 'vị trí', 'r/CCTC05', 'a', 'fa-user-minus'], ['Tỷ lệ đáp ứng', plan ? Math.round(cur / plan * 1000) / 10 : 0, '%', 'r/CCTC05', 'b', 'fa-percent']],
      bar: { title: 'Hiện có so với định biên', labels: h.rows.map(x => x.title), values: h.rows.map(x => x.cur), target: h.rows.map(x => x.plan), unit: 'người', link: 'r/CCTC05' }, share: { title: 'Cơ cấu theo pháp nhân', items: share(Object.entries(blk).sort((a, b) => b[1] - a[1])) },
      alerts: [['Vị trí thiếu định biên', h.rows.filter(x => x.gap > 0).length, 'r/CCTC05'], ['Nhân sự chưa gán phòng', staff.filter(e => !e.dept_id).length, 'e/employee'], ['Chưa có quản lý trực tiếp', staff.filter(e => !e.manager_id && !['TGĐ', 'PTGĐ', 'GĐ'].includes(e.level)).length, 'e/employee']] };
  }
  if (id === 'DB03') {
    const t = await r('TD04'), cand = (await q("SELECT status, count(*) n FROM hr_candidate GROUP BY 1")), stateN = {}; for (const x of await q('SELECT rec_state, sum(qty) n FROM hr_rec_plan GROUP BY 1')) stateN[x.rec_state] = x.n;
    const hd = A.filter(a => a.src === 'HD12' && a.level !== 'can_cap_nhat');
    for (const x of ms) hist.push((await one("SELECT count(*) n FROM hr_candidate WHERE to_char(got_on,'YYYY-MM')=$1", [x])).n);
    return { title: 'Tuyển dụng – hợp đồng', sub: 'Theo kế hoạch tuyển dụng đã duyệt', kpis: [['Nhu cầu tuyển', t.kpis[0][1], 'người', 'r/TD04', 'g', 'fa-bullhorn'], ['Đã nhận việc', t.kpis[2][1], 'người', 'r/TD04', 'n', 'fa-user-check'], ['Đang phỏng vấn', cand.filter(x => ['S33', 'S34'].includes(x.status)).reduce((s, x) => s + x.n, 0), 'ứng viên', 'e/candidate', 'b', 'fa-comments'], ['HĐ đến hạn 30 ngày', hd.length, 'hồ sơ', 'r/HD12', 'a', 'fa-file-contract']],
      bar: { title: 'Hồ sơ ứng viên nhận theo tháng', labels: ms.map(x => 'T' + +x.slice(5)), values: hist, unit: 'hồ sơ', link: 'e/candidate' }, share: { title: 'Tiến độ tuyển', items: share([['Đã tuyển', stateN.da_tuyen || 0], ['Đang tuyển', stateN.dang_tuyen || 0], ['Chưa mở', stateN.chua_mo || 0], ['Hoãn', stateN.hoan || 0]]) },
      alerts: [['HĐ sắp hết hạn', hd.length, 'r/HD12'], ['Vị trí quá hạn tuyển', t.rows.filter(x => x.warn).length, 'r/TD04'], ['Ứng viên chờ phản hồi', cand.filter(x => ['S12', 'S52'].includes(x.status)).reduce((s, x) => s + x.n, 0), 'e/candidate']] };
  }
  if (id === 'DB04') {
    const per = await q('SELECT status FROM hr_att_period WHERE month=$1', [m]), pay = await q('SELECT status, net_total, lines FROM hr_payroll WHERE month=$1', [m]), insS = await q('SELECT due, status FROM hr_ins_sheet WHERE month=$1', [m]), cd = await q('SELECT due, status FROM hr_cd_sheet WHERE month=$1', [m]);
    const exp = (await one("SELECT count(*) n FROM hr_explain WHERE status IN ('nhap','cho_duyet')")).n;
    const gross = pay.reduce((s, x) => s + (x.lines || []).reduce((t, l) => t + l.total, 0), 0), insD = insS.reduce((s, x) => s + +x.due, 0), cdD = cd.reduce((s, x) => s + +x.due, 0);
    for (const x of ms) hist.push(Math.round((await sal(x)) / 1e4) / 100);
    return { title: 'Công – lương – bảo hiểm – công đoàn', sub: 'Kiểm soát kỳ lương và nghĩa vụ trích nộp', kpis: [['Kỳ công đã chốt', `${per.filter(x => x.status === 'khoa').length} / ${per.length}`, 'pháp nhân', 'e/att_period', 'g', 'fa-lock'], ['Hồ sơ còn chờ', exp, 'trường hợp', 'e/explain', 'n', 'fa-hourglass-half'], ['Quỹ lương', Math.round(gross / 1e4) / 100, 'triệu đồng', 'r/TL05', 'b', 'fa-money-bills'], ['Nghĩa vụ trích nộp', Math.round((insD + cdD) / 1e4) / 100, 'triệu đồng', 'r/BH-01', 'a', 'fa-shield-heart']],
      bar: { title: 'Thực lĩnh theo kỳ (triệu đồng)', labels: ms.map(x => 'T' + +x.slice(5)), values: hist, unit: 'tr', link: 'r/TL05' }, share: { title: 'Cơ cấu chi phí', items: share([['Lương', gross, 'r/TL05'], ['BH bắt buộc', insD, 'r/BH-01'], ['Công đoàn', cdD, 'r/CĐ-01']]) },
      alerts: [['Giải trình công chờ duyệt', exp, 'e/explain'], ['Bảng BH chưa duyệt', insS.filter(x => x.status === 'nhap').length, 'e/ins_sheet'], ['Hồ sơ lương chưa duyệt', pay.filter(x => x.status === 'nhap').length, 'e/payroll']] };
  }
  if (id === 'DB05') {
    const ts = await r('TS02'), vpp = await r('VPP06'), ph = await r('PH02'), xe = await r('XC03');
    for (const x of ms) { const v = (await one(`SELECT (SELECT coalesce(sum(amount),0) FROM hr_meal_out WHERE to_char(pay_on,'YYYY-MM')=$1) + (SELECT coalesce(sum(fee),0) FROM hr_mail WHERE to_char(send_on,'YYYY-MM')=$1) + (SELECT coalesce(sum(r.cost),0) FROM hr_car_return r WHERE to_char(r.back_at,'YYYY-MM')=$1) AS n`, [x])).n; hist.push(Math.round(v / 1e4) / 100); }
    const parts = async () => { const v = await one(`SELECT (SELECT coalesce(sum(amount),0) FROM hr_meal_out WHERE to_char(pay_on,'YYYY-MM')=$1) a, (SELECT coalesce(sum(fee),0) FROM hr_mail WHERE to_char(send_on,'YYYY-MM')=$1) b, (SELECT coalesce(sum(r.cost),0) FROM hr_car_return r WHERE to_char(r.back_at,'YYYY-MM')=$1) c`, [m]); return [['Suất ăn', v.a, 'r/SA05'], ['Chuyển phát', v.b, 'r/GT02'], ['Xe', v.c, 'r/XC02']]; };
    return { title: 'Hành chính – tài sản – dịch vụ', sub: 'Tài sản, VPP, xe, phòng họp, suất ăn', kpis: [['Tài sản đang dùng', ts.kpis[1][1], 'tài sản', 'r/TS02', 'g', 'fa-laptop'], ['VPP dưới định mức', vpp.kpis[3][1], 'mặt hàng', 'r/VPP06', 'a', 'fa-pen-ruler'], ['Xe cần xử lý hạn', xe.rows.filter(x => x.left != null && x.left <= 30).length, 'mục', 'r/XC03', 'b', 'fa-car'], ['Lượt đặt phòng họp', ph.kpis[0][1], 'lượt', 'r/PH02', 'n', 'fa-chalkboard-user']],
      bar: { title: 'Chi phí hành chính theo tháng (triệu đồng)', labels: ms.map(x => 'T' + +x.slice(5)), values: hist, unit: 'tr' }, share: { title: 'Cơ cấu chi phí tháng', items: share(await parts()) },
      alerts: [['Xe sắp hết hạn bảo hiểm', xe.rows.filter(x => x.kind === 'Bảo hiểm' && x.left != null && x.left <= 30).length, 'r/XC03'], ['Tài sản thiếu người quản lý', ts.rows.filter(x => x.warn === 'Thiếu người quản lý').length, 'r/TS02'], ['Phòng họp chưa đóng lịch', ph.rows.filter(x => x.warn).length, 'r/PH02']] };
  }
  const by = g => open.filter(a => a.grp === g).length;
  const done = A.filter(a => a.done).length;
  for (const x of ms) hist.push(open.filter(a => a.due?.startsWith(x)).length);
  return { title: 'Cảnh báo – công việc cần xử lý', sub: 'Mỗi mục có nguồn, người phụ trách và hành động; bấm để mở hồ sơ', kpis: [['Tổng cảnh báo mở', open.length, 'mục', null, 'g', 'fa-bell'], ['Quá hạn', cnt(a => a.level === 'qua_han'), 'mục', null, 'r', 'fa-circle-exclamation'], ['Sắp đến hạn', cnt(a => a.level === 'sap_den_han'), 'mục', null, 'a', 'fa-clock'], ['Đã xử lý', done, 'mục', null, 'b', 'fa-circle-check']],
    bar: { title: 'Cảnh báo theo tháng đến hạn', labels: ms.map(x => 'T' + +x.slice(5)), values: hist, unit: 'mục' }, share: { title: 'Cơ cấu cảnh báo', items: share([['HĐLĐ', by('HĐLĐ')], ['Xe – tài sản', by('Xe – tài sản')], ['Nhân sự', by('Nhân sự')], ['Khác', by('Khác')]]) }, list: A };
}

module.exports = { report, alerts, inbox, dash, SPEC, R };

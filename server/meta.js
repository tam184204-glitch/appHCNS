// Định nghĩa nghiệp vụ App HCNS — một nguồn cho CSDL (tự tạo bảng/cột), máy chủ (kiểm tra, quyền, phê duyệt) và giao diện (form, danh sách).
// Căn cứ: DMCV.xlsx (cột G đầu vào, cột H đầu ra) + «Bộ 53 biểu mẫu» + «Bộ biểu mẫu cột H và Dashboard».
//
// Trường: { k, l, t, req, o|opt, ref, ro, pii, show, help, def }
//   t: text | long | int | num | money | date | dt | month | sel | ref | user | bool | json (grid) | days | code (tự sinh)
//   o: [[giá trị, nhãn, màu]] — màu: g xanh lá, b xanh dương, a vàng, r đỏ, s xám, v tím, t xanh ngọc
//   pii: true = định danh cá nhân; 'pay' = lương (chỉ PAY_ROLES)
// Quyền: r đọc, c tạo, u sửa, d xóa, a phê duyệt. Quản trị hệ thống luôn đủ quyền.
// self: 'emp_id' | 'id' — Người lao động chỉ thấy bản ghi của mình, Trưởng bộ phận thấy trong phòng mình.

const ROLES = [
  ['nld', 'Người lao động', 'Chỉ xem hồ sơ cá nhân và các đơn yêu cầu của mình'],
  ['truong_bp', 'Trưởng bộ phận', 'Duyệt đơn và xem nhân sự trong phòng mình'],
  ['cv_hc', 'Chuyên viên Hành chính', 'Nghiệp vụ hành chính — không xem lương'],
  ['cv_hcns', 'Chuyên viên HCNS', 'Nhập, rà soát, xuất báo cáo trong pháp nhân được phân công'],
  ['tp_hcns', 'Trưởng phòng HCNS', 'Theo dõi tổng hợp, duyệt theo phân cấp, xử lý cảnh báo'],
  ['bgd', 'Ban giám đốc', 'Xem điều hành và phê duyệt theo thẩm quyền; lương cá nhân không hiện'],
  ['ke_toan', 'Kế toán', 'Đối soát bảo hiểm, công đoàn, chuyển lương'],
  ['admin', 'Quản trị hệ thống', 'Tài khoản, danh mục, cấu hình'],
];
const ALL = ROLES.map(r => r[0]);
const NS = ['cv_hcns', 'tp_hcns'];
const HC = ['cv_hc', 'cv_hcns', 'tp_hcns'];
const TP = ['tp_hcns'];
const STAFF = ['cv_hc', 'cv_hcns', 'tp_hcns', 'bgd', 'ke_toan'];
const PII_ROLES = ['cv_hcns', 'tp_hcns', 'admin'];
const PAY_ROLES = ['cv_hcns', 'tp_hcns', 'admin'];
const DUYET = [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['da_duyet', 'Đã duyệt', 'g'], ['tu_choi', 'Từ chối', 'r']];
const status = (o = DUYET, def = 'nhap') => ({ k: 'status', l: 'Trạng thái', t: 'sel', o, ro: 1, def });
const flow = { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } };
const legal = (x = {}) => ({ k: 'legal_id', l: 'Pháp nhân', t: 'ref', ref: 'legal', req: 1, ...x });
const dept = (x = {}) => ({ k: 'dept_id', l: 'Phòng ban', t: 'ref', ref: 'dept', ...x });
const emp = (l = 'Nhân viên', x = {}) => ({ k: 'emp_id', l, t: 'ref', ref: 'employee', req: 1, ...x });
const money = (k, l, x = {}) => ({ k, l, t: 'money', ...x });
const note = (l = 'Ghi chú') => ({ k: 'note', l, t: 'long' });
const code = (prefix, l = 'Số phiếu') => ({ k: 'code', l, t: 'code', prefix, ro: 1 });
const vppLines = (extra = []) => ({ k: 'lines', l: 'Danh mục sản phẩm', t: 'json', req: 1, grid: [
  { k: 'code', l: 'Mã sản phẩm', pick: 'vpp_item', fill: { name: 'name', unit: 'unit' }, w: 110 }, { k: 'name', l: 'Mô tả', w: 220 }, { k: 'unit', l: 'ĐVT', w: 70 }, ...extra, { k: 'note', l: 'Ghi chú', w: 130 }] });
const assetLines = (extra = []) => ({ k: 'lines', l: 'Danh sách tài sản', t: 'json', req: 1, grid: [
  { k: 'code', l: 'Mã TS', pick: 'asset', fill: { name: 'name', unit: 'unit' }, w: 110 }, { k: 'name', l: 'Tên tài sản', w: 200 }, { k: 'unit', l: 'ĐVT', w: 60 }, { k: 'qty', l: 'SL', w: 60, n: 1 }, ...extra] });

const E = {};
const def = (key, o) => { E[key] = { key, table: 'hr_' + key, r: ALL, ...o }; };

// ===================== CƠ CẤU TỔ CHỨC =====================
def('legal', { title: 'Danh mục pháp nhân', one: 'pháp nhân', code: 'CCTC06', icon: 'fa-landmark', disp: "t.short", c: NS, order: 't.id', fields: [
  { k: 'code', l: 'Mã pháp nhân', t: 'text', req: 1, uniq: 1 }, { k: 'short', l: 'Tên ngắn', t: 'text', req: 1 }, { k: 'name', l: 'Tên đầy đủ', t: 'text', req: 1 },
  { k: 'tax_code', l: 'Mã số thuế', t: 'text' }, { k: 'address', l: 'Địa chỉ trụ sở', t: 'text' }, { k: 'rep', l: 'Đại diện pháp luật', t: 'text' },
  { k: 'has_union', l: 'Đã có công đoàn cơ sở', t: 'bool' }, { k: 'state', l: 'Trạng thái', t: 'sel', o: [['dang_hd', 'Đang hoạt động', 'g'], ['ngung', 'Ngừng', 's'], ['can_bo_sung', 'Cần bổ sung thông tin', 'a']], def: 'dang_hd' },
], list: ['code', 'short', 'name', 'tax_code', 'rep', 'state'] });
def('dept', { title: 'Danh mục bộ phận', one: 'bộ phận', code: 'CCTC01', icon: 'fa-sitemap', disp: 't.name', c: NS, order: 't.code', fields: [
  { k: 'code', l: 'Mã bộ phận', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên bộ phận', t: 'text', req: 1 }, { k: 'legal_id', l: 'Pháp nhân', t: 'ref', ref: 'legal' },
  { k: 'parent_id', l: 'Bộ phận cấp trên', t: 'ref', ref: 'dept' }, { k: 'block', l: 'Khối', t: 'text', sug: ['Khối Home', 'Văn phòng công ty', 'Khối Xây lắp', 'Khối QLN và Đầu tư dịch vụ'] },
  { k: 'head_id', l: 'Người phụ trách', t: 'ref', ref: 'employee' }, { k: 'from_on', l: 'Hiệu lực từ', t: 'date' }, { k: 'version', l: 'Phiên bản sơ đồ tổ chức', t: 'text', def: '01' },
  { k: 'state', l: 'Trạng thái', t: 'sel', o: [['hieu_luc', 'Hiệu lực', 'g'], ['ngung', 'Ngừng', 's']], def: 'hieu_luc' },
], list: ['code', 'name', 'block', 'parent_id', 'head_id', 'state'] });
def('position', { title: 'Danh mục chức danh', one: 'chức danh', code: 'CCTC02', icon: 'fa-id-badge', disp: 't.name', c: NS, order: 't.name', fields: [
  { k: 'code', l: 'Mã chức danh', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên chức danh', t: 'text', req: 1 }, dept(), { k: 'jd_code', l: 'Mã JD', t: 'text' },
  { k: 'state', l: 'Trạng thái', t: 'sel', o: [['hieu_luc', 'Hiệu lực', 'g'], ['ngung', 'Ngừng', 's']], def: 'hieu_luc' },
], list: ['code', 'name', 'dept_id', 'jd_code', 'state'] });
const EMP_ST = [['dang_lam', 'Đang làm', 'g'], ['thu_viec', 'Thử việc', 'b'], ['thai_san', 'Thai sản', 'v'], ['nghi_kl', 'Nghỉ không lương', 'a'], ['da_nghi', 'Đã nghỉ', 's']];
const DOCS = [['gks', 'Giấy khám sức khỏe'], ['syll', 'SYLL'], ['cu_tru', 'Xác nhận cư trú'], ['cccd', 'CCCD'], ['bang', 'Bằng cấp/chứng chỉ'], ['khac', 'Hồ sơ khác']];
def('employee', { title: 'Hồ sơ nhân sự', one: 'nhân sự', code: 'HS01', icon: 'fa-user-tie', disp: "t.code||' · '||t.full_name", r: ALL, c: NS, d: TP, self: 'id', imp: 1, order: 't.full_name',
  search: ['code', 'full_name', 'title'], files: [['ho_so', 'Hồ sơ cá nhân']], fields: [
  { k: 'code', l: 'Mã nhân viên', t: 'text', req: 1, uniq: 1, sec: 'Thông tin cá nhân' }, { k: 'full_name', l: 'Họ và tên', t: 'text', req: 1 },
  { k: 'gender', l: 'Giới tính', t: 'sel', o: [['Nam', 'Nam'], ['Nữ', 'Nữ']] }, { k: 'dob', l: 'Ngày sinh', t: 'date', pii: 1 },
  { k: 'cccd', l: 'Số định danh/CCCD', t: 'text', pii: 1 }, { k: 'cccd_date', l: 'Ngày cấp', t: 'date', pii: 1 }, { k: 'cccd_place', l: 'Nơi cấp', t: 'text', pii: 1 },
  { k: 'address', l: 'Địa chỉ cư trú', t: 'text', pii: 1 }, { k: 'phone', l: 'Điện thoại cá nhân', t: 'text', pii: 1 }, { k: 'email', l: 'Email cá nhân', t: 'text', pii: 1 },
  { k: 'school', l: 'Trường / chuyên ngành', t: 'text', sec: 'Đào tạo – chứng chỉ' }, { k: 'cert', l: 'Chứng chỉ/chứng nhận', t: 'text' }, { k: 'health', l: 'Phân loại sức khỏe', t: 'text' },
  { k: 'safety_group', l: 'An toàn lao động — nhóm', t: 'text' }, { k: 'safety_to', l: 'An toàn lao động — thời hạn', t: 'date' }, { k: 'exp', l: 'Kinh nghiệm trước', t: 'long' }, { k: 'exp_ct', l: 'Kinh nghiệm tại Cát Tường', t: 'long' },
  legal({ l: 'Pháp nhân ký HĐLĐ', sec: 'Thông tin làm việc và thanh toán' }), dept(), { k: 'title', l: 'Chức danh', t: 'text', req: 1 }, { k: 'level', l: 'Cấp bậc', t: 'sel', o: ['TGĐ', 'PTGĐ', 'GĐ', 'TP', 'PP', 'CV', 'NV'].map(x => [x, x]) },
  { k: 'manager_id', l: 'Quản lý trực tiếp', t: 'ref', ref: 'employee' }, { k: 'join_on', l: 'Ngày vào làm', t: 'date', req: 1 }, { k: 'leave_on', l: 'Ngày nghỉ việc', t: 'date' },
  { k: 'state', l: 'Trạng thái', t: 'sel', o: EMP_ST, def: 'dang_lam' }, { k: 'work_cond', l: 'Điều kiện lao động', t: 'sel', o: [['Bình thường', 'Bình thường'], ['Nặng nhọc', 'Nặng nhọc']], def: 'Bình thường' },
  { k: 'bank', l: 'Ngân hàng', t: 'text', pii: 1 }, { k: 'bank_acct', l: 'Số tài khoản', t: 'text', pii: 1 }, { k: 'ins_no', l: 'Số sổ BHXH', t: 'text', pii: 1 }, { k: 'tax_no', l: 'Mã số thuế TNCN', t: 'text', pii: 1 },
  { k: 'union_member', l: 'Đoàn viên công đoàn', t: 'bool' },
  money('pay_p1', 'Lương vị trí P1 (đ/tháng)', { pii: 'pay', sec: 'Lương – bảo hiểm' }), money('pay_p2', 'Lương hiệu quả công việc P2 (đ/tháng)', { pii: 'pay' }), money('ins_salary', 'Mức đóng BHXH (đ/tháng)', { pii: 'pay' }),
  { k: 'contacts', l: 'Liên hệ khẩn cấp', t: 'json', sec: 'Liên hệ – người phụ thuộc', grid: [{ k: 'name', l: 'Họ tên', w: 170, pii: 1 }, { k: 'rel', l: 'Quan hệ', w: 90 }, { k: 'phone', l: 'Số điện thoại', w: 120, pii: 1 }, { k: 'info', l: 'Thông tin cần thiết', w: 180 }] },
  { k: 'dependents', l: 'Người phụ thuộc', t: 'json', grid: [{ k: 'name', l: 'Họ tên', w: 170 }, { k: 'rel', l: 'Quan hệ', w: 80 }, { k: 'id_no', l: 'Số CCCD', w: 130, pii: 1 }, { k: 'dob', l: 'Ngày sinh', w: 100, pii: 1 }, { k: 'from_m', l: 'Giảm trừ từ tháng', w: 100 }, { k: 'to_m', l: 'Đến tháng', w: 90 }] },
  { k: 'docs', l: 'Hồ sơ đã nộp / đối chiếu', t: 'multi', o: DOCS, sec: 'Hồ sơ' }, note(),
], list: ['code', 'full_name', 'legal_id', 'dept_id', 'title', 'join_on', 'state'], filters: ['legal_id', 'dept_id', 'state'] });
def('headcount', { title: 'Kế hoạch định biên', one: 'dòng định biên', code: 'CCTC05', icon: 'fa-people-group', disp: "t.title", r: STAFF, c: NS, a: ['bgd', 'tp_hcns'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  legal(), dept({ req: 1 }), { k: 'title', l: 'Chức danh', t: 'text', req: 1 }, { k: 'period', l: 'Kỳ kế hoạch', t: 'text', req: 1, def: '2026' }, { k: 'qty', l: 'Định biên đề xuất', t: 'int', req: 1 }, status(), note(),
], list: ['legal_id', 'dept_id', 'title', 'period', 'qty', 'status'], filters: ['legal_id', 'dept_id', 'status'] });

// ===================== VĂN PHÒNG PHẨM =====================
def('vpp_item', { title: 'Danh mục văn phòng phẩm', one: 'mặt hàng', code: 'VPP05', icon: 'fa-pen-ruler', disp: "t.code||' · '||t.name", c: HC, d: HC, imp: 1, order: "length(t.code), t.code", fields: [
  { k: 'code', l: 'Mã VPP', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên VPP', t: 'text', req: 1 }, { k: 'descr', l: 'Mô tả', t: 'text' }, { k: 'unit', l: 'Đơn vị tính', t: 'text', req: 1 },
], list: ['code', 'name', 'unit', 'descr'] });
def('vpp_norm', { title: 'Định mức tồn kho', one: 'định mức', code: 'VPP04', icon: 'fa-gauge-high', disp: 't.item_code', r: STAFF, c: HC, d: HC, uniq: [['legal_id', 'item_code']], fields: [
  legal(), { k: 'period', l: 'Kỳ áp dụng', t: 'text', def: '2026' }, { k: 'from_on', l: 'Ngày hiệu lực', t: 'date', def: 'today' },
  { k: 'item_code', l: 'Mã VPP', t: 'text', req: 1, pick: 'vpp_item' }, { k: 'min_qty', l: 'Tồn tối thiểu', t: 'num', req: 1 },
], list: ['legal_id', 'item_code', 'min_qty', 'period', 'from_on'] });
def('vpp_req', { title: 'Phiếu đề xuất VPP', one: 'phiếu đề xuất', code: 'VPP01', icon: 'fa-file-circle-plus', disp: 't.code', self: 'emp_id', c: ALL, a: HC, flow, lock: ['cho_duyet', 'da_duyet', 'da_cap'], fields: [
  code('DXVPP-{Y}-'), legal(), emp('Người đề xuất', { def: 'me_emp' }), dept(), { k: 'req_on', l: 'Thời gian đề xuất', t: 'date', def: 'today', req: 1 }, vppLines([{ k: 'qty', l: 'Số lượng', w: 70, n: 1 }]),
  status([...DUYET, ['da_cap', 'Đã cấp phát', 'b']]),
], list: ['code', 'req_on', 'emp_id', 'dept_id', 'legal_id', 'status'], filters: ['legal_id', 'status'],
  acts: [{ k: 'cap_phat', l: 'Lập phiếu cấp phát', ico: 'fa-box-open', from: ['da_duyet'], roles: HC }] });
def('vpp_issue', { title: 'Phiếu cấp phát VPP', one: 'phiếu cấp phát', code: 'VPP02', icon: 'fa-box-open', disp: 't.code', r: [...STAFF, 'truong_bp'], c: HC, d: HC, fields: [
  code('CPVPP-{Y}-'), legal(), { k: 'req_id', l: 'Từ phiếu đề xuất', t: 'ref', ref: 'vpp_req' }, { k: 'issuer_id', l: 'Người cấp phát', t: 'ref', ref: 'employee', def: 'me_emp' }, emp('Người nhận'), dept(),
  { k: 'issue_on', l: 'Thời gian cấp phát', t: 'date', def: 'today', req: 1 }, vppLines([{ k: 'qty', l: 'SL đề nghị', w: 70, n: 1 }, { k: 'qty_out', l: 'SL thực cấp', w: 70, n: 1 }]),
], list: ['code', 'issue_on', 'emp_id', 'dept_id', 'legal_id'], filters: ['legal_id'] });
def('vpp_in', { title: 'Phiếu nhập kho VPP', one: 'phiếu nhập', code: 'VPP03', icon: 'fa-dolly', disp: 't.code', r: [...STAFF], c: HC, d: HC, fields: [
  code('NKVPP-{Y}-'), legal(), { k: 'supplier', l: 'Đơn vị cung cấp', t: 'text' }, { k: 'in_on', l: 'Ngày nhập', t: 'date', def: 'today', req: 1 }, vppLines([{ k: 'qty', l: 'SL nhập', w: 70, n: 1 }]),
], list: ['code', 'in_on', 'supplier', 'legal_id'], filters: ['legal_id'] });

// ===================== TÀI SẢN =====================
const ASSET_ST = [['dang_dung', 'Đang sử dụng', 'g'], ['trong_kho', 'Trong kho', 'b'], ['sua_chua', 'Đang sửa chữa', 'a'], ['cho_thanh_ly', 'Chờ thanh lý', 'v'], ['da_thanh_ly', 'Đã thanh lý', 's']];
def('asset', { title: 'Danh mục tài sản', one: 'tài sản', code: 'TS01', icon: 'fa-laptop', disp: "t.code||' · '||t.name", r: [...STAFF, 'truong_bp'], c: HC, d: HC, imp: 1, order: 't.code', fields: [
  { k: 'code', l: 'Mã TS', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên / nhóm TS', t: 'text', req: 1 }, { k: 'unit', l: 'Đơn vị tính', t: 'text', def: 'Cái' }, { k: 'model', l: 'Model / số seri', t: 'text' }, legal({ l: 'Pháp nhân sở hữu' }), dept({ l: 'Bộ phận sử dụng' }),
  { k: 'holder_id', l: 'Người giữ', t: 'ref', ref: 'employee' }, { k: 'in_on', l: 'Ngày ghi nhận', t: 'date' }, { k: 'warranty_to', l: 'Bảo hành đến', t: 'date' }, { k: 'location', l: 'Vị trí', t: 'text' },
  { k: 'status', l: 'Trạng thái', t: 'sel', o: ASSET_ST, def: 'trong_kho' }, { k: 'repair_due', l: 'Hạn hoàn trả sửa chữa', t: 'date' }, note(),
], list: ['code', 'name', 'legal_id', 'dept_id', 'holder_id', 'status'], filters: ['legal_id', 'status'] });
def('asset_in', { title: 'Phiếu nhập kho tài sản', one: 'phiếu nhập', code: 'TS03', icon: 'fa-warehouse', disp: 't.code', r: STAFF, c: HC, d: HC, fields: [
  code('NKTS-{Y}-'), legal(), { k: 'in_on', l: 'Ngày nhập kho', t: 'date', def: 'today', req: 1 },
  assetLines([{ k: 'model', l: 'Model / số seri', w: 120 }, { k: 'user', l: 'Người sử dụng', w: 120 }, { k: 'place', l: 'Vị trí đặt để', w: 110 }, { k: 'cond', l: 'Tình trạng', w: 90 }]),
], list: ['code', 'in_on', 'legal_id'], filters: ['legal_id'] });
def('asset_move', { title: 'Phiếu điều chuyển tài sản', one: 'phiếu điều chuyển', code: 'TS04', icon: 'fa-right-left', disp: 't.code', r: [...STAFF, 'truong_bp'], c: HC, a: TP, flow, lock: ['cho_duyet', 'da_duyet', 'da_nhan'], fields: [
  code('DCTS-{Y}-'), legal(), { k: 'made_on', l: 'Ngày lập', t: 'date', def: 'today' }, dept({ l: 'Bộ phận chuyển đi', req: 1 }), { k: 'to_dept_id', l: 'Bộ phận nhận', t: 'ref', ref: 'dept', req: 1 },
  { k: 'to_legal_id', l: 'Pháp nhân nhận (nếu liên pháp nhân)', t: 'ref', ref: 'legal' }, { k: 'from_emp_id', l: 'Người bàn giao', t: 'ref', ref: 'employee' }, { k: 'to_emp_id', l: 'Người tiếp nhận', t: 'ref', ref: 'employee', req: 1 },
  { k: 'move_on', l: 'Ngày điều chuyển dự kiến', t: 'date' }, { k: 'reason', l: 'Lý do điều chuyển', t: 'text' }, assetLines([{ k: 'cond', l: 'Tình trạng', w: 100 }]), status([...DUYET, ['da_nhan', 'Đã nhận', 'b']]),
], list: ['code', 'made_on', 'dept_id', 'to_dept_id', 'to_emp_id', 'status'], filters: ['legal_id', 'status'],
  acts: [{ k: 'da_nhan', l: 'Xác nhận đã nhận', ico: 'fa-check', from: ['da_duyet'], roles: HC }] });
def('asset_out', { title: 'Phiếu xuất kho tài sản (thanh lý / sửa chữa)', one: 'phiếu xuất', code: 'TS05', icon: 'fa-screwdriver-wrench', disp: 't.code', r: STAFF, c: HC, a: TP, flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  code('XKTS-{Y}-'), legal(), dept({ l: 'Bộ phận đề xuất' }), { k: 'made_on', l: 'Ngày lập', t: 'date', def: 'today' }, { k: 'store', l: 'Kho xuất', t: 'text' }, { k: 'receiver', l: 'Người nhận tài sản', t: 'text' }, { k: 'place', l: 'Địa điểm giao', t: 'text' },
  { k: 'purpose', l: 'Mục đích xuất', t: 'sel', req: 1, o: [['thanh_ly', 'Thanh lý'], ['sua_chua', 'Mang đi sửa chữa'], ['khac', 'Khác']] }, assetLines([{ k: 'cond', l: 'Tình trạng khi xuất', w: 110 }, { k: 'note', l: 'Nơi nhận / ghi chú', w: 120 }]),
  { k: 'basis', l: 'Căn cứ phê duyệt / chứng từ bàn giao', t: 'text' }, { k: 'due_on', l: 'Thời hạn hoàn trả (nếu sửa chữa)', t: 'date', show: { purpose: ['sua_chua'] } }, status(),
], list: ['code', 'made_on', 'purpose', 'receiver', 'status'], filters: ['legal_id', 'status'] });
def('asset_count', { title: 'Kiểm kê tài sản', one: 'đợt kiểm kê', code: 'TS02-KK', icon: 'fa-clipboard-check', disp: 't.code', r: STAFF, c: HC, d: HC, fields: [
  code('KK-{Y}-', 'Mã đợt'), legal(), { k: 'count_on', l: 'Ngày kiểm kê', t: 'date', def: 'today', req: 1 },
  { k: 'lines', l: 'Kết quả kiểm kê (kế thừa sổ quản lý tài sản)', t: 'json', ro: 1, grid: [{ k: 'code', l: 'Mã TS', w: 110 }, { k: 'name', l: 'Tên tài sản', w: 200 }, { k: 'holder', l: 'Người giữ', w: 140 }, { k: 'sys', l: 'Trạng thái sổ', w: 110 }, { k: 'found', l: 'Thực tế', w: 100, o: ['Có', 'Không thấy', 'Hỏng'] }, { k: 'note', l: 'Ghi chú', w: 130 }] }, note(),
], list: ['code', 'count_on', 'legal_id'] });

// ===================== XE CÔNG VỤ =====================
def('vehicle', { title: 'Danh sách xe', one: 'xe', code: 'XC01', icon: 'fa-car', disp: "t.code||' · '||t.plate", c: HC, d: HC, order: 't.code', fields: [
  { k: 'code', l: 'Mã xe', t: 'text', req: 1, uniq: 1 }, { k: 'plate', l: 'Biển số', t: 'text', req: 1 }, { k: 'brand', l: 'Hãng / loại', t: 'text' }, legal({ l: 'Chủ sở hữu' }), { k: 'inspect_to', l: 'Đăng kiểm đến', t: 'date' }, { k: 'insure_to', l: 'Bảo hiểm đến', t: 'date' },
  { k: 'service_to', l: 'Bảo dưỡng tiếp theo', t: 'date' }, { k: 'chassis', l: 'Số khung', t: 'text' }, { k: 'engine', l: 'Số máy', t: 'text' }, { k: 'owner_id', l: 'Người phụ trách', t: 'ref', ref: 'employee' }, { k: 'km', l: 'Km hiện tại', t: 'int', ro: 1 },
  { k: 'state', l: 'Tình trạng sử dụng', t: 'sel', o: [['san_sang', 'Sẵn sàng', 'g'], ['bao_duong', 'Đang bảo dưỡng', 'a'], ['ngung', 'Ngừng dùng', 's']], def: 'san_sang' },
], list: ['code', 'plate', 'brand', 'legal_id', 'inspect_to', 'insure_to', 'service_to', 'state'] });
const BOOK = [...DUYET, ['dang_di', 'Đang đi', 'b'], ['da_tra', 'Đã trả', 't'], ['huy', 'Hủy', 's']];
def('car_book', { title: 'Phiếu mượn xe', one: 'phiếu mượn xe', code: 'XC04', icon: 'fa-car-side', disp: 't.code', self: 'emp_id', c: ALL, a: HC, flow, lock: ['cho_duyet', 'da_duyet', 'dang_di', 'da_tra'], fields: [
  code('ĐKX/{Y}-'), { k: 'reg_on', l: 'Ngày đăng ký', t: 'date', def: 'today', req: 1 }, legal(), emp('Nhân viên đăng ký', { def: 'me_emp' }), dept(), { k: 'start_at', l: 'Thời gian khởi hành', t: 'dt', req: 1 }, { k: 'end_at', l: 'Thời gian kết thúc', t: 'dt', req: 1 },
  { k: 'riders', l: 'Danh sách đi xe', t: 'text' }, { k: 'route', l: 'Thông tin hành trình', t: 'long', req: 1 }, { k: 'reason', l: 'Lý do / ghi chú', t: 'text' }, { k: 'vehicle_id', l: 'Xe đăng ký', t: 'ref', ref: 'vehicle', req: 1 }, status(BOOK),
], list: ['code', 'start_at', 'end_at', 'emp_id', 'vehicle_id', 'route', 'status'], filters: ['legal_id', 'vehicle_id', 'status'],
  acts: [{ k: 'di_xe', l: 'Bàn giao xe', ico: 'fa-key', from: ['da_duyet'], roles: HC }, { k: 'huy', l: 'Hủy lịch', ico: 'fa-ban', from: ['nhap', 'da_duyet'], roles: ALL }] });
def('car_return', { title: 'Phiếu trả xe', one: 'phiếu trả xe', code: 'XC05', icon: 'fa-square-parking', disp: 't.code', c: HC, d: HC, r: [...STAFF, 'truong_bp'], fields: [
  code('TX/{Y}-'), { k: 'book_id', l: 'Phiếu mượn xe', t: 'ref', ref: 'car_book', req: 1 }, { k: 'got_at', l: 'Ngày/giờ nhận xe', t: 'dt', req: 1 }, { k: 'back_at', l: 'Ngày/giờ trả xe', t: 'dt', req: 1 }, { k: 'km_in', l: 'Km khi nhận', t: 'int', req: 1 }, { k: 'km_out', l: 'Km khi trả', t: 'int', req: 1 },
  { k: 'fuel_in', l: 'Mức nhiên liệu lúc nhận', t: 'text' }, { k: 'fuel_out', l: 'Mức nhiên liệu lúc trả', t: 'text' }, { k: 'cond_in', l: 'Tình trạng khi nhận', t: 'sel', o: [['tot', 'Bình thường', 'g'], ['hong', 'Có hư hỏng', 'r']], def: 'tot' }, { k: 'cond_out', l: 'Tình trạng khi trả', t: 'sel', o: [['tot', 'Bình thường', 'g'], ['hong', 'Có hư hỏng', 'r']], def: 'tot' },
  { k: 'damage', l: 'Hư hỏng / sự cố / vi phạm', t: 'long' }, money('cost', 'Chi phí phát sinh (đ)'), { k: 'cost_doc', l: 'Chứng từ chi phí', t: 'text' }, { k: 'papers_back', l: 'Phụ kiện, giấy tờ đã bàn giao lại', t: 'bool' },
], list: ['code', 'book_id', 'back_at', 'km_in', 'km_out', 'cost', 'cond_out'] });

// ===================== CHUYỂN PHÁT =====================
const MAIL = [['cho_gui', 'Chờ gửi', 's'], ['dang_chuyen', 'Đang vận chuyển', 'b'], ['da_giao', 'Đã giao', 'g'], ['that_lac', 'Thất lạc / giao trễ', 'r']];
def('mail', { title: 'Đề xuất gửi thư', one: 'phiếu gửi', code: 'GT01', icon: 'fa-envelope', disp: 't.code', self: 'emp_id', c: ALL, u: HC, d: HC, fields: [
  code('GT-{Y}-', 'Mã yêu cầu'), legal(), { k: 'send_on', l: 'Ngày gửi', t: 'date', def: 'today', req: 1 }, { k: 'content', l: 'Nội dung', t: 'text', req: 1 }, emp('Người gửi', { def: 'me_emp' }), dept({ l: 'Bộ phận' }), { k: 'to_name', l: 'Người nhận', t: 'text', req: 1 }, { k: 'to_addr', l: 'Địa chỉ nhận', t: 'text', req: 1 }, { k: 'to_phone', l: 'SĐT', t: 'text' },
  { k: 'carrier', l: 'Nhà vận chuyển', t: 'text', sug: ['Viettel Post', 'VNPost', 'Giao hàng nhanh', 'J&T'] }, { k: 'bill_no', l: 'Số bill', t: 'text' }, { k: 'status', l: 'Trạng thái', t: 'sel', o: MAIL, def: 'cho_gui' }, { k: 'done_on', l: 'Ngày giao', t: 'date' }, money('fee', 'Cước phí (đ)'),
], list: ['code', 'send_on', 'emp_id', 'to_name', 'bill_no', 'status', 'fee'], filters: ['legal_id', 'status'] });

// ===================== SUẤT ĂN =====================
def('meal_reg', { title: 'Đăng ký suất ăn tháng', one: 'đăng ký', code: 'SA01', icon: 'fa-utensils', disp: 't.month', self: 'emp_id', c: ALL, d: HC, uniq: [['emp_id', 'month']], fields: [
  legal(), emp('Họ tên', { def: 'me_emp' }), dept(), { k: 'month', l: 'Tháng / năm đăng ký', t: 'month', req: 1 }, { k: 'days', l: 'Ngày đăng ký', t: 'days' }, { k: 'n_days', l: 'Tổng số ngày đăng ký', t: 'int', ro: 1 },
], list: ['month', 'emp_id', 'dept_id', 'n_days'], filters: ['legal_id', 'month'] });
def('meal_day', { title: 'Suất ăn thực tế theo ngày', one: 'ngày', code: 'SA04-N', icon: 'fa-bowl-food', disp: 't.day', r: STAFF, c: HC, d: HC, uniq: [['legal_id', 'day']], order: 't.day DESC', fields: [
  legal(), { k: 'day', l: 'Ngày', t: 'date', req: 1, def: 'today' }, { k: 'actual', l: 'Suất thực phục vụ', t: 'int', req: 1 }, { k: 'charged', l: 'Suất tính phí', t: 'int' }, money('price', 'Đơn giá', { req: 1 }), note(),
], list: ['day', 'legal_id', 'actual', 'charged', 'price', 'note'], filters: ['legal_id'] });
def('meal_in', { title: 'Phiếu thu tiền ăn', one: 'phiếu thu', code: 'SA02', icon: 'fa-money-bill-wave', disp: 't.code', r: STAFF, c: HC, d: HC, fields: [
  code('PT-AN-{Y}-'), legal(), { k: 'month', l: 'Kỳ', t: 'month', req: 1 }, { k: 'name', l: 'Họ tên', t: 'text', req: 1, sugEmp: 1 }, { k: 'qty', l: 'Số suất', t: 'int', req: 1 }, money('amount', 'Số tiền', { req: 1 }), { k: 'got_on', l: 'Ngày nhận', t: 'date', def: 'today', req: 1 }, { k: 'doc', l: 'Chứng từ', t: 'text' },
], list: ['code', 'month', 'name', 'qty', 'amount', 'got_on'], filters: ['legal_id', 'month'] });
def('meal_out', { title: 'Phiếu chi bếp', one: 'phiếu chi', code: 'SA03', icon: 'fa-receipt', disp: 't.code', r: STAFF, c: HC, d: HC, fields: [
  code('PC-BEP-{Y}-'), legal(), { k: 'pay_on', l: 'Ngày chi', t: 'date', def: 'today', req: 1 }, { k: 'content', l: 'Nội dung chi', t: 'text', req: 1 }, { k: 'qty', l: 'Số lượng', t: 'num' }, money('price', 'Đơn giá'), money('amount', 'Thành tiền', { req: 1 }), { k: 'doc', l: 'Chứng từ', t: 'text' },
], list: ['code', 'pay_on', 'content', 'qty', 'price', 'amount', 'doc'], filters: ['legal_id'] });

// ===================== SỰ KIỆN =====================
def('event', { title: 'Phiếu tạo sự kiện', one: 'sự kiện', code: 'SK01', icon: 'fa-champagne-glasses', disp: "t.code||' · '||t.name", r: STAFF, c: HC, a: TP, flow, lock: ['cho_duyet'], files: [['ct', 'Chương trình'], ['dt', 'Dự toán'], ['ds', 'Danh sách khách']], fields: [
  code('SK-{Y}-', 'Mã sự kiện'), legal(), { k: 'name', l: 'Tên sự kiện/chủ đề', t: 'text', req: 1 }, { k: 'org', l: 'Đơn vị tổ chức', t: 'text' }, { k: 'host_id', l: 'Chủ trì', t: 'ref', ref: 'employee' }, { k: 'at', l: 'Ngày/giờ tổ chức', t: 'dt', req: 1 }, { k: 'place', l: 'Địa điểm', t: 'text' },
  { k: 'invited', l: 'Số lượng mời', t: 'int' }, { k: 'attended', l: 'Số lượng tham gia', t: 'int' }, money('budget', 'Ngân sách đề xuất'), { k: 'goal_ok', l: 'Đạt mục tiêu', t: 'bool' }, { k: 'review', l: 'Đánh giá / bài học rút ra', t: 'long' },
  { k: 'tasks', l: 'Kế hoạch đầu việc', t: 'json', grid: [{ k: 'task', l: 'Đầu việc', w: 200 }, { k: 'who', l: 'Người phụ trách', w: 130 }, { k: 'due', l: 'Hạn hoàn thành', w: 100 }, { k: 'result', l: 'Kết quả cần có', w: 150 }, { k: 'done', l: 'Xong', w: 70, o: ['Chưa', 'Xong'] }] }, status([...DUYET, ['dong', 'Đã đóng', 't']]),
], list: ['code', 'name', 'at', 'host_id', 'budget', 'status'], filters: ['legal_id', 'status'],
  acts: [{ k: 'dong', l: 'Đóng sự kiện', ico: 'fa-flag-checkered', from: ['da_duyet'], roles: TP }] });
def('event_cost', { title: 'Phiếu chi phí sự kiện', one: 'phiếu chi phí', code: 'Sk02', icon: 'fa-file-invoice-dollar', disp: 't.code', r: STAFF, c: HC, d: HC, fields: [
  code('CPSK-{Y}-'), { k: 'event_id', l: 'Mã / tên sự kiện', t: 'ref', ref: 'event', req: 1 }, { k: 'lines', l: 'Hạng mục chi', t: 'json', req: 1, grid: [{ k: 'item', l: 'Hạng mục chi', w: 220 }, { k: 'plan', l: 'Dự toán', w: 110, n: 1 }, { k: 'actual', l: 'Thực chi', w: 110, n: 1 }, { k: 'doc', l: 'Chứng từ', w: 130 }] }, { k: 'plan_total', l: 'Tổng dự toán', t: 'money', ro: 1 }, { k: 'actual_total', l: 'Tổng thực chi', t: 'money', ro: 1 },
], list: ['code', 'event_id', 'plan_total', 'actual_total'] });

// ===================== PHÒNG HỌP =====================
def('room', { title: 'Danh mục phòng họp', one: 'phòng họp', code: 'PH-DM', icon: 'fa-door-open', disp: "t.code||': '||t.name", c: HC, d: HC, order: 't.code', fields: [{ k: 'code', l: 'Mã phòng', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên phòng', t: 'text', req: 1 }, { k: 'place', l: 'Địa điểm', t: 'text' }, { k: 'seats', l: 'Sức chứa', t: 'int' }], list: ['code', 'name', 'place', 'seats'] });
def('room_book', { title: 'Đề nghị sử dụng phòng họp', one: 'đăng ký phòng', code: 'PH01', icon: 'fa-chalkboard-user', disp: 't.code', self: 'emp_id', c: ALL, a: HC, flow, lock: ['cho_duyet', 'da_duyet', 'hoan_thanh'], fields: [
  code('PH/{Y}-', 'Số'), { k: 'reg_on', l: 'Ngày đăng ký', t: 'date', def: 'today', req: 1 }, legal(), emp('Nhân viên đăng ký', { def: 'me_emp' }), { k: 'host', l: 'Người chủ trì', t: 'text' }, { k: 'start_at', l: 'Thời gian bắt đầu', t: 'dt', req: 1 }, { k: 'end_at', l: 'Thời gian kết thúc', t: 'dt', req: 1 }, { k: 'room_id', l: 'Phòng họp', t: 'ref', ref: 'room', req: 1 },
  { k: 'descr', l: 'Diễn giải', t: 'text' }, { k: 'service', l: 'Phục vụ hậu cần', t: 'text', help: 'Nước, máy chiếu, micro…' }, { k: 'real_end', l: 'Giờ kết thúc thực tế', t: 'dt' }, { k: 'clean_ok', l: 'Đã dọn dẹp, tắt thiết bị', t: 'bool' }, status([...DUYET, ['hoan_thanh', 'Đã đóng', 't'], ['huy', 'Hủy', 's']]),
], list: ['code', 'start_at', 'end_at', 'room_id', 'emp_id', 'descr', 'status'], filters: ['legal_id', 'room_id', 'status'],
  acts: [{ k: 'dong', l: 'Đóng lịch (đã họp xong)', ico: 'fa-flag-checkered', from: ['da_duyet'], roles: HC }, { k: 'huy', l: 'Hủy lịch', ico: 'fa-ban', from: ['nhap', 'da_duyet'], roles: ALL }], lockKeep: ['real_end', 'clean_ok', 'service'] });

// ===================== TUYỂN DỤNG =====================
def('rec_plan', { title: 'Kế hoạch tuyển dụng', one: 'vị trí tuyển', code: 'TD-01', icon: 'fa-bullhorn', disp: "t.code||' · '||t.position", r: STAFF, c: NS, a: ['tp_hcns', 'bgd'], flow, lock: ['cho_duyet', 'da_duyet'], lockKeep: ['rec_state'], fields: [
  code('TD-{Y}-', 'Mã kế hoạch'), legal(), dept({ req: 1 }), { k: 'period', l: 'Kỳ kế hoạch', t: 'text', def: '2026' }, { k: 'position', l: 'Vị trí / chức danh', t: 'text', req: 1 }, { k: 'qty', l: 'Số lượng', t: 'int', req: 1 }, { k: 'criteria', l: 'Tiêu chí tuyển dụng', t: 'long' }, { k: 'channel', l: 'Kênh tuyển dụng', t: 'text', sug: ['TopCV', 'Facebook', 'Giới thiệu nội bộ', 'Vietnamworks'] },
  { k: 'req_on', l: 'Ngày yêu cầu', t: 'date', def: 'today' }, { k: 'due_on', l: 'Thời hạn cần', t: 'date', req: 1 }, money('cost', 'Chi phí dự kiến'), { k: 'rec_state', l: 'Tiến độ', t: 'sel', o: [['chua_mo', 'Chưa mở', 's'], ['dang_tuyen', 'Đang tuyển', 'b'], ['da_tuyen', 'Đã tuyển', 'g'], ['hoan', 'Hoãn', 'a']], def: 'chua_mo' }, status(),
], list: ['code', 'position', 'legal_id', 'dept_id', 'qty', 'due_on', 'rec_state', 'status'], filters: ['legal_id', 'dept_id', 'status'] });
const CAND = [['S11', 'Hồ sơ không đạt', 's'], ['S12', 'Hồ sơ đạt, liên hệ phỏng vấn', 'b'], ['S21', 'Đã liên hệ, từ chối phỏng vấn', 's'], ['S24', 'Đã sơ tuyển không đạt', 's'], ['S33', 'Chờ phỏng vấn', 'a'], ['S34', 'Đã phỏng vấn', 'v'], ['S35', 'Đạt phỏng vấn', 'g'], ['S36', 'Đã thông báo kết quả', 't'], ['S52', 'Đã gửi thư mời', 'b'], ['S53', 'Đã xác nhận Offer', 'g'], ['S60', 'Đã nhận việc', 'g']];
def('candidate', { title: 'Phiếu hồ sơ ứng viên', one: 'ứng viên', code: 'TD02', icon: 'fa-user-plus', disp: "t.code||' · '||t.full_name", r: ['cv_hcns', 'tp_hcns'], c: NS, d: TP, files: [['cv', 'Hồ sơ đính kèm']], fields: [
  { k: 'code', l: 'Mã', t: 'code', prefix: 'UV', pad: 3, ro: 1 }, { k: 'full_name', l: 'Họ tên', t: 'text', req: 1 }, { k: 'id_no', l: 'Số CMT/CCCD', t: 'text', pii: 1 }, { k: 'dob', l: 'Ngày sinh', t: 'date', pii: 1 }, { k: 'gender', l: 'Giới tính', t: 'sel', o: [['Nam', 'Nam'], ['Nữ', 'Nữ']] }, { k: 'phone', l: 'Số điện thoại', t: 'text', pii: 1 }, { k: 'email', l: 'Email', t: 'text', pii: 1 }, { k: 'address', l: 'Địa chỉ', t: 'text', pii: 1 },
  { k: 'edu', l: 'Trình độ văn hóa', t: 'text' }, { k: 'degree', l: 'Trình độ CM', t: 'text' }, { k: 'skill', l: 'Bậc trình độ nghề', t: 'text' }, { k: 'school', l: 'Đơn vị đào tạo', t: 'text' }, { k: 'major', l: 'Ngành đào tạo', t: 'text' }, { k: 'source', l: 'Nguồn tuyển dụng', t: 'text', req: 1, sug: ['TopCV', 'Facebook', 'Giới thiệu nội bộ', 'Vietnamworks'] }, legal({ l: 'Đơn vị tuyển dụng' }), { k: 'referrer', l: 'Người giới thiệu', t: 'text' }, { k: 'exp', l: 'Kinh nghiệm', t: 'long' }, note(),
  { k: 'status', l: 'Trạng thái', t: 'sel', o: CAND, def: 'S12' }, { k: 'got_on', l: 'Ngày nhận hồ sơ', t: 'date', def: 'today' }, { k: 'position', l: 'Vị trí', t: 'text', req: 1 }, dept({ l: 'Bộ phận', req: 1 }), { k: 'plan_id', l: 'Kế hoạch', t: 'ref', ref: 'rec_plan' }, { k: 'start_on', l: 'Ngày nhận việc', t: 'date' },
], list: ['code', 'full_name', 'position', 'dept_id', 'source', 'got_on', 'status'], filters: ['legal_id', 'status'] });
def('interview', { title: 'Lịch phỏng vấn', one: 'lịch phỏng vấn', code: 'TD03', icon: 'fa-comments', disp: 't.code', r: ['cv_hcns', 'tp_hcns', 'bgd', 'truong_bp'], c: NS, a: TP, flow, lock: ['cho_duyet'], fields: [
  { k: 'code', l: 'Lịch số', t: 'code', prefix: 'PV{Y}-', ro: 1 }, { k: 'day', l: 'Ngày', t: 'date', def: 'today', req: 1 }, legal(), { k: 'round', l: 'Vòng tuyển dụng', t: 'sel', o: [['vong_pv', 'Vòng phỏng vấn'], ['vong_thi', 'Vòng thi tuyển']], def: 'vong_pv' }, { k: 'mode', l: 'Hình thức', t: 'sel', o: [['truc_tiep', '1. Trực tiếp'], ['online', '2. Trực tuyến']], def: 'truc_tiep' }, { k: 'room_id', l: 'Phòng họp', t: 'ref', ref: 'room' }, { k: 'place', l: 'Địa điểm', t: 'text' },
  { k: 'start_at', l: 'Thời gian bắt đầu', t: 'dt', req: 1 }, { k: 'minutes', l: 'Thời lượng (phút)', t: 'int', def: 90 }, { k: 'note', l: 'Ghi chú khác', t: 'text' }, { k: 'cand_note', l: 'Lưu ý cho ứng viên', t: 'text' },
  { k: 'lines', l: 'Danh sách ứng viên', t: 'json', grid: [{ k: 'code', l: 'Mã hồ sơ', pick: 'candidate', fill: { name: 'full_name' }, w: 110 }, { k: 'name', l: 'Tên ứng viên', w: 190 }, { k: 'start', l: 'Giờ bắt đầu', w: 90 }, { k: 'end', l: 'Giờ kết thúc', w: 90 }, { k: 'result', l: 'Kết quả', w: 90, o: ['Đạt', 'Không đạt', 'Vắng'] }] },
  { k: 'board', l: 'Hội đồng tuyển dụng', t: 'text' }, status(),
], list: ['code', 'day', 'round', 'mode', 'room_id', 'start_at', 'status'], filters: ['legal_id', 'status'] });

// ===================== HỢP ĐỒNG =====================
const CTK = [['HD01', 'HD01 · Hợp đồng thử việc', 'b'], ['HD02', 'HD02 · HĐLĐ xác định thời hạn', 'g'], ['HD03', 'HD03 · HĐLĐ không xác định thời hạn', 't'], ['HD04', 'HD04 · Phụ lục hợp đồng', 'v']];
def('contract', { title: 'Hợp đồng lao động', one: 'hợp đồng', code: 'HD01–04', icon: 'fa-file-signature', disp: "t.no", self: 'emp_id', r: ALL, c: NS, a: TP, d: TP, order: 't.from_on DESC NULLS LAST', files: [['hd', 'Bản ký']], fields: [
  emp('Người lao động'), legal({ l: 'Pháp nhân ký HĐ' }), { k: 'kind', l: 'Loại hợp đồng', t: 'sel', o: CTK, req: 1 }, { k: 'no', l: 'Số HĐ / phụ lục', t: 'text', req: 1 }, { k: 'sign_on', l: 'Ngày ký', t: 'date' }, { k: 'from_on', l: 'Ngày hiệu lực', t: 'date', req: 1 }, { k: 'to_on', l: 'Ngày hết hạn', t: 'date', help: 'Trống với HĐ không xác định thời hạn' }, { k: 'title', l: 'Chức danh trên HĐ', t: 'text' },
  money('salary', 'Lương ghi trên HĐ (đ/tháng)', { pii: 'pay' }), { k: 'trial_pct', l: '% lương thử việc', t: 'num', show: { kind: ['HD01'] } }, { k: 'state', l: 'Tình trạng', t: 'sel', o: [['hieu_luc', 'Đang hiệu lực', 'g'], ['thay_the', 'Đã thay thế', 's'], ['cham_dut', 'Đã chấm dứt', 's'], ['cho_quyet_dinh', 'Hết hạn – chờ quyết định', 'a']], def: 'hieu_luc' }, note(),
], list: ['no', 'emp_id', 'legal_id', 'kind', 'from_on', 'to_on', 'state'], filters: ['legal_id', 'kind', 'state'] });
const DEC = [['HD05', 'HD05 · QĐ điều chuyển nhân sự'], ['HD06', 'HD06 · QĐ bổ nhiệm nhân sự'], ['HD07', 'HD07 · QĐ miễn nhiệm nhân sự'], ['HD08', 'HD08 · QĐ điều chỉnh lương'], ['HD10', 'HD10 · QĐ chấm dứt HĐLĐ'], ['HD11', 'HD11 · QĐ chấm dứt HĐ thử việc']];
def('decision', { title: 'Quyết định nhân sự', one: 'quyết định', code: 'HD05–11', icon: 'fa-gavel', disp: 't.no', self: 'emp_id', r: ALL, c: NS, a: ['tp_hcns', 'bgd'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  emp('Người lao động'), { k: 'kind', l: 'Loại quyết định', t: 'sel', o: DEC, req: 1 }, { k: 'no', l: 'Số QĐ', t: 'text', req: 1 }, { k: 'from_on', l: 'Ngày hiệu lực', t: 'date', req: 1 }, legal({ l: 'Pháp nhân (mới)', req: 0 }), dept({ l: 'Phòng ban (mới)' }), { k: 'title', l: 'Chức danh (mới)', t: 'text' }, money('new_p1', 'Lương P1 mới', { pii: 'pay', show: { kind: ['HD08'] } }), money('new_p2', 'Lương P2 mới', { pii: 'pay', show: { kind: ['HD08'] } }), money('new_ins', 'Mức đóng BHXH mới', { pii: 'pay', show: { kind: ['HD08'] } }), { k: 'reason', l: 'Lý do / căn cứ', t: 'long' }, status(),
], list: ['no', 'emp_id', 'kind', 'from_on', 'status'], filters: ['kind', 'status'] });
def('resign', { title: 'Đơn xin nghỉ việc', one: 'đơn nghỉ việc', code: 'HD09', icon: 'fa-person-walking-arrow-right', disp: 't.code', self: 'emp_id', c: ALL, a: [...TP, 'truong_bp'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  code('NV-{Y}-', 'Số đơn'), emp('Người lao động', { def: 'me_emp' }), { k: 'made_on', l: 'Ngày làm đơn', t: 'date', def: 'today' }, { k: 'last_day', l: 'Ngày làm việc cuối', t: 'date', req: 1 }, { k: 'reason', l: 'Lý do', t: 'long', req: 1 }, status(),
], list: ['code', 'emp_id', 'made_on', 'last_day', 'status'], filters: ['status'] });

// ===================== CHẤM CÔNG =====================
def('site', { title: 'Tọa độ chấm công', one: 'điểm làm việc', code: 'CC01', icon: 'fa-location-dot', disp: 't.name', c: NS, d: NS, fields: [{ k: 'name', l: 'Tên điểm', t: 'text', req: 1 }, { k: 'kind', l: 'Loại', t: 'text' }, { k: 'lat', l: 'Vĩ độ', t: 'num', req: 1 }, { k: 'lng', l: 'Kinh độ', t: 'num', req: 1 }, { k: 'radius', l: 'Bán kính (m)', t: 'int', req: 1 }, { k: 'state', l: 'Trạng thái', t: 'sel', o: [['on', 'Hoạt động', 'g'], ['off', 'Ngừng', 's']], def: 'on' }], list: ['name', 'kind', 'lat', 'lng', 'radius', 'state'] });
def('shift', { title: 'Phân ca làm việc', one: 'ca', code: 'CC02', icon: 'fa-clock', disp: "t.code||' · '||t.name", c: NS, d: NS, fields: [{ k: 'code', l: 'Mã', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên ca', t: 'text', req: 1 }, { k: 'kind', l: 'Loại', t: 'text', def: 'Có giờ' }, { k: 'from_t', l: 'Giờ vào', t: 'text', req: 1 }, { k: 'to_t', l: 'Giờ ra', t: 'text', req: 1 }, { k: 'break_t', l: 'Nghỉ', t: 'text' }, { k: 'hours', l: 'Giờ công', t: 'num' }, { k: 'applies', l: 'Áp dụng', t: 'text' }, { k: 'state', l: 'Trạng thái', t: 'sel', o: [['on', 'Đang dùng', 'g'], ['off', 'Ngừng', 's']], def: 'on' }], list: ['code', 'name', 'kind', 'from_t', 'to_t', 'break_t', 'hours', 'applies', 'state'] });
def('att_type', { title: 'Danh mục lý do nghỉ phép / ký hiệu công', one: 'ký hiệu', code: 'CC06', icon: 'fa-list-check', disp: "t.code||' · '||t.name", c: NS, d: NS, order: 't.grp, t.id', fields: [{ k: 'code', l: 'Mã', t: 'text', req: 1, uniq: 1 }, { k: 'name', l: 'Tên', t: 'text', req: 1 }, { k: 'days', l: 'Số ngày công', t: 'num' }, { k: 'hours', l: 'Số giờ công', t: 'num' }, { k: 'grp', l: 'Loại chấm công', t: 'text' }, { k: 'unpaid', l: 'Nghỉ không lương', t: 'bool' }], list: ['code', 'name', 'days', 'hours', 'grp', 'unpaid'] });
def('holiday', { title: 'Danh mục ngày lễ tết', one: 'ngày lễ', code: 'CC07', icon: 'fa-calendar-day', disp: 't.name', c: NS, d: NS, order: 't.day', fields: [{ k: 'day', l: 'Ngày', t: 'date', req: 1, uniq: 1 }, { k: 'name', l: 'Tên', t: 'text', req: 1 }, { k: 'applies', l: 'Áp dụng cho', t: 'text', def: 'Mọi pháp nhân' }], list: ['day', 'name', 'applies'] });
def('explain', { title: 'Phiếu giải trình công', one: 'phiếu giải trình', code: 'CC03', icon: 'fa-comment-dots', disp: 't.code', self: 'emp_id', c: ALL, a: ['truong_bp', 'cv_hcns', 'tp_hcns'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  code('GT-CONG-{Y}-'), emp('Họ tên / mã NV', { def: 'me_emp' }), { k: 'day', l: 'Ngày cần giải trình', t: 'date', req: 1 }, { k: 'kind', l: 'Lỗi', t: 'sel', req: 1, o: [['quen_vao', 'Quên check-in'], ['quen_ra', 'Quên check-out'], ['sai_diem', 'Sai địa điểm'], ['loi_ht', 'Lỗi hệ thống'], ['khac', 'Khác']] }, { k: 'right_time', l: 'Thời gian đúng đề nghị', t: 'text', help: '08:00 hoặc 17:30' }, { k: 'reason', l: 'Lý do giải trình', t: 'long', req: 1 }, { k: 'proof', l: 'Minh chứng kèm theo', t: 'text' }, status(),
], list: ['code', 'emp_id', 'day', 'kind', 'status'], filters: ['status'] });
def('leave', { title: 'Đơn xin nghỉ phép', one: 'đơn nghỉ', code: 'CC04', icon: 'fa-umbrella-beach', disp: 't.code', self: 'emp_id', c: ALL, a: ['truong_bp', 'tp_hcns'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [
  code('NP-{Y}-'), emp('Người xin nghỉ', { def: 'me_emp' }), { k: 'type_code', l: 'Loại nghỉ', t: 'text', req: 1, pick: 'att_type', def: 'P' }, { k: 'from_on', l: 'Từ ngày', t: 'date', req: 1 }, { k: 'to_on', l: 'Đến ngày', t: 'date', req: 1 }, { k: 'days', l: 'Số ngày nghỉ', t: 'num', req: 1 }, { k: 'reason', l: 'Lý do', t: 'long' }, { k: 'cover_id', l: 'Người làm thay', t: 'ref', ref: 'employee' }, status(),
], list: ['code', 'emp_id', 'type_code', 'from_on', 'to_on', 'days', 'status'], filters: ['status'] });
def('leave_bal', { title: 'Số ngày phép tồn', one: 'dòng phép', code: 'CC05', icon: 'fa-calendar-check', disp: 't.year::text', self: 'emp_id', c: NS, d: NS, uniq: [['emp_id', 'year']], fields: [emp('Nhân viên'), { k: 'year', l: 'Năm', t: 'int', req: 1, def: 2026 }, { k: 'opening', l: 'Đầu kỳ', t: 'num', def: 0 }, { k: 'earned', l: 'Phát sinh', t: 'num', def: 0 }, { k: 'adjust', l: 'Điều chỉnh', t: 'num', def: 0 }], list: ['emp_id', 'year', 'opening', 'earned', 'used', 'adjust', 'closing'], filters: ['year'] });
def('trip', { title: 'Đơn công tác', one: 'đơn công tác', code: 'CC08', icon: 'fa-plane-departure', disp: 't.code', self: 'emp_id', c: ALL, a: ['truong_bp', 'tp_hcns'], flow, lock: ['cho_duyet', 'da_duyet'], fields: [code('CT-{Y}-'), { k: 'made_on', l: 'Ngày lập', t: 'date', def: 'today' }, emp('Người lập', { def: 'me_emp' }), { k: 'descr', l: 'Diễn giải', t: 'text', req: 1 }, { k: 'from_on', l: 'Từ ngày', t: 'date', req: 1 }, { k: 'to_on', l: 'Đến ngày', t: 'date', req: 1 }, status()], list: ['code', 'emp_id', 'descr', 'from_on', 'to_on', 'status'], filters: ['status'] });
def('ot', { title: 'Đơn xin tăng ca', one: 'đề nghị tăng ca', code: 'CC09', icon: 'fa-business-time', disp: 't.code', self: 'emp_id', c: ALL, u: ALL, a: ['truong_bp', 'tp_hcns'], flow, lock: ['cho_duyet'], lockKeep: [], fields: [
  code('TC-{Y}-'), emp('Nhân viên', { def: 'me_emp' }), { k: 'day', l: 'Ngày tăng ca', t: 'date', req: 1 }, { k: 'from_t', l: 'Từ giờ', t: 'text', req: 1, def: '17:30' }, { k: 'to_t', l: 'Đến giờ', t: 'text', req: 1, def: '19:30' }, { k: 'day_kind', l: 'Loại ngày', t: 'sel', o: [['thuong', 'Ngày thường'], ['nghi', 'Ngày nghỉ'], ['le', 'Lễ/tết']], def: 'thuong' }, { k: 'task', l: 'Công việc', t: 'long', req: 1 }, { k: 'hours_reg', l: 'Giờ đăng ký', t: 'num', ro: 1 }, { k: 'hours_real', l: 'Giờ thực tế', t: 'num' }, { k: 'hours_ok', l: 'Giờ được duyệt', t: 'num' }, status(),
], list: ['code', 'emp_id', 'day', 'from_t', 'to_t', 'day_kind', 'hours_reg', 'hours_ok', 'status'], filters: ['status'] });
def('att_add', { title: 'Chấm công bổ sung', one: 'chấm bù', code: 'CC10', icon: 'fa-fingerprint', disp: 't.code', self: 'emp_id', r: [...STAFF, 'truong_bp', 'nld'], c: NS, a: TP, flow, lock: ['cho_duyet', 'da_duyet'], fields: [code('CB-{Y}-'), emp('Nhân sự'), { k: 'day', l: 'Ngày', t: 'date', def: 'today', req: 1 }, { k: 'dir', l: 'Chấm bù', t: 'sel', o: [['vao', 'Vào'], ['ra', 'Ra']], req: 1, def: 'ra' }, { k: 'time', l: 'Giờ', t: 'text', req: 1 }, { k: 'next_day', l: 'Ra sáng hôm sau (ca đêm)', t: 'bool' }, { k: 'reason', l: 'Lý do chấm bù', t: 'long', req: 1 }, status()], list: ['code', 'emp_id', 'day', 'dir', 'time', 'status'], filters: ['status'] });
def('att_auto', { title: 'Chấm công tự động', one: 'lần công tự động', code: 'CC11', icon: 'fa-wand-magic-sparkles', disp: 't.month', r: STAFF, c: NS, d: NS, fields: [legal(), { k: 'month', l: 'Kỳ công', t: 'month', req: 1 }, { k: 'emps', l: 'Người được ghi đủ công', t: 'json', req: 1, grid: [{ k: 'code', l: 'Mã NV', pick: 'employee', fill: { name: 'full_name' }, w: 120 }, { k: 'name', l: 'Họ tên', w: 220 }] }, { k: 'n_days', l: 'Số ngày đã ghi', t: 'int', ro: 1 }], list: ['month', 'legal_id', 'n_days'], help: 'Người được chọn có đủ công mọi ngày làm việc trong tháng (trừ Chủ nhật, ngày lễ). Ngày có chấm công máy vẫn tính theo máy.' });
def('attendance', { title: 'Dữ liệu chấm công', one: 'ô công', code: 'TL01', icon: 'fa-table-cells', disp: 't.day::text', self: 'emp_id', c: NS, d: NS, hidden: 1, uniq: [['emp_id', 'day']], order: 't.day DESC', fields: [emp(), { k: 'day', l: 'Ngày', t: 'date', req: 1 }, { k: 'mark', l: 'Ký hiệu', t: 'text', req: 1 }, { k: 'in_t', l: 'Vào', t: 'text' }, { k: 'out_t', l: 'Ra', t: 'text' }, { k: 'source', l: 'Nguồn', t: 'text' }], list: ['emp_id', 'day', 'mark', 'in_t', 'out_t', 'source'] });
def('att_period', { title: 'Khóa kỳ công', one: 'kỳ công', code: 'CC12-K', icon: 'fa-lock', disp: 't.month', r: STAFF, c: NS, uniq: [['legal_id', 'month']], order: 't.month DESC', fields: [legal(), { k: 'month', l: 'Kỳ công', t: 'month', req: 1 }, { k: 'status', l: 'Tình trạng', t: 'sel', o: [['mo', 'Đang mở', 'a'], ['khoa', 'Đã khóa', 'g']], ro: 1, def: 'mo' }, { k: 'locked_at', l: 'Thời điểm khóa', t: 'dt', ro: 1 }], list: ['month', 'legal_id', 'status', 'locked_at'], filters: ['legal_id'],
  acts: [{ k: 'khoa', l: 'Khóa kỳ công', ico: 'fa-lock', from: ['mo'], roles: TP }, { k: 'mo', l: 'Mở lại', ico: 'fa-unlock', from: ['khoa'], roles: TP }] });

// ===================== LƯƠNG – BẢO HIỂM – CÔNG ĐOÀN =====================
const SHEET = [...DUYET, ['da_chuyen', 'Đã chuyển / đã nộp', 't']];
const sheetActs = l => [{ k: 'tao_lai', l: 'Tính lại từ dữ liệu', ico: 'fa-rotate', from: ['nhap', 'tu_choi'], roles: NS }, { k: 'chot', l, ico: 'fa-money-check-dollar', from: ['da_duyet'], roles: [...NS, 'ke_toan'] }];
def('payroll', { title: 'Bảng lương tháng', one: 'bảng lương', code: 'TL02', icon: 'fa-money-bills', disp: "t.month", r: PAY_ROLES, c: NS, a: ['bgd', 'tp_hcns'], flow, lock: ['cho_duyet', 'da_duyet', 'da_chuyen'], uniq: [['legal_id', 'month']], order: 't.month DESC', sheet: 1, fields: [legal(), { k: 'month', l: 'Kỳ lương', t: 'month', req: 1 }, { k: 'std_days', l: 'Công chuẩn', t: 'num', def: 26 }, { k: 'n_emp', l: 'Số người', t: 'int', ro: 1 }, money('net_total', 'Tổng thực lĩnh', { ro: 1 }), { k: 'lines', l: 'Dòng lương', t: 'json', ro: 1, hide: 1 }, status(SHEET)], list: ['month', 'legal_id', 'n_emp', 'net_total', 'status'], filters: ['legal_id', 'status'], acts: sheetActs('Xác nhận đã chuyển tiền') });
def('ins_sheet', { title: 'Bảng trích nộp bảo hiểm', one: 'bảng bảo hiểm', code: 'BH-01', icon: 'fa-shield-heart', disp: 't.month', r: ['cv_hcns', 'tp_hcns', 'ke_toan'], c: NS, a: ['tp_hcns', 'bgd'], flow, lock: ['cho_duyet', 'da_duyet', 'da_chuyen'], lockKeep: ['paid', 'paid_doc'], uniq: [['legal_id', 'month']], order: 't.month DESC', sheet: 1, fields: [legal(), { k: 'month', l: 'Kỳ BH', t: 'month', req: 1 }, { k: 'n_emp', l: 'Số NLĐ', t: 'int', ro: 1 }, money('base_total', 'Quỹ đóng BH', { ro: 1 }), money('due', 'Tổng phải nộp', { ro: 1 }), money('paid', 'Đã nộp'), { k: 'paid_doc', l: 'Chứng từ', t: 'text' }, { k: 'rates', l: 'Tỷ lệ áp dụng', t: 'json', ro: 1, hide: 1 }, { k: 'lines', l: 'Dòng', t: 'json', ro: 1, hide: 1 }, status(SHEET)], list: ['month', 'legal_id', 'n_emp', 'base_total', 'due', 'paid', 'status'], filters: ['legal_id', 'status'], acts: sheetActs('Xác nhận đã nộp') });
def('cd_sheet', { title: 'Bảng trích nộp công đoàn', one: 'bảng công đoàn', code: 'CĐ-01', icon: 'fa-handshake', disp: 't.month', r: ['cv_hcns', 'tp_hcns', 'ke_toan'], c: NS, a: ['tp_hcns', 'bgd'], flow, lock: ['cho_duyet', 'da_duyet', 'da_chuyen'], lockKeep: ['paid', 'used'], uniq: [['legal_id', 'month']], order: 't.month DESC', sheet: 1, fields: [legal(), { k: 'month', l: 'Tháng', t: 'month', req: 1 }, { k: 'n_emp', l: 'Số NLĐ', t: 'int', ro: 1 }, money('base_total', 'Căn cứ tính', { ro: 1 }), money('due', 'Tổng nộp cấp trên', { ro: 1 }), money('kept', 'Được để lại', { ro: 1 }), money('paid', 'Đã nộp'), money('used', 'Đã sử dụng'), { k: 'rates', l: 'Tỷ lệ áp dụng', t: 'json', ro: 1, hide: 1 }, { k: 'lines', l: 'Dòng', t: 'json', ro: 1, hide: 1 }, status(SHEET)], list: ['month', 'legal_id', 'n_emp', 'base_total', 'due', 'kept', 'paid', 'status'], filters: ['legal_id', 'status'], acts: sheetActs('Xác nhận đã nộp') });
def('gov_report', { title: 'Báo cáo lao động định kỳ', one: 'báo cáo', code: 'BC-6T', icon: 'fa-building-columns', disp: 't.period', r: STAFF, c: NS, d: NS, order: 't.due_on DESC', files: [['bc', 'Bản đã nộp']], fields: [legal(), { k: 'kind', l: 'Loại báo cáo', t: 'sel', req: 1, o: [['pli', 'Mẫu 01/PLI — tình hình sử dụng lao động'], ['atvsld', 'Báo cáo công tác ATVSLĐ'], ['yte', 'Báo cáo y tế lao động'], ['tnld', 'Báo cáo tai nạn lao động']] }, { k: 'period', l: 'Kỳ báo cáo', t: 'text', req: 1, help: '6 tháng đầu năm 2026' }, { k: 'due_on', l: 'Hạn nộp', t: 'date', req: 1 }, { k: 'to_org', l: 'Nơi nhận', t: 'text', sug: ['Sở Nội vụ tỉnh Bắc Ninh', 'Trung tâm Y tế tỉnh Bắc Ninh', 'BHXH tỉnh Bắc Ninh'] }, { k: 'status', l: 'Trạng thái', t: 'sel', o: [['chua', 'Chưa nộp', 'a'], ['da_nop', 'Đã nộp', 'g']], def: 'chua' }, { k: 'sent_on', l: 'Ngày nộp', t: 'date' }, note()], list: ['kind', 'legal_id', 'period', 'due_on', 'status', 'sent_on'], filters: ['legal_id', 'status'] });

// ===================== MENU =====================
// [nhóm, [[chức năng, icon, [mục...]]]]; mục: 'e:ent' | 'r:MÃ' | 'v:màn' ; 'e:ent' đọc nhãn + mã từ định nghĩa
const MENU = [
  ['TỔNG QUAN', [['Tổng quan', 'fa-gauge-high', 'd:DB01'], ['Việc chờ tôi duyệt', 'fa-inbox', 'v:inbox'], ['Cảnh báo & việc cần xử lý', 'fa-bell', 'd:DB06']]],
  ['DASHBOARD', [['Nhân sự – cơ cấu – định biên', 'fa-users', 'd:DB02'], ['Tuyển dụng – hợp đồng', 'fa-user-check', 'd:DB03'], ['Công – lương – BH – CĐ', 'fa-coins', 'd:DB04'], ['Hành chính – tài sản – dịch vụ', 'fa-building', 'd:DB05']]],
  ['HÀNH CHÍNH', [
    ['Văn phòng phẩm', 'fa-pen-ruler', ['e:vpp_req', 'e:vpp_issue', 'e:vpp_in', 'e:vpp_norm', 'e:vpp_item', 'r:VPP06']],
    ['Quản lý tài sản', 'fa-laptop', ['e:asset', 'e:asset_in', 'e:asset_move', 'e:asset_out', 'e:asset_count', 'r:TS02']],
    ['Quản lý xe công vụ', 'fa-car', ['e:vehicle', 'r:XC02', 'r:XC03']],
    ['Chuyển phát nhanh', 'fa-envelope', ['e:mail', 'r:GT02']],
    ['Quản lý suất ăn', 'fa-utensils', ['e:meal_reg', 'e:meal_day', 'e:meal_in', 'e:meal_out', 'r:SA04', 'r:SA05']],
    ['Tổ chức sự kiện', 'fa-champagne-glasses', ['e:event', 'e:event_cost', 'r:SK03']],
    ['Dịch vụ công', 'fa-bell-concierge', ['e:room_book', 'e:room', 'r:PH02', 'e:car_book', 'e:car_return', 'r:XC06']],
  ]],
  ['NHÂN SỰ', [
    ['Tuyển dụng', 'fa-user-plus', ['e:rec_plan', 'e:candidate', 'e:interview', 'r:TD04']],
    ['Hồ sơ nhân sự', 'fa-user-tie', ['e:employee', 'r:HS02']],
    ['Hợp đồng lao động', 'fa-file-signature', ['e:contract', 'e:decision', 'e:resign', 'r:HD12', 'r:HD13']],
    ['Chấm công', 'fa-fingerprint', ['v:timesheet', 'e:explain', 'e:leave', 'e:leave_bal', 'e:trip', 'e:ot', 'e:att_add', 'e:att_auto', 'e:att_period', 'e:site', 'e:shift', 'e:att_type', 'e:holiday', 'r:CC12', 'r:CC13']],
    ['Tính lương', 'fa-money-bills', ['e:payroll', 'r:TL05']],
    ['Bảo hiểm', 'fa-shield-heart', ['e:ins_sheet', 'r:BH-02']],
    ['Công đoàn', 'fa-handshake', ['e:cd_sheet', 'r:CĐ-02']],
    ['Cơ cấu tổ chức', 'fa-sitemap', ['e:legal', 'e:dept', 'e:position', 'v:org', 'e:headcount', 'r:CCTC05']],
    ['Báo cáo lao động', 'fa-building-columns', ['e:gov_report', 'r:PLI']],
  ]],
  ['HỆ THỐNG', [['Chất lượng dữ liệu', 'fa-database', 'v:data'], ['Cấu hình tỷ lệ', 'fa-sliders', 'v:settings'], ['Nhật ký thao tác', 'fa-clock-rotate-left', 'v:audit']]],
];
// tỷ lệ do HCNS cấu hình (không mặc định theo pháp luật chưa xác minh) — giá trị khởi tạo lấy từ file trích nộp & bảng lương mẫu
const SETTINGS = {
  ins: { dn_bhxh: 17.5, dn_bhyt: 3, dn_bhtn: 1, nld_bhxh: 8, nld_bhyt: 1.5, nld_bhtn: 1 },
  cd: { kpcd: 2, dpcd: 0.5, kpcd_nop: 25, kpcd_giu: 75, dpcd_nop: 30, dpcd_giu: 70 },
  pay: { std_days: 26, trial_pct: 85, meal_day: 25000, ded_self: 15500000, ded_dep: 6200000, tax: [[10000000, 5], [30000000, 10], [60000000, 20], [100000000, 30], [null, 35]] },
  alert: { contract: [30, 15, 7], vehicle: [30, 7, 0] },
};
const VIRT = { used: 'Đã nghỉ', closing: 'Cuối kỳ' };

module.exports = { ROLES, ALL, NS, HC, TP, STAFF, PII_ROLES, PAY_ROLES, E, MENU, SETTINGS, VIRT, CAND, ASSET_ST, DOCS, MAIL };

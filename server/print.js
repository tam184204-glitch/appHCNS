// Bản in: biểu mẫu chung theo meta, phiếu lương TL03, chuyển khoản TL04, báo cáo. fmt=doc → mở bằng Word.
const C = require('./core');
const { E } = require('./meta');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fm = v => v == null || v === '' ? '' : Math.round(+v).toLocaleString('vi-VN');
const CSS = `<style>@page{size:A4;margin:20mm 15mm 20mm 25mm}body{font:13pt 'Times New Roman',serif;color:#000;line-height:1.4}h1{font-size:15pt;text-align:center;margin:12px 0 4px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #000;padding:4px 6px;font-size:11.5pt;vertical-align:top}th{background:#eee}table.nb td{border:0;padding:2px 4px}.r{text-align:right}.c{text-align:center}.sign{display:flex;justify-content:space-around;margin-top:24px;text-align:center}.sign div{min-height:90px}.top{display:flex;justify-content:space-between;font-size:11pt}@media print{.np{display:none}}.np{position:fixed;top:8px;right:8px;font:14px sans-serif;padding:6px 12px}</style>`;
const page = (title, body) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>${CSS}</head><body><button class="np" onclick="print()">In / Lưu PDF</button>${body}</body></html>`;
const val = async (f, r) => {
  const v = r[f.k]; if (v == null || v === '') return '';
  if (f.t === 'ref') return r[f.k + '__l'] ?? '';
  if (f.t === 'date') return C.dmy(v);
  if (f.t === 'dt') { const d = new Date(new Date(v).getTime() + 7 * 3600e3).toISOString(); return `${C.dmy(d)} ${d.slice(11, 16)}`; }
  if (f.t === 'money') return fm(v);
  if (f.t === 'bool') return v ? 'Có' : 'Không';
  if (f.t === 'sel') return (f.o || []).find(o => o[0] === v)?.[1] ?? v;
  if (f.t === 'days') return v.join(', ');
  if (f.t === 'multi') return v.map(x => (f.o || []).find(o => o[0] === x)?.[1] || x).join(', ');
  return String(v);
};
const SIGN = { default: ['NGƯỜI LẬP', 'NGƯỜI KIỂM TRA', 'NGƯỜI PHÊ DUYỆT'], explain: ['NGƯỜI GIẢI TRÌNH', 'QUẢN LÝ TRỰC TIẾP', 'HCNS DUYỆT CÔNG'], vehicle: ['NGƯỜI LẬP', 'PHỤ TRÁCH HCNS'] };
async function form(entKey, id, user) {
  const e = C.E[entKey], g = await C.get(entKey, id, user, { reveal: true }), r = g.row;
  const legal = r.legal_id__l ? (await require('./db').one('SELECT name FROM hr_legal WHERE id=$1', [r.legal_id]))?.name : '';
  const simple = [], grids = [];
  for (const f of e.fields) { if (f.hide || f.k === 'status') continue; if (f.grid) { if ((r[f.k] || []).length) grids.push(f); continue; } if (f.show && !Object.entries(f.show).every(([k, v]) => v.includes(r[k]))) continue; simple.push([f.l, await val(f, r)]); }
  const body = `<div class="top"><b>${esc((legal || 'CÁT TƯỜNG GROUP').toUpperCase())}</b><span>Mã biểu mẫu: <b>${esc(e.code || '')}</b></span></div><h1>${esc(e.title.toUpperCase())}</h1>
  <table class="nb">${simple.filter(x => x[1]).map(x => `<tr><td style="width:38%">${esc(x[0])}:</td><td><b>${esc(x[1])}</b></td></tr>`).join('')}</table>
  ${grids.map(f => `<b>${esc(f.l)}</b><table><tr><th>STT</th>${f.grid.map(c => `<th>${esc(c.l)}</th>`).join('')}</tr>${r[f.k].map((l, i) => `<tr><td class="c">${i + 1}</td>${f.grid.map(c => `<td${c.n ? ' class="r"' : ''}>${esc(l[c.k])}</td>`).join('')}</tr>`).join('')}</table>`).join('')}
  <p style="text-align:right;font-style:italic">Bắc Ninh, ngày ...... tháng ...... năm ........</p><div class="sign">${(SIGN[entKey] || SIGN.default).map(s => `<div><b>${s}</b><br><i>(Ký, ghi rõ họ tên)</i></div>`).join('')}</div>`;
  return page(`${e.code} ${r.code || r.no || id}`, body);
}
function moneyWords(n) {
  const d = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const three = (x, full) => { const t = Math.floor(x / 100), c = Math.floor(x / 10) % 10, u = x % 10; let s = ''; if (t || full) s += d[t] + ' trăm '; if (c === 0 && u && (t || full)) s += 'linh '; else if (c === 1) s += 'mười '; else if (c) s += d[c] + ' mươi '; if (u) s += (u === 1 && c > 1 ? 'mốt' : u === 5 && c ? 'lăm' : d[u]) + ' '; return s; };
  const g = []; let x = Math.round(n); while (x > 0) { g.unshift(x % 1000); x = Math.floor(x / 1000); } const un = ['', 'nghìn ', 'triệu ', 'tỷ ', 'nghìn tỷ ']; let s = '';
  g.forEach((v, i) => { if (v) s += three(v, i > 0) + un[g.length - 1 - i]; });
  s = s.trim() || 'không'; return s[0].toUpperCase() + s.slice(1) + ' đồng./.';
}
function payslip(run, l, legal) {
  const mm = `${run.month.slice(5)}/${run.month.slice(0, 4)}`, R = (a, b) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
  return `<div style="page-break-after:always"><h1>PHIẾU LƯƠNG THÁNG ${mm}</h1><p class="c">${esc(legal)}</p><table><tr><th>Họ tên</th><th>${esc(l.name)} (${esc(l.code)})</th></tr>
  ${R('Tổng công thực tế', l.worked)}${R('Công hưởng 100%', l.d100)}${R('Công hưởng 85%', l.d85)}${R('Lương P1 thực nhận', fm(l.p1_net))}${R('Lương P2 thực nhận', fm(l.p2_net))}${R('Tiền ăn', fm(l.meal))}${R(`Tăng ca (${l.ot_h || 0} giờ)`, fm(l.ot_pay))}${R('Thưởng / khác', fm(l.bonus))}${R('Công tác phí', fm(l.trip_pay))}<tr><th>Tổng thu nhập</th><th class="r">${fm(l.total)}</th></tr>
  ${R('BHXH, BHYT, BHTN', fm(l.e_ins))}${R('Thuế TNCN', fm(l.tax))}${R('Tạm ứng, giảm trừ khác', fm(l.other_ded))}<tr><th>Thực lĩnh</th><th class="r">${fm(l.net)}</th></tr><tr><td>Chuyển khoản</td><td class="r">${esc(l.acct || 'Chưa có tài khoản')} ${esc(l.bank || '')}</td></tr></table><p class="c"><i>Mọi thắc mắc về lương vui lòng phản hồi phòng HCNS.</i></p></div>`;
}
function bank(run, legal) {
  const ls = run.lines.filter(l => l.net > 0), total = ls.reduce((s, l) => s + l.net, 0), mm = `${+run.month.slice(5)} năm ${run.month.slice(0, 4)}`;
  return page('TL04', `<div class="top"><b>${esc(legal.name.toUpperCase())}</b><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b></div><h1>BẢNG THANH TOÁN TIỀN LƯƠNG QUA TÀI KHOẢN</h1><p class="c"><b>(Tháng ${mm})</b></p>
  <p>Đề nghị quý Ngân hàng hạch toán vào tài khoản của cán bộ và thu phí liên quan căn cứ ủy nhiệm chi của Đơn vị chúng tôi và danh sách chi trả lương tháng ${mm}.</p>
  <table><tr><th>STT</th><th>HỌ VÀ TÊN</th><th>SỐ TÀI KHOẢN</th><th>SỐ TIỀN</th><th>NGÂN HÀNG</th></tr>${ls.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.acct || 'THIẾU TÀI KHOẢN')}</td><td class="r">${fm(l.net)}</td><td>${esc(l.bank || '')}</td></tr>`).join('')}<tr><th colspan="3">TỔNG CỘNG</th><th class="r">${fm(total)}</th><th></th></tr></table>
  <p><b>Bằng chữ:</b> ${esc(moneyWords(total))}</p><div class="sign"><div><b>XÁC NHẬN CỦA NGÂN HÀNG</b></div><div><b>KẾ TOÁN</b></div><div><b>TUQ. TỔNG GIÁM ĐỐC</b></div></div>`);
}
function report(r, p) {
  const v = (c, x) => { const a = x[c[0]]; return c[2] === 'm' ? fm(a) : c[2] === 'd' ? C.dmy(a) : c[2] === 'dt' && a ? new Date(new Date(a).getTime() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : a ?? ''; };
  return page(r.code, `<div class="top"><b>CÁT TƯỜNG GROUP</b><span>Mã: <b>${esc(r.code)}</b></span></div><h1>${esc(r.title.toUpperCase())}</h1><p class="c">${esc(p.month || p.year || '')}</p>
  <table class="nb"><tr>${r.kpis.map(k => `<td><b>${esc(k[0])}:</b> ${esc(typeof k[1] === 'number' ? fm(k[1]) : k[1])} ${esc(k[2] || '')}</td>`).join('')}</tr></table>
  <table><tr>${r.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr>${r.rows.map(x => `<tr>${r.cols.map(c => `<td${['n', 'm'].includes(c[2]) ? ' class="r"' : ''}>${esc(v(c, x))}</td>`).join('')}</tr>`).join('')}</table>
  <div class="sign"><div><b>NGƯỜI LẬP</b></div><div><b>NGƯỜI KIỂM TRA</b></div><div><b>NGƯỜI PHÊ DUYỆT</b></div></div>`);
}
module.exports = { form, payslip, bank, report, page, moneyWords };

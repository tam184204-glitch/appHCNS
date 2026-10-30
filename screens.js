// Các màn hình: khung, dashboard, danh sách, báo cáo, bảng công, sơ đồ tổ chức, hộp duyệt, chất lượng dữ liệu, cấu hình.
'use strict';
const main = () => $('#main');
let refresh = () => {};
const F = { legal: '', dept: '', month: '' };
const opt = (xs, v, all = 'Tất cả') => `<option value="">${all}</option>` + xs.map(x => `<option value="${x[0]}" ${String(x[0]) === String(v) ? 'selected' : ''}>${esc(x[1])}</option>`).join('');
const legalSel = v => `<select id="fL">${opt(M.legals.map(l => [l.id, l.short]), v)}</select>`;
const deptSel = v => `<select id="fD">${opt(M.depts.map(d => [d.id, d.name]), v)}</select>`;
const go = h => { location.hash = '#/' + h; };

// ---------- đăng nhập ----------
function showLogin() {
  $('#app').innerHTML = `<div class="card login"><img src="logo.png" alt="Cát Tường"><h2 class="center mb">CTG-HCNS</h2><div class="fld mb"><label>Tài khoản (mã NV)</label><input id="u"></div><div class="fld mb"><label>Mật khẩu</label><input id="p" type="password"></div><button class="btn pri" style="width:100%;justify-content:center" id="l">Đăng nhập</button></div>`;
  $('#l').onclick = run(async () => { await api('POST', '/api/login', { username: $('#u').value, password: $('#p').value }); boot(); });
}

// ---------- khung ----------
function shell() {
  const me = M.me, initials = me.full_name.split(' ').slice(-2).map(s => s[0]).join('');
  const route = location.hash.slice(2);
  const nav = M.menu.map(([g, items]) => `<h6>${g}</h6>` + items.map(([l, ic, x], i) => {
    if (!Array.isArray(x)) return `<a href="#/${x.replace(':', '/')}" data-r="${x.replace(':', '/')}">${ico(ic)}${esc(l)}</a>`;
    return `<div class="fn" data-fn="${g}${i}">${ico(ic)}<span>${esc(l)}</span>${ico('fa-chevron-right', 'ch')}</div><div class="sub hidden" data-s="${g}${i}">${x.map(([it, ll, code]) => `<a href="#/${it.replace(':', '/')}" data-r="${it.replace(':', '/')}">${esc(ll)}<small>${esc(code)}</small></a>`).join('')}</div>`;
  }).join('')).join('');
  $('#app').innerHTML = `<header class="top"><button class="burger" id="bg" aria-label="Thu gọn menu">${ico('fa-table-cells-large')}</button><a class="brand" href="#/d/DB01"><img src="logo.png" alt=""><div><b>CÁT TƯỜNG</b><span>HỆ THỐNG QUẢN TRỊ</span></div></a>
  <div class="gs">${ico('fa-magnifying-glass')}<input id="gq" placeholder="Tìm nhân sự, hợp đồng, VPP, tài sản…"><div class="gsr hidden" id="gr"></div></div>
  <button class="ib" id="th" title="Đổi giao diện sáng/tối">${ico('fa-moon')}</button><button class="ib" id="bell" title="Cảnh báo">${ico('fa-bell')}<span class="dot hidden" id="bd"></span></button>
  <button class="me" id="me"><span class="av">${esc(initials)}</span><div><b>${esc(me.full_name)}</b><small>${esc(me.title || '')} · ${esc(M.roles.find(r => r[0] === me.role)?.[1] || '')}</small></div>${ico('fa-chevron-down')}</button></header>
  <aside class="side"><div class="sh"><span class="ct">CT</span><div><b>CTG-HCNS</b><small>ENTERPRISE</small></div></div><nav class="nav">${nav}</nav></aside><main class="main" id="main"></main>`;
  $('#bg').onclick = () => document.body.classList.toggle(innerWidth < 760 ? 'nav-open' : 'collapsed');
  $('#th').onclick = () => { const d = document.documentElement, t = d.dataset.theme === 'dark' ? 'light' : 'dark'; d.dataset.theme = t; try { localStorage.hrTheme = t; } catch { } };
  $('#bell').onclick = () => go('d/DB06');
  $$('.fn').forEach(f => f.onclick = () => { f.classList.toggle('open'); $(`[data-s="${f.dataset.fn}"]`).classList.toggle('hidden'); });
  $('#me').onclick = () => {
    if ($('.menu')) return $('.menu').remove();
    const d = document.createElement('div'); d.className = 'menu';
    const rs = M.roles.map(r => [r, M.users.find(u => u.role === r[0])]).filter(x => x[1]);
    d.innerHTML = (M.noLogin ? `<div class="small muted" style="padding:6px 10px">Chạy thử: đổi người dùng / vai trò</div>${rs.map(([r, u]) => `<button data-as="${u.id}">${esc(r[1])}<div class="small muted">${esc(u.full_name)}</div></button>`).join('')}<hr>` : '') + `<button id="out">${ico('fa-right-from-bracket')} Đăng xuất</button>`;
    document.body.append(d); $$('[data-as]', d).forEach(b => b.onclick = run(async () => { await api('POST', '/api/as/' + b.dataset.as, {}); location.hash = M.roles ? '#/' : ''; location.reload(); }));
    $('#out', d).onclick = run(async () => { await api('POST', '/api/logout', {}); location.reload(); });
  };
  let gt; $('#gq').oninput = e => { clearTimeout(gt); gt = setTimeout(run(async () => { const r = await api('GET', '/api/search?q=' + encodeURIComponent(e.target.value)), g = $('#gr'); g.classList.toggle('hidden', !r.length); g.innerHTML = r.map(x => `<a href="#/e/${x.ent}/${x.id}"><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></a>`).join(''); }), 250); };
  document.addEventListener('click', e => { if (!e.target.closest('.gs')) $('#gr')?.classList.add('hidden'); if (!e.target.closest('.me') && !e.target.closest('.menu')) $('.menu')?.remove(); });
  api('GET', '/api/alerts').then(a => { const n = a.filter(x => !x.done && x.level !== 'can_cap_nhat').length; const d = $('#bd'); if (n) { d.textContent = n; d.classList.remove('hidden'); } }).catch(() => { });
}
function markNav() { const r = location.hash.slice(2); $$('.nav a').forEach(a => { const on = r === a.dataset.r || r.startsWith(a.dataset.r + '/'); a.classList.toggle('on', on); if (on) { const s = a.closest('.sub'); if (s) { s.classList.remove('hidden'); $(`[data-fn="${s.dataset.s}"]`).classList.add('open'); } } }); }
const demoBanner = () => M.demo && M.ents.payroll.perm.c ? `<div class="banner">${ico('fa-triangle-exclamation')} <span>Đang có dữ liệu mẫu (bảng công, tài sản, xe, tuyển dụng…) để chạy thử. Nhân sự, lương, BH trong bản demo đều là dữ liệu giả.</span><button class="btn warn sm x" id="clrDemo">Xóa dữ liệu mẫu</button></div>` : '';
function wireDemo() { const b = $('#clrDemo'); if (b) b.onclick = run(async () => { if (await ask('Xóa dữ liệu mẫu', 'Xóa toàn bộ bản ghi mẫu? Dữ liệu thật giữ nguyên.', { ok: 'Xóa', danger: 1 })) { await api('POST', '/api/demo/clear', {}); M.demo = 0; refresh(); } }); }

// ---------- dashboard ----------
function barChart(b) {
  const W = 640, H = 240, L = 10, T = 26, B = 26, n = b.values.length, hasT = !!b.target, max = Math.max(1, ...b.values, ...(b.target || [])), slot = (W - L * 2) / Math.max(n, 1), bw = Math.min(hasT ? 26 : 56, slot * (hasT ? .36 : .55));
  const y = v => T + (H - T - B) * (1 - v / max), rect = (x, v, c) => { const yy = y(v), h = H - B - yy; return `<path d="M${x},${H - B}V${yy + Math.min(4, h)}q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)}H${x + bw - 4}q4,0 4,${Math.min(4, h)}V${H - B}Z" fill="${c}"/>`; };
  const vs = c => `var(--${c})`;
  return `${hasT ? `<div class="legend"><span><i style="background:var(--s1)"></i>Hiện có</span><span><i style="background:var(--s2)"></i>Định biên</span></div>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.title)}">
  <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>${b.values.map((v, i) => { const cx = L + slot * i + slot / 2, x = hasT ? cx - bw - 1 : cx - bw / 2; return `<g class="bar" data-go="${b.link || ''}"><title>${esc(b.labels[i])}: ${fnum(v)} ${esc(b.unit)}${hasT ? ` / định biên ${b.target[i]}` : ''}</title><rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent"/>${rect(x, v, vs('s1'))}${hasT ? rect(cx + 1, b.target[i], vs('s2')) : ''}<text x="${cx}" y="${y(Math.max(v, b.target?.[i] || 0)) - 7}" text-anchor="middle" font-size="13" fill="var(--text)">${fnum(v)}</text><text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="${n > 7 ? 10 : 12.5}" fill="var(--muted)">${esc(String(b.labels[i]).slice(0, n > 4 ? 16 : 24))}</text></g>`; }).join('')}</svg>`;
}
const shareList = s => s.items.length ? s.items.map((x, i) => `<div class="sh-row" ${x.link ? `data-go="${x.link}" style="cursor:pointer"` : ''} title="${esc(x.l)}: ${fnum(x.v)}"><span>${esc(x.l)}</span><div class="tr"><div class="fl" style="width:${x.pct}%;background:var(--s${i % 4 + 1})"></div></div><span class="right muted">${x.pct}%</span></div>`).join('') : '<div class="empty">Chưa có dữ liệu</div>';
async function dashboard(id) {
  F.month ||= curM();
  const q2 = new URLSearchParams({ legal: F.legal, dept: F.dept, month: F.month });
  const d = await api('GET', `/api/dash/${id}?${q2}`);
  main().innerHTML = `<div class="ph"><h1>${ico(id === 'DB01' ? 'fa-gauge-high' : id === 'DB06' ? 'fa-bell' : 'fa-chart-column')} ${esc(d.title)}</h1><p>${esc(d.sub)}</p></div>
  <div class="card filters"><div><label>Pháp nhân</label>${legalSel(F.legal)}</div><div><label>Phòng ban</label>${deptSel(F.dept)}</div><div><label>Kỳ báo cáo</label><input type="month" id="fM" value="${F.month}"></div><button class="btn pri" id="rf">${ico('fa-rotate')} Làm mới</button><a class="btn" target="_blank" href="/print-report/${id === 'DB06' ? 'HD12' : 'HS02'}?${q2}">${ico('fa-file-pdf')} Tải PDF</a></div>
  ${demoBanner()}
  ${d.todo ? `<div class="sec">${ico('fa-list-check')} Việc cần làm hôm nay</div><div class="grid4">${d.todo.map(t => `<div class="todo ${t[5]} ${t[3] ? '' : 'zero'}" data-go="${t[4]}"><div class="t"><span class="ic">${ico(t[0])}</span><div><b>${t[3]}</b><span>${esc(t[2])}</span></div></div></div>`).join('')}</div>` : ''}
  <div class="grid4">${d.kpis.map(k => `<div class="kpi ${k[4]}" ${k[3] ? `data-go="${k[3]}"` : ''}><div class="ic">${ico(k[5])}</div><b>${typeof k[1] === 'number' ? fnum(k[1]) : esc(k[1])}</b><span>${esc(k[0])}${k[2] ? ` · ${esc(k[2])}` : ''}</span></div>`).join('')}</div>
  <div class="cols"><div class="card chart"><div class="sec">${esc(d.bar.title)}</div>${d.bar.values.length ? barChart(d.bar) : '<div class="empty">Chưa có dữ liệu — nhập kế hoạch để hiển thị</div>'}</div><div class="card"><div class="sec">${esc(d.share.title)}</div>${shareList(d.share)}</div></div>
  ${d.alerts ? `<div class="card"><div class="sec" style="font-size:15px">DANH SÁCH CẢNH BÁO / CẦN XỬ LÝ</div><div class="warnrow">${d.alerts.map(a => `<a href="#/${a[2]}">${esc(a[0])} <b>${a[1]}</b></a>`).join('')}</div></div>` : ''}
  ${d.list ? alertTable(d.list) : ''}`;
  const set = () => { F.legal = $('#fL').value; F.dept = $('#fD').value; F.month = $('#fM').value; refresh(); };
  ['#fL', '#fD', '#fM'].forEach(s => $(s).onchange = set); $('#rf').onclick = () => refresh(); wireDemo();
  $$('[data-go]', main()).forEach(x => { if (x.dataset.go) x.onclick = () => go(x.dataset.go); });
  $$('[data-al]', main()).forEach(b => b.onclick = run(async ev => { ev.stopPropagation(); await api('POST', '/api/alerts/' + encodeURIComponent(b.dataset.al), b.dataset.undo ? { undo: 1 } : {}); refresh(); }));
}
const LV = { qua_han: ['Quá hạn', 'r'], sap_den_han: ['Sắp đến hạn', 'a'], can_cap_nhat: ['Cần cập nhật dữ liệu', 'b'], da_xu_ly: ['Đã xử lý', 'g'] };
const alertTable = list => `<div class="tw mt"><table class="t"><thead><tr><th>Mức</th><th>Nhóm</th><th>Nội dung</th><th>Chi tiết</th><th>Hạn</th><th>Nguồn</th><th>Phụ trách</th><th></th></tr></thead><tbody>${list.map(a => `<tr class="c" data-go="${a.link}"><td>${pill(...LV[a.level])}</td><td>${esc(a.grp)}</td><td>${esc(a.title)}</td><td class="muted">${esc(a.detail)}</td><td class="nowrap">${dmy(a.due)}</td><td><span class="tag">${esc(a.src)}</span></td><td>${esc(a.owner)}</td><td>${a.done ? `<button class="btn sm" data-al="${esc(a.key)}" data-undo="1">Mở lại</button>` : `<button class="btn sm" data-al="${esc(a.key)}">Đã xử lý</button>`}</td></tr>`).join('')}</tbody></table></div>`;

// ---------- danh sách ----------
async function listScreen(ent, openId) {
  const e = M.ents[ent], st = (listScreen.s[ent] ||= { q: '', f: {} });
  const qp = new URLSearchParams({ q: st.q, ...Object.fromEntries(Object.entries(st.f).filter(([, v]) => v).map(([k, v]) => k === 'status' ? [k, v] : ['f_' + k, v])) });
  if (F.legal && e.fields.some(f => f.k === 'legal_id') && !st.f.legal_id) qp.set('f_legal_id', F.legal);
  const d = await api('GET', `/api/e/${ent}?${qp}`);
  const fl = (e.filters || []).map(k => { const f = e.fields.find(x => x.k === k); if (!f || f.t === 'month' || f.t === 'int') return ''; const o = k === 'legal_id' ? M.legals.map(l => [l.id, l.short]) : k === 'dept_id' ? M.depts.map(x => [x.id, x.name]) : f.o ? f.o.map(x => [x[0], x[1]]) : null; return o ? `<div><label>${esc(f.l)}</label><select data-fk="${k}">${opt(o, st.f[k])}</select></div>` : ''; }).join('');
  const p = e.perm;
  main().innerHTML = `<div class="ph"><h1>${ico(e.icon)} ${esc(e.title)} <span class="tag">${esc(e.code || '')}</span></h1><p>${d.total} ${esc(e.one)}${e.help ? ' · ' + esc(e.help) : ''}</p></div>
  <div class="card filters"><div><label>Tìm kiếm</label><input id="q" value="${esc(st.q)}" placeholder="Gõ để tìm…"></div>${fl}<span class="grow"></span>
  ${ent === 'vpp_req' || ent === 'vpp_in' ? `<button class="btn" id="buy">${ico('fa-cart-plus')} Tạo phiếu nhập từ nhu cầu</button>` : ''}${ent === 'gov_report' ? `<button class="btn" id="tpl">${ico('fa-download')} Mẫu báo cáo</button>` : ''}
  ${p.x ? `<a class="btn" href="/api/e/${ent}/export">${ico('fa-file-excel')} Xuất Excel</a>` : ''}${e.imp && p.c ? `<label class="btn">${ico('fa-file-import')} Nhập Excel<input type="file" id="imp" accept=".xlsx" hidden></label>` : ''}${p.c ? `<button class="btn pri" id="add">${ico('fa-plus')} Tạo mới</button>` : ''}</div>
  <div class="tw"><table class="t"><thead><tr>${e.list.map(k => `<th class="${isNum(e, k) ? 'n' : ''}">${esc(colL(e, k))}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r => `<tr class="c" data-id="${r.id}">${e.list.map(k => `<td class="${isNum(e, k) ? 'n' : ''}">${cell(e, k, r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${e.list.length}" class="empty">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
  $$('tr[data-id]', main()).forEach(t => t.onclick = run(() => openDetail(ent, +t.dataset.id)));
  let dq; $('#q').oninput = ev => { clearTimeout(dq); dq = setTimeout(async () => { st.q = ev.target.value; await refresh(); const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $$('[data-fk]', main()).forEach(s => s.onchange = () => { st.f[s.dataset.fk] = s.value; refresh(); });
  if ($('#add')) $('#add').onclick = run(() => openForm(ent));
  if ($('#imp')) $('#imp').onchange = run(async ev => { const fd = new FormData(); fd.append('f', ev.target.files[0]); const r = await api('POST', '/api/import/' + ent, fd); toast(`Thêm ${r.ok}, cập nhật ${r.upd}${r.err.length ? `, lỗi ${r.err.length}: ${r.err[0]}` : ''}`, !!r.err.length); delete OPT[ent]; refresh(); });
  if ($('#buy')) $('#buy').onclick = run(async () => { const l = F.legal || M.legals[0].id, x = await api('POST', '/api/vpp/buy', { legal_id: l }); refresh(); openDetail('vpp_in', x.row.id); });
  if ($('#tpl')) $('#tpl').onclick = run(async () => { const fs_ = await api('GET', '/api/gov-files'); modal({ title: 'Mẫu báo cáo lao động định kỳ', body: fs_.map(f => `<div class="mb"><a href="/api/gov/${encodeURIComponent(f)}">${ico('fa-download')} ${esc(f)}</a></div>`).join('') + '<p class="muted">Số lao động, lao động nữ lấy tại báo cáo PLI.</p>' }); });
  if (openId) openDetail(ent, openId).catch(er => toast(er.message, true));
}
listScreen.s = {};

// ---------- bảng lương, BH, CĐ trong chi tiết ----------
function sheetView(ent, r) {
  const L = r.lines || []; if (!L.length) return '<div class="empty">Chưa có dòng — bấm «Tính lại từ dữ liệu»</div>';
  const mt = (cols, rows, foot) => `<div class="tw" style="max-height:52vh"><table class="t"><thead><tr><th>#</th>${cols.map(c => `<th class="${c[2] ? 'n' : ''}">${c[1]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>${foot ? `<tfoot><tr><td></td>${foot}</tr></tfoot>` : ''}</table></div>`;
  const cl = (cols, x) => cols.map(c => `<td class="${c[2] ? 'n' : ''}">${c[3] ? c[3](x) : c[2] === 1 ? fm(x[c[0]]) : esc(x[c[0]] ?? '')}</td>`).join('');
  const sum = (cols, rows) => cols.map((c, i) => `<td class="${c[2] ? 'n' : ''}">${i === 0 ? 'TỔNG' : c[2] === 1 ? fm(rows.reduce((s, x) => s + (+(c[4] ? c[4](x) : x[c[0]]) || 0), 0)) : ''}</td>`).join('');
  if (ent === 'payroll') {
    const ed = (k) => x => r.status === 'nhap' || r.status === 'tu_choi' ? `<input class="pl" data-pl="${x.emp_id}" data-k="${k}" value="${fm(x[k] ?? 0)}">` : fm(x[k]);
    const cols = [['name', 'Họ tên'], ['worked', 'Công TT', 2], ['d100', '100%', 2], ['d85', '85%', 2], ['p1', 'Lương P1', 1], ['p2', 'Lương P2', 1], ['kpi', 'KPI %', 2, ed('kpi')], ['p1_net', 'P1 thực nhận', 1], ['p2_net', 'P2 thực nhận', 1], ['meal', 'Ăn ca', 1], ['ot_pay', 'Tăng ca', 1], ['bonus', 'Thưởng', 1, ed('bonus')], ['trip_pay', 'Công tác phí', 1, ed('trip_pay')], ['total', 'Tổng lương', 1], ['deduct', 'Giảm trừ GC', 1], ['e_ins', 'BH NLĐ', 1], ['tax', 'Thuế TNCN', 1], ['other_ded', 'Khấu trừ khác', 1, ed('other_ded')], ['net', 'Thực lĩnh', 1], ['c_bhxh', 'DN BHXH', 1], ['c_bhyt', 'DN BHYT', 1], ['c_bhtn', 'DN BHTN', 1], ['c_kpcd', 'KPCĐ', 1]];
    const miss = L.filter(l => l.no_pay).length, noa = L.filter(l => l.no_att).length;
    return `${miss || noa ? `<div class="banner">${ico('fa-triangle-exclamation')} ${miss ? `${miss} người cần cập nhật lương P1.` : ''} ${noa ? `${noa} người chưa có dữ liệu công.` : ''}</div>` : ''}` + mt(cols, L.map((x, i) => `<tr><td>${i + 1}</td>${cl(cols, x)}</tr>`).join(''), sum(cols, L));
  }
  const rt = r.rates, c0 = (x, k) => (+x.salary || 0) * rt[k] / 100;
  if (ent === 'ins_sheet') {
    const d = (k) => [k, '', 1, x => fm(c0(x, k)), x => c0(x, k)];
    const cols = [['name', 'Họ và tên'], ['ins_no', 'Số sổ BHXH'], ['title', 'Chức vụ'], ['salary', 'Tiền lương', 1], [...d('dn_bhxh')], [...d('dn_bhyt')], [...d('dn_bhtn')], [...d('nld_bhxh')], [...d('nld_bhyt')], [...d('nld_bhtn')], ['t', 'Tổng phải nộp', 1, x => fm(['dn_bhxh', 'dn_bhyt', 'dn_bhtn', 'nld_bhxh', 'nld_bhyt', 'nld_bhtn'].reduce((s, k) => s + c0(x, k), 0)), x => ['dn_bhxh', 'dn_bhyt', 'dn_bhtn', 'nld_bhxh', 'nld_bhyt', 'nld_bhtn'].reduce((s, k) => s + c0(x, k), 0)], ['change', 'Tăng / giảm'], ['note', 'Ghi chú', 0, x => x.need_data ? pill('Cần cập nhật dữ liệu', 'a') : esc(x.note || '')]];
    const names = { dn_bhxh: 'DN BHXH', dn_bhyt: 'DN BHYT', dn_bhtn: 'DN BHTN', nld_bhxh: 'NLĐ BHXH', nld_bhyt: 'NLĐ BHYT', nld_bhtn: 'NLĐ BHTN' }; for (const c of cols) if (names[c[0]]) c[1] = `${names[c[0]]} ${rt[c[0]]}%`;
    return mt(cols, L.map((x, i) => `<tr><td>${i + 1}</td>${cl(cols, x)}</tr>`).join(''), sum(cols, L.filter(l => l.change !== 'Báo giảm')));
  }
  const kp = x => c0(x, 'kpcd'), dp = x => x.member === false ? 0 : c0(x, 'dpcd');
  const cols = [['name', 'Tên nhân viên'], ['salary', 'Tiền lương', 1], ['kp', `KPCĐ ${rt.kpcd}%`, 1, x => fm(kp(x)), kp], ['dp', `ĐPCĐ ${rt.dpcd}%`, 1, x => fm(dp(x)), dp], ['k1', `Giữ KPCĐ ${rt.kpcd_giu}%`, 1, x => fm(kp(x) * rt.kpcd_giu / 100), x => kp(x) * rt.kpcd_giu / 100], ['k2', `Nộp KPCĐ ${rt.kpcd_nop}%`, 1, x => fm(kp(x) * rt.kpcd_nop / 100), x => kp(x) * rt.kpcd_nop / 100], ['d1', `Giữ ĐPCĐ ${rt.dpcd_giu}%`, 1, x => fm(dp(x) * rt.dpcd_giu / 100), x => dp(x) * rt.dpcd_giu / 100], ['d2', `Nộp ĐPCĐ ${rt.dpcd_nop}%`, 1, x => fm(dp(x) * rt.dpcd_nop / 100), x => dp(x) * rt.dpcd_nop / 100], ['change', 'Tăng / giảm']];
  return mt(cols, L.map((x, i) => `<tr><td>${i + 1}</td>${cl(cols, x)}</tr>`).join(''), sum(cols, L.filter(l => l.change !== 'Báo giảm')));
}

// ---------- báo cáo ----------
const YEARLY = new Set(['BH-02', 'CĐ-02', 'SK03']), NOPERIOD = new Set(['TS02', 'XC03', 'TD04', 'HD12', 'HD13', 'CCTC05']);
async function reportScreen(code, snap) {
  F.month ||= curM(); F.year ||= M.today.slice(0, 4);
  const qp = new URLSearchParams({ legal: F.legal, dept: F.dept, month: F.month, year: F.year }); if (snap) qp.set('snapshot', snap); if (code === 'HD13' && reportScreen.emp) qp.set('emp', reportScreen.emp);
  const d = await api('GET', `/api/report/${encodeURIComponent(code)}?${qp}`), emps = code === 'HD13' ? await opts('employee') : [];
  const val = (c, r) => { const v = r[c[0]]; if (v == null || v === '') return ''; return c[2] === 'm' ? fm(v) : c[2] === 'n' ? fnum(v) : c[2] === 'd' ? dmy(v) : c[2] === 'dt' ? dmyhm(v) : c[2] === 'w' ? pill(v, ws(v)) : esc(v); };
  const num = c => ['m', 'n'].includes(c[2]);
  main().innerHTML = `<div class="ph"><h1>${ico('fa-file-lines')} ${esc(d.title)} <span class="tag">${esc(d.code)}</span></h1>${d.snapshot ? `<p>Bản chốt phiên bản ${d.snapshot.version} · ${dmyhm(d.snapshot.at)} · số liệu không đổi khi nguồn cập nhật muộn <a href="#" id="live"><b>Xem số hiện tại</b></a></p>` : ''}</div>
  <div class="card filters"><div><label>Pháp nhân</label>${legalSel(F.legal)}</div>${['HS02', 'CC12', 'PLI'].includes(code) ? `<div><label>Phòng ban</label>${deptSel(F.dept)}</div>` : ''}${code === 'HD13' ? `<div><label>Người lao động</label><select id="fE">${opt(emps.map(e => [e.id, e.label]), reportScreen.emp, 'Tất cả')}</select></div>` : ''}
  ${YEARLY.has(code) ? `<div><label>Năm</label><input id="fY" type="number" value="${F.year}" style="min-width:100px"></div>` : NOPERIOD.has(code) ? '' : `<div><label>Kỳ</label><input type="month" id="fM" value="${F.month}"></div>`}
  <span class="grow"></span>${code === 'VPP06' ? `<button class="btn" id="buy">${ico('fa-cart-plus')} Tạo phiếu nhập từ nhu cầu</button>` : ''}${d.snapshots?.length ? `<div><label>Bản đã chốt</label><select id="sn">${opt(d.snapshots.map(s => [s.id, `${s.period} v${s.version}`]), snap, '— số hiện tại —')}</select></div>` : ''}
  <a class="btn" href="/api/report/${encodeURIComponent(code)}/xlsx?${qp}">${ico('fa-file-excel')} Excel</a><a class="btn" target="_blank" href="/print-report/${encodeURIComponent(code)}?${qp}">${ico('fa-file-pdf')} PDF</a><a class="btn" href="/print-report/${encodeURIComponent(code)}?${qp}&fmt=doc">${ico('fa-file-word')} Word</a>${M.ents.vpp_in.perm.c ? `<button class="btn pri" id="close">${ico('fa-lock')} Chốt kỳ</button>` : ''}</div>
  <div class="grid4">${d.kpis.map((k, i) => `<div class="kpi flat ${['g', 'n', 'b', 'a'][i]}"><b>${typeof k[1] === 'number' ? fnum(k[1]) : esc(k[1])}${k[2] ? ` <span style="font-size:14px">${esc(k[2])}</span>` : ''}</b><span>${esc(k[0])}</span></div>`).join('')}</div>
  ${d.note ? `<div class="banner">${esc(d.note)}</div>` : ''}
  <div class="tw"><table class="t"><thead><tr>${d.cols.map(c => `<th class="${num(c) ? 'n' : ''}">${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${d.rows.map((r, i) => `<tr class="${r._e ? 'c' : ''}" data-i="${i}">${d.cols.map(c => `<td class="${num(c) ? 'n' : ''}">${val(c, r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${d.cols.length}" class="empty">Chưa có dữ liệu trong kỳ</td></tr>`}</tbody></table></div>
  <div class="card spec mt"><b>Cách tính:</b> ${esc(d.rule)} <b>Kiểm soát:</b> ${esc(d.control)} <b>Nguồn:</b> ${esc(d.source)} <b>Luồng:</b> ${esc(d.flow)}</div>`;
  $$('tr[data-i]', main()).forEach(t => { const x = d.rows[+t.dataset.i]._e; if (x) t.onclick = run(() => openDetail(x[0], x[1])); });
  const set = () => { F.legal = $('#fL').value; if ($('#fD')) F.dept = $('#fD').value; if ($('#fM')) F.month = $('#fM').value; if ($('#fY')) F.year = $('#fY').value; if ($('#fE')) reportScreen.emp = $('#fE').value; refresh(); };
  ['#fL', '#fD', '#fM', '#fY', '#fE'].forEach(s => { if ($(s)) $(s).onchange = set; });
  if ($('#sn')) $('#sn').onchange = run(() => reportScreen(code, $('#sn').value)); if ($('#live')) $('#live').onclick = ev => { ev.preventDefault(); refresh(); };
  if ($('#close')) $('#close').onclick = run(async () => { const r = await api('POST', `/api/report/${encodeURIComponent(code)}/close`, { legal: F.legal, dept: F.dept, month: YEARLY.has(code) ? undefined : F.month, year: F.year }); toast(`Đã chốt kỳ · phiên bản ${r.version}`); refresh(); });
  if ($('#buy')) $('#buy').onclick = run(async () => { const x = await api('POST', '/api/vpp/buy', { legal_id: F.legal || M.legals[0].id }); openDetail('vpp_in', x.row.id); });
}

// ---------- bảng công ----------
const mkCls = m => m === 'HC' || m === 'HC/2' || m === 'LB' || /^CT/.test(m) ? 'HC' : /^P/.test(m) ? 'P' : /^X/.test(m) ? 'X' : /^K/.test(m) ? 'K' : 'O';
async function timesheet() {
  F.month ||= curM(); const d = await api('GET', `/api/timesheet?${new URLSearchParams({ month: F.month, legal: F.legal, dept: F.dept })}`), ds = Array.from({ length: d.last }, (_, i) => i + 1), m = F.month;
  const dow = i => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, i).getDay(), DN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], off = i => dow(i) === 0 || d.hol.includes(`${m}-${String(i).padStart(2, '0')}`), edit = M.ents.attendance.perm.c;
  main().innerHTML = `<div class="ph"><h1>${ico('fa-table-cells')} Bảng công tháng <span class="tag">TL01</span></h1><p>${d.emps.length} người · ${d.locked ? `${d.locked} pháp nhân đã khóa kỳ` : 'kỳ đang mở'} · bấm ô để sửa, đơn đã duyệt tự ghi vào đây</p></div>
  <div class="card filters"><div><label>Kỳ</label><input type="month" id="fM" value="${m}"></div><div><label>Pháp nhân</label>${legalSel(F.legal)}</div><div><label>Phòng ban</label>${deptSel(F.dept)}</div><span class="grow"></span>${edit ? `<label class="btn">${ico('fa-file-import')} Nhập máy chấm công<input type="file" id="iA" accept=".xlsx" hidden></label><button class="btn" id="auto">${ico('fa-wand-magic-sparkles')} Công tự động</button>` : ''}<a class="btn" href="/api/report/CC12/xlsx?month=${m}">${ico('fa-file-excel')} Xuất Excel</a></div>
  <div class="row small muted mb"><span class="mk HC" style="display:inline-block;padding:0 6px">HC</span> Đủ công <span class="mk X" style="display:inline-block;padding:0 6px">XI/XO</span> Thiếu chấm <span class="mk P" style="display:inline-block;padding:0 6px">P</span> Nghỉ phép <span class="mk O" style="display:inline-block;padding:0 6px">O</span> Chế độ <span class="mk K" style="display:inline-block;padding:0 6px">K</span> Không lương</div>
  <div class="tw"><table class="t ts"><thead><tr><th class="nm">Nhân sự</th>${ds.map(i => `<th class="${off(i) ? 'wk' : ''}">${String(i).padStart(2, '0')}<br>${DN[dow(i)]}</th>`).join('')}<th>Đủ công</th><th>Phép</th><th>Thiếu</th></tr></thead><tbody>${d.emps.map(e => { const a = d.att[e.id] || { days: {}, work: 0, paid_leave: 0, miss: 0 }; return `<tr><td class="nm">${esc(e.full_name)} <span class="small muted">${esc(e.code)}</span></td>${ds.map(i => `<td class="${off(i) ? 'wk' : ''}" data-e="${e.id}" data-d="${i}">${a.days[i] ? `<span class="mk ${mkCls(a.days[i])}">${esc(a.days[i])}</span>` : ''}</td>`).join('')}<td><b>${fnum(a.work)}</b></td><td>${fnum(a.paid_leave)}</td><td>${a.miss || ''}</td></tr>`; }).join('') || `<tr><td class="empty" colspan="${d.last + 4}">Chưa có nhân sự</td></tr>`}</tbody></table></div>`;
  const set = () => { F.month = $('#fM').value; F.legal = $('#fL').value; F.dept = $('#fD').value; refresh(); }; ['#fM', '#fL', '#fD'].forEach(s => $(s).onchange = set);
  if (edit) {
    $$('td[data-e]', main()).forEach(td => td.onclick = run(async () => { const cur = td.textContent; const mm = modal({ title: 'Sửa ô công', cls: 'nar', body: `<div class="fld"><select id="mk"><option value="">— xóa —</option>${d.types.map(t => `<option value="${esc(t.code)}" ${t.code === cur ? 'selected' : ''}>${esc(t.code)} · ${esc(t.name)}</option>`).join('')}</select></div>`, foot: `<button class="btn pri" id="ok">Lưu</button>` }); $('#ok', mm.el).onclick = run(async () => { await api('PUT', '/api/timesheet', { emp_id: td.dataset.e, day: `${m}-${String(td.dataset.d).padStart(2, '0')}`, mark: $('#mk', mm.el).value }); mm.close(); refresh(); }); }));
    $('#iA').onchange = run(async ev => { const fd = new FormData(); fd.append('f', ev.target.files[0]); const r = await api('POST', '/api/import-att', fd); toast(`Ghi ${r.ok} ô · giữ nguyên ${r.skip} ô theo đơn đã duyệt${r.err.length ? ` · lỗi ${r.err.length}` : ''}`, !!r.err.length); refresh(); });
    $('#auto').onclick = run(() => openForm('att_auto', null, { month: m }));
  }
}

// ---------- sơ đồ tổ chức ----------
async function org() {
  const d = await api('GET', '/api/org'), blocks = {}; for (const x of d.depts) (blocks[x.block || 'Khác'] ||= []).push(x);
  main().innerHTML = `<div class="ph"><h1>${ico('fa-sitemap')} Cơ cấu tổ chức <span class="tag">CCTC04</span></h1><p>Theo pháp nhân: ${d.legal.map(l => `${esc(l.short)} ${l.n}`).join(' · ')}</p></div>
  ${Object.entries(blocks).map(([b, xs]) => `<div class="sec">${esc(b)}</div><div class="org mb">${xs.map(x => `<div class="d" data-id="${x.id}" style="cursor:pointer"><b>${esc(x.name)}</b><div class="small muted">${esc(x.code)} · ${x.n} người</div><div class="small">${x.head ? 'Phụ trách: ' + esc(x.head) : pill('Chưa bổ nhiệm phụ trách', 'a')}</div></div>`).join('')}</div>`).join('')}
  ${d.unassigned.length ? `<div class="card"><div class="sec" style="font-size:15px">Chưa gán phòng ban (đơn vị mồ côi)</div>${d.unassigned.map(x => `${esc(x.full_name)} <span class="muted">· ${esc(x.title)}</span>`).join('<br>')}</div>` : ''}`;
  $$('.d', main()).forEach(x => x.onclick = run(() => openDetail('dept', +x.dataset.id)));
}

// ---------- hộp duyệt ----------
async function inboxScreen() {
  const d = await api('GET', '/api/inbox');
  main().innerHTML = `<div class="ph"><h1>${ico('fa-inbox')} Việc chờ tôi duyệt</h1><p>${d.length} phiếu</p></div><div class="card filters"><span class="grow"></span><button class="btn ok" id="all" ${d.length ? '' : 'disabled'}>${ico('fa-check-double')} Duyệt các phiếu đã chọn</button></div>
  <div class="tw"><table class="t"><thead><tr><th><input type="checkbox" id="ck"></th><th>Nội dung</th><th>Người trình</th><th>Thời gian</th></tr></thead><tbody>${d.map(a => `<tr class="c" data-e="${a.ent}" data-id="${a.rec_id}"><td><input type="checkbox" class="pk"></td><td>${esc(a.title)}</td><td>${esc(a.by_name || '')}</td><td>${dmyhm(a.requested_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không còn phiếu nào chờ duyệt</td></tr>'}</tbody></table></div>`;
  $$('tr[data-id]', main()).forEach(t => t.onclick = run(ev => { if (ev.target.type !== 'checkbox') return openDetail(t.dataset.e, +t.dataset.id); }));
  $('#ck').onchange = e => $$('.pk', main()).forEach(c => c.checked = e.target.checked);
  $('#all').onclick = run(async () => { const xs = $$('tr[data-id]', main()).filter(t => $('.pk', t).checked); let ok = 0; const er = []; for (const t of xs) try { await api('POST', `/api/e/${t.dataset.e}/${t.dataset.id}/approve`, { ok: true }); ok++; } catch (x) { er.push(x.message); } toast(`Đã duyệt ${ok}/${xs.length}${er[0] ? ' · ' + er[0] : ''}`, !!er.length); refresh(); });
}

// ---------- chất lượng dữ liệu ----------
const SEV = { mau_thuan: ['Mâu thuẫn giữa các file', 'r'], can_cap_nhat: ['Cần cập nhật', 'a'], thong_tin: ['Thông tin', 'b'], da_tu_xu_ly: ['App đã tự xử lý', 'g'] };
async function dataScreen() {
  const [d, j] = await Promise.all([api('GET', '/api/issues'), api('GET', '/api/jobs')]), c = k => d.filter(x => x.severity === k).length;
  main().innerHTML = `<div class="ph"><h1>${ico('fa-database')} Chất lượng dữ liệu</h1><p>Kết quả đối soát chéo khi nạp các file của phòng HCNS và nhật ký việc tự động</p></div>
  <div class="grid4">${Object.entries(SEV).map(([k, v], i) => `<div class="kpi flat ${['r', 'a', 'b', 'g'][i]}"><b>${c(k)}</b><span>${v[0]}</span></div>`).join('')}</div>
  <div class="tw"><table class="t"><thead><tr><th>Mức</th><th>Nguồn</th><th>Vấn đề</th><th>Chi tiết / cách xử lý</th></tr></thead><tbody>${d.map(x => `<tr><td>${pill(...SEV[x.severity])}</td><td><span class="tag">${esc(x.src)}</span></td><td>${esc(x.title)}</td><td class="muted">${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>
  <div class="sec mt">Việc tự động đã chạy</div><div class="tw" style="max-height:280px"><table class="t"><thead><tr><th>Việc</th><th>Kỳ</th><th>Kết quả</th><th>Lúc</th></tr></thead><tbody>${j.map(x => `<tr><td>${esc({ ky_cong: 'Mở kỳ công', nhap_bh_cd: 'Nháp bảng BH + công đoàn', cong_phep: 'Cộng phép tháng', nhap_luong: 'Nháp bảng lương', bc_dinh_ky: 'Lập báo cáo định kỳ' }[x.name] || x.name)}</td><td>${esc(x.period)}</td><td>${esc(x.result)}</td><td>${dmyhm(x.at)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- cấu hình, nhật ký ----------
async function settings() {
  const s = await api('GET', '/api/settings');
  const LB = { ins: ['Bảo hiểm (%)', { dn_bhxh: 'DN BHXH', dn_bhyt: 'DN BHYT', dn_bhtn: 'DN BHTN', nld_bhxh: 'NLĐ BHXH', nld_bhyt: 'NLĐ BHYT', nld_bhtn: 'NLĐ BHTN' }], cd: ['Công đoàn (%)', { kpcd: 'KPCĐ công ty trích', dpcd: 'ĐPCĐ NLĐ trích', kpcd_nop: 'KPCĐ nộp cấp trên', kpcd_giu: 'KPCĐ giữ lại', dpcd_nop: 'ĐPCĐ nộp', dpcd_giu: 'ĐPCĐ giữ lại' }], pay: ['Lương', { std_days: 'Công chuẩn', trial_pct: '% lương thử việc', meal_day: 'Tiền ăn / công (đ)', ded_self: 'Giảm trừ bản thân (đ)', ded_dep: 'Giảm trừ người phụ thuộc (đ)' }] };
  main().innerHTML = `<div class="ph"><h1>${ico('fa-sliders')} Cấu hình tỷ lệ</h1><p>Tỷ lệ do HCNS cấu hình. Bảng đã lập giữ tỷ lệ tại thời điểm lập.</p></div>${Object.entries(LB).map(([k, [t, fs_]]) => `<div class="card mb"><div class="sec">${t}</div><div class="fg">${Object.entries(fs_).map(([f, l]) => `<div class="fld"><label>${l}</label><input data-s="${k}" data-k="${f}" value="${s[k][f]}"></div>`).join('')}</div><button class="btn pri mt" data-save="${k}">Lưu</button></div>`).join('')}
  <div class="card"><div class="sec">Biểu thuế TNCN lũy tiến</div><div class="fld"><label>Mỗi dòng: thu nhập tính thuế đến | thuế suất %</label><textarea id="tx" rows="6">${s.pay.tax.map(x => `${x[0] ?? 'trên'} | ${x[1]}`).join('\n')}</textarea></div><button class="btn pri mt" id="stx">Lưu biểu thuế</button><p class="muted small">Cần xác minh lại theo quy định đang áp dụng.</p></div>`;
  $$('[data-save]', main()).forEach(b => b.onclick = run(async () => { const k = b.dataset.save, o = { ...s[k] }; $$(`[data-s="${k}"]`, main()).forEach(i => o[i.dataset.k] = +i.value.replace(',', '.')); await api('PUT', '/api/settings/' + k, o); toast('Đã lưu'); }));
  $('#stx').onclick = run(async () => { const tax = $('#tx').value.trim().split('\n').map(l => { const [a, b] = l.split('|').map(x => x.trim()); return [isNaN(+a) ? null : +a, +b]; }); await api('PUT', '/api/settings/pay', { ...s.pay, tax }); toast('Đã lưu'); });
}
async function audit() { const d = await api('GET', '/api/audit'); main().innerHTML = `<div class="ph"><h1>${ico('fa-clock-rotate-left')} Nhật ký thao tác</h1><p>300 thao tác gần nhất</p></div><div class="tw"><table class="t"><thead><tr><th>Thời gian</th><th>Người</th><th>Thao tác</th><th>Dữ liệu</th><th>Ghi chú</th></tr></thead><tbody>${d.map(a => `<tr><td class="nowrap">${dmyhm(a.at)}</td><td>${esc(a.by || 'Hệ thống')}</td><td>${esc(ACTION[a.action] || a.action)}</td><td>${esc(M.ents[a.ent]?.title || a.ent)}${a.rec_id ? ' #' + a.rec_id : ''}</td><td>${esc(a.note || '')}</td></tr>`).join('')}</tbody></table></div>`; }

// ---------- định tuyến ----------
async function route() {
  const [k, a, b] = location.hash.slice(2).split('/').map(decodeURIComponent);
  const home = M.me.role === 'nld' ? () => listScreen('employee') : () => dashboard('DB01');
  refresh = run(k === 'd' ? () => dashboard(a) : k === 'e' ? () => listScreen(a) : k === 'r' ? () => reportScreen(a) : k === 'v' ? ({ timesheet, org, inbox: inboxScreen, data: dataScreen, settings, audit })[a] : home);
  markNav(); main().innerHTML = '<div class="empty">Đang tải…</div>'; $$('.ov').forEach(x => x.remove()); document.body.classList.remove('nav-open');
  try { if (k === 'e' && b) await listScreen(a, +b); else await (k === 'd' ? dashboard(a) : k === 'e' ? listScreen(a) : k === 'r' ? reportScreen(a) : k === 'v' ? ({ timesheet, org, inbox: inboxScreen, data: dataScreen, settings, audit })[a]() : home()); } catch (e) { main().innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function boot() {
  try { if (localStorage.hrTheme) document.documentElement.dataset.theme = localStorage.hrTheme; } catch { }
  const r = await fetch('/api/meta'); if (r.status === 401) return showLogin();
  M = await r.json(); shell(); window.onhashchange = route; route();
}
boot();

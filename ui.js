// Lõi giao diện: tiện ích, API, hộp thoại, form tự sinh từ meta, chi tiết.
'use strict';
let M = null;
const OPT = {};
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fm = n => n == null || n === '' || isNaN(n) ? '' : Math.round(+n).toLocaleString('vi-VN');
const fnum = n => n == null || n === '' ? '' : isNaN(n) ? n : (+n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const dmy = v => v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '';
const dmyhm = v => { if (!v) return ''; const z = new Date(new Date(v).getTime() + 7 * 3600e3).toISOString(); return `${dmy(z)} ${z.slice(11, 16)}`; };
const mmy = v => v && /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : v || '';
const ico = (n, c = '') => `<i class="fa-solid ${n} ${c}"></i>`;
const curM = () => M.today.slice(0, 7);
const pill = (l, c) => `<span class="pill ${c || ''}">${esc(l)}</span>`;
const ws = s => /Quá hạn|Thiếu|thiếu|Chưa trả|trùng/.test(s) ? 'r' : /Sắp|Dưới|Cần|chưa/.test(s) ? 'a' : 'g';
async function api(method, url, body) {
  const o = { method, headers: {} }; if (body instanceof FormData) o.body = body; else if (body !== undefined) { o.body = JSON.stringify(body); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, o), d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (r.status === 401) { showLogin(); throw new Error('Cần đăng nhập'); }
  if (!r.ok) { const e = new Error(d.error || d); e.fields = d.fields; throw e; } return d;
}
let tT; function toast(m, err) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); } t.textContent = m; t.classList.toggle('err', !!err); t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, err ? 7000 : 3500); }
const run = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
function modal({ title, body = '', cls = '', foot = '' }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="btn sm" data-x aria-label="Đóng">${ico('fa-xmark')}</button></div><div class="mb2">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  document.body.append(ov); const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); }); $$('[data-x]', ov).forEach(b => b.onclick = close);
  return { el: ov, close, body: $('.mb2', ov), foot: $('.mf', ov) };
}
function ask(title, msg, { ok = 'Đồng ý', reason, danger, date } = {}) {
  return new Promise(res => {
    const m = modal({ title, cls: 'nar', body: `<p>${msg}</p>${reason ? `<div class="fld">${date ? `<input type="date" id="askR" value="${M.today}">` : `<textarea id="askR"></textarea>`}</div>` : ''}`, foot: `<button class="btn" data-x>Hủy</button><button class="btn ${danger ? 'danger' : 'pri'}" id="askOk">${ok}</button>` });
    $('[data-x]', m.foot).addEventListener('click', () => res(false));
    $('#askOk', m.el).onclick = () => { const v = reason ? $('#askR', m.el).value.trim() : true; m.close(); res(v); };
  });
}
async function opts(ent) { return OPT[ent] ||= await api('GET', '/api/opts/' + ent); }

// ---------- hiển thị ----------
function show(f, r) {
  const v = r[f.k]; if (v == null || v === '') return '<span class="muted">—</span>';
  switch (f.t) {
    case 'money': return fm(v); case 'num': return fnum(v); case 'date': return dmy(v); case 'dt': return dmyhm(v); case 'month': return mmy(v);
    case 'bool': return v ? ico('fa-circle-check') + ' Có' : 'Không'; case 'sel': { const o = (f.o || []).find(x => x[0] === v); return o?.[2] ? pill(o[1], o[2]) : esc(o?.[1] ?? v); }
    case 'ref': return esc(r[f.k + '__l'] ?? '#' + v); case 'days': return esc(v.join(', ')); case 'multi': return esc(v.map(x => (f.o.find(o => o[0] === x) || [])[1] || x).join(', '));
    case 'json': return f.grid ? gridView(f, v) : ''; case 'long': return esc(v).replace(/\n/g, '<br>'); default: return esc(v);
  }
}
const gridView = (f, v) => !v?.length ? '<span class="muted">—</span>' : `<div class="tw" style="max-height:300px"><table class="t"><thead><tr><th>#</th>${f.grid.map(c => `<th>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${v.map((x, i) => `<tr><td>${i + 1}</td>${f.grid.map(c => `<td${c.n ? ' class="n"' : ''}>${esc(x[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const colL = (e, k) => e.fields.find(f => f.k === k)?.l || M.virt[k] || k;
const cell = (e, k, r) => { const f = e.fields.find(x => x.k === k); return f ? show(f, r) : esc(fnum(r[k])); };
const isNum = (e, k) => ['money', 'num', 'int'].includes(e.fields.find(f => f.k === k)?.t) || k in M.virt;

// ---------- form ----------
const shownF = (f, r) => !f.show || Object.entries(f.show).every(([k, v]) => v.includes(r[k]));
function inp(f, v) {
  const a = `name="${f.k}"`;
  switch (f.t) {
    case 'long': return `<textarea ${a}>${esc(v)}</textarea>`;
    case 'date': return `<input type="date" ${a} value="${esc(v || '')}">`;
    case 'dt': { const z = v ? new Date(new Date(v).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : ''; return `<input type="datetime-local" ${a} value="${z}">`; }
    case 'month': return `<input type="month" ${a} value="${esc(v || '')}">`;
    case 'money': return `<input ${a} inputmode="numeric" data-money value="${v == null ? '' : fm(v)}">`;
    case 'int': case 'num': return `<input ${a} inputmode="decimal" value="${esc(v ?? '')}">`;
    case 'bool': return `<label class="row" style="margin-top:8px"><input type="checkbox" ${a} ${v ? 'checked' : ''}> Có</label>`;
    case 'sel': return `<select ${a}><option value="">— chọn —</option>${(f.o || []).map(o => `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    case 'ref': return `<input list="dl_${f.ref}" data-ref="${f.ref}" ${a} data-id="${v ?? ''}" placeholder="Gõ để tìm…" autocomplete="off">`;
    case 'days': return `<div class="days" data-days="${f.k}">${Array.from({ length: 31 }, (_, i) => `<label><input type="checkbox" value="${i + 1}" ${(v || []).includes(i + 1) ? 'checked' : ''}>${i + 1}</label>`).join('')}</div><button type="button" class="btn sm mt" data-alld>Chọn T2–T6 trong tháng</button>`;
    case 'multi': return `<div class="row" data-multi="${f.k}">${f.o.map(o => `<label class="row" style="margin:0"><input type="checkbox" value="${o[0]}" ${(v || []).includes(o[0]) ? 'checked' : ''}> ${esc(o[1])}</label>`).join('')}</div>`;
    case 'json': return f.grid ? `<div class="gt" data-grid="${f.k}"></div>` : '';
    default: return `<input ${a} value="${esc(v ?? '')}" ${f.pick ? `list="dl_${f.pick}c"` : f.sug ? `list="sg_${f.k}"` : ''} autocomplete="off">${f.sug ? `<datalist id="sg_${f.k}">${f.sug.map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}`;
  }
}
function drawGrid(el, f, rows) {
  el.innerHTML = `<div class="tw" style="max-height:320px"><table class="t"><thead><tr><th>#</th>${f.grid.map(c => `<th style="min-width:${c.w || 110}px">${esc(c.l)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((x, i) => `<tr><td>${i + 1}</td>${f.grid.map(c => `<td>${c.o ? `<select data-c="${c.k}"><option></option>${c.o.map(o => `<option ${o === x[c.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input data-c="${c.k}" value="${esc(x[c.k])}" ${c.pick ? `list="dl_${c.pick}c"` : ''} autocomplete="off">`}</td>`).join('')}<td><button type="button" class="btn sm" data-del="${i}">${ico('fa-xmark')}</button></td></tr>`).join('')}</tbody></table></div><button type="button" class="btn sm mt" data-add>${ico('fa-plus')} Thêm dòng</button>`;
}
const gridRead = (el, f) => $$('tbody tr', el).map(tr => Object.fromEntries(f.grid.map(c => [c.k, $(`[data-c="${c.k}"]`, tr).value.trim()])));
async function wire(root, e, rec) {
  const refs = [...new Set(e.fields.filter(f => f.t === 'ref').map(f => f.ref))], picks = [...new Set(e.fields.flatMap(f => [f.pick, ...(f.grid || []).map(c => c.pick)]).filter(Boolean))];
  for (const r of refs) { const o = await opts(r); root.insertAdjacentHTML('beforeend', `<datalist id="dl_${r}">${o.map(x => `<option value="${esc(x.label)}">`).join('')}</datalist>`); }
  for (const p of picks) { const o = await opts(p); root.insertAdjacentHTML('beforeend', `<datalist id="dl_${p}c">${o.map(x => `<option value="${esc(x.code ?? x.label)}">${esc(x.name || x.full_name || x.label)}</option>`).join('')}</datalist>`); }
  for (const i of $$('input[data-ref]', root)) { const o = OPT[i.dataset.ref], x = o.find(y => y.id === +i.dataset.id); if (x) i.value = x.label; else if (i.dataset.id && rec[i.name + '__l']) i.value = rec[i.name + '__l']; i.onchange = () => { const y = o.find(z => z.label === i.value); i.dataset.id = y?.id ?? ''; if (!y && i.value) i.value = ''; }; }
  for (const f of e.fields.filter(f => f.grid && !f.ro)) {
    const el = $(`[data-grid="${f.k}"]`, root); if (!el) continue; drawGrid(el, f, rec[f.k]?.length ? [...rec[f.k]] : [{}, {}]);
    el.addEventListener('click', ev => { if (ev.target.closest('[data-add]')) drawGrid(el, f, [...gridRead(el, f), {}]); const d = ev.target.closest('[data-del]'); if (d) drawGrid(el, f, gridRead(el, f).filter((_, i) => i !== +d.dataset.del)); });
    el.addEventListener('change', ev => { const c = f.grid.find(x => x.k === ev.target.dataset.c); if (!c?.pick) return; const o = OPT[c.pick].find(x => x.code === ev.target.value); if (o) for (const [to, from] of Object.entries(c.fill || {})) { const t = $(`[data-c="${to}"]`, ev.target.closest('tr')); if (t && !t.value) t.value = o[from] ?? ''; } });
  }
  $$('[data-money]', root).forEach(i => i.onblur = () => { const n = +i.value.replace(/\D/g, ''); if (i.value) i.value = fm(n); });
  $$('[data-alld]', root).forEach(b => b.onclick = () => { const m = $('[name=month]', root).value; if (!m) return toast('Chọn tháng trước', true); $$('[data-days] input', root).forEach(c => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, +c.value), dow = d.getDay(); c.checked = d.getMonth() === +m.slice(5, 7) - 1 && dow > 0 && dow < 6; }); });
  const dep = () => { const r = readForm(root, e); for (const f of e.fields) { const w = $(`[data-f="${f.k}"]`, root); if (w) w.classList.toggle('hidden', !shownF(f, r)); } };
  root.addEventListener('change', dep); dep();
}
function readForm(root, e) {
  const o = {};
  for (const f of e.fields) {
    if (f.ro) continue; const i = $(`[name="${f.k}"]`, root);
    if (f.t === 'days') { o[f.k] = $$(`[data-days="${f.k}"] input:checked`, root).map(c => +c.value); continue; }
    if (f.t === 'multi') { o[f.k] = $$(`[data-multi="${f.k}"] input:checked`, root).map(c => c.value); continue; }
    if (f.grid) { const el = $(`[data-grid="${f.k}"]`, root); if (el) o[f.k] = gridRead(el, f); continue; }
    if (!i) continue;
    o[f.k] = f.t === 'bool' ? i.checked : f.t === 'ref' ? (i.dataset.id ? +i.dataset.id : null) : f.t === 'money' ? (i.value ? +i.value.replace(/\D/g, '') : null) : i.value.trim() === '' ? null : f.t === 'dt' ? i.value + ':00+07:00' : i.value.trim();
  }
  return o;
}
async function openForm(ent, id, preset = {}) {
  const e = M.ents[ent], rec = id ? (await api('GET', `/api/e/${ent}/${id}?reveal=1`)).row : { ...Object.fromEntries(e.fields.filter(f => f.def !== undefined).map(f => [f.k, f.def === 'today' ? M.today : f.def === 'me_emp' ? M.me.emp_id : f.def])), ...preset };
  const fs_ = e.fields.filter(f => !f.ro && f.t !== 'code');
  const m = modal({ title: `${id ? 'Sửa' : 'Tạo'} ${esc(e.one)} <span class="tag">${esc(e.code || '')}</span>`, cls: fs_.some(f => f.grid) ? 'wide' : '', body: `${e.help ? `<p class="muted">${esc(e.help)}</p>` : ''}<div class="fg">${fs_.map(f => `${f.sec ? `<h4>${esc(f.sec)}</h4>` : ''}<div class="fld ${['long', 'json', 'days', 'multi'].includes(f.t) ? 'full' : ''}" data-f="${f.k}"><label>${esc(f.l)}${f.req ? '<span class="req"> *</span>' : ''}</label>${inp(f, rec[f.k])}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`).join('')}</div>`, foot: `<button class="btn" data-x2>Hủy</button><button class="btn pri" id="sv">${ico('fa-floppy-disk')} Lưu</button>` });
  $('[data-x2]', m.el).onclick = m.close; await wire(m.body, e, rec);
  $('#sv', m.el).onclick = run(async () => {
    const d = readForm(m.body, e); $$('.fld.err', m.el).forEach(x => x.classList.remove('err'));
    try { const r = id ? await api('PUT', `/api/e/${ent}/${id}`, d) : await api('POST', `/api/e/${ent}`, d); m.close(); delete OPT[ent]; toast((r.warnings || [])[0] || 'Đã lưu', !!(r.warnings || []).length); refresh(); openDetail(ent, r.row.id); }
    catch (er) { (er.fields || []).forEach(k => $(`[data-f="${k}"]`, m.el)?.classList.add('err')); throw er; }
  });
}

// ---------- chi tiết ----------
const ACTION = { tao: 'Tạo', sua: 'Sửa', xoa: 'Xóa', trinh_duyet: 'Trình duyệt', phe_duyet: 'Phê duyệt', tu_choi: 'Từ chối', tu_dong: 'Tự động cập nhật', xem_dinh_danh: 'Xem định danh', tai_tep: 'Tải tệp lên', tai_ve: 'Tải tệp về', xuat_excel: 'Xuất Excel', in_phieu_luong: 'In phiếu lương', sua_cong: 'Sửa công', chot_ky: 'Chốt kỳ', sua_cau_hinh: 'Sửa cấu hình', dang_nhap: 'Đăng nhập' };
async function openDetail(ent, id, { reveal } = {}) {
  const e = M.ents[ent], g = await api('GET', `/api/e/${ent}/${id}${reveal ? '?reveal=1' : ''}`), r = g.row, p = g.perm;
  $$('.ov.dt').forEach(x => x.remove());
  const sheet = e.sheet, tit = esc(r.code || r.no || r.full_name || r.name || mmy(r.month) || e.one);
  const body = `<div class="tabs"><button class="on" data-tab="i">Thông tin</button><button data-tab="h">Lịch sử (${g.history.length})</button><button data-tab="f">Tệp & ghi chú (${g.files.length + g.notes.length})</button></div>
  <div data-p="i">${sheet ? sheetView(ent, r) : ''}<div class="fv ${sheet ? 'mt' : ''}">${e.fields.filter(f => shownF(f, r)).map(f => `<div class="${f.t === 'json' || f.t === 'long' ? 'full' : ''}"><small>${esc(f.l)}</small><div>${show(f, r)}</div></div>`).join('')}</div>
  ${g.approvals.length ? `<div class="mt small muted">${g.approvals.map(a => `${esc(a.title)} · ${esc(a.requested_by_l || '')} → ${{ cho_duyet: 'chờ duyệt', da_duyet: 'đã duyệt', tu_choi: 'từ chối', huy: 'hủy' }[a.status]} ${a.decided_by_l ? '· ' + esc(a.decided_by_l) : ''} ${a.comment ? '· ' + esc(a.comment) : ''}`).join('<br>')}</div>` : ''}</div>
  <div data-p="h" class="hidden"><table class="t"><tbody>${g.history.map(h => `<tr><td class="nowrap">${dmyhm(h.at)}</td><td>${esc(ACTION[h.action] || h.action.replace('tt:', ''))}</td><td>${esc(h.by || 'Hệ thống')}</td><td>${esc(h.note || '')}</td></tr>`).join('') || '<tr><td class="empty">Chưa có</td></tr>'}</tbody></table></div>
  <div data-p="f" class="hidden">${g.files.map(f => `<div><a href="/api/file/${f.id}">${ico('fa-paperclip')} ${esc(f.name)}</a> <span class="small muted">${dmyhm(f.uploaded_at)} · ${esc(f.by || '')}</span></div>`).join('')}${g.notes.map(n => `<div class="small"><b>${esc(n.by)}</b> ${dmyhm(n.at)}: ${esc(n.body)}</div>`).join('')}<div class="row mt"><input id="nt" class="grow" placeholder="Ghi chú…" style="height:38px;border:1px solid var(--line);border-radius:9px;padding:0 10px;background:var(--card)"><button class="btn sm" id="ntb">Thêm</button>${p.files ? `<label class="btn sm">${ico('fa-upload')} Tải tệp<input type="file" id="up" multiple hidden></label>` : ''}</div></div>`;
  const b = (i, l, cls, ic) => `<button class="btn ${cls}" id="${i}">${ic ? ico(ic) : ''} ${l}</button>`;
  const acts = (e.acts || []).filter(a => p.acts.includes(a.k));
  const extra = [
    r._masked && M.piiRoles.includes(M.me.role) ? b('rv', 'Xem định danh', '', 'fa-eye') : '',
    ent === 'contract' && ['HD01', 'HD02'].includes(r.kind) && ['hieu_luc', 'cho_quyet_dinh'].includes(r.state) && p.edit ? b('rn', 'Tạo HĐ kế tiếp', 'ok', 'fa-file-circle-plus') : '',
    ent === 'car_book' && r.status === 'dang_di' && M.ents.car_return.perm.c ? b('ret', 'Lập phiếu trả xe', 'ok', 'fa-square-parking') : '',
    ent === 'payroll' ? `<a class="btn" target="_blank" href="/print-payslip/${id}">${ico('fa-file-invoice')} Phiếu lương TL03</a><a class="btn" target="_blank" href="/print-bank/${id}">${ico('fa-building-columns')} Chuyển khoản TL04</a>` : '',
    `<a class="btn" target="_blank" href="/print/${ent}/${id}">${ico('fa-print')} In</a>`, `<a class="btn" href="/print/${ent}/${id}?fmt=doc">${ico('fa-file-word')} Word</a>`,
    p.del ? b('dl', 'Xóa', 'danger', 'fa-trash') : '', p.edit && !(p.locked && !p.lockKeep?.length) ? b('ed', 'Sửa', '', 'fa-pen') : '', ...acts.map(a => b('a_' + a.k, a.l, 'ok', a.ico)), p.submit ? b('sb', 'Trình duyệt', 'pri', 'fa-paper-plane') : '',
    p.approve ? b('ap', 'Duyệt', 'ok', 'fa-check') + b('rj', 'Từ chối', 'danger', 'fa-xmark') : ''].join('');
  const m = modal({ title: `${esc(e.title)} · ${tit} <span class="tag">${esc(e.code || '')}</span>`, cls: sheet || e.fields.some(f => f.grid) ? 'wide' : '', body, foot: extra }); m.el.classList.add('dt');
  $$('[data-tab]', m.el).forEach(t => t.onclick = () => { $$('[data-tab]', m.el).forEach(x => x.classList.toggle('on', x === t)); $$('[data-p]', m.el).forEach(x => x.classList.toggle('hidden', x.dataset.p !== t.dataset.tab)); });
  const on = (s, fn) => { const x = $(s, m.el); if (x) x.onclick = run(fn); };
  const again = async () => { refresh(); await openDetail(ent, id); };
  on('#rv', () => openDetail(ent, id, { reveal: true })); on('#ed', async () => { m.close(); await openForm(ent, id); });
  on('#dl', async () => { if (await ask('Xóa', `Xóa ${esc(e.one)} này?`, { danger: 1, ok: 'Xóa' })) { await api('DELETE', `/api/e/${ent}/${id}`); m.close(); refresh(); toast('Đã xóa'); } });
  on('#sb', async () => { await api('POST', `/api/e/${ent}/${id}/submit`, {}); toast('Đã trình duyệt'); again(); }); on('#ap', async () => { await api('POST', `/api/e/${ent}/${id}/approve`, { ok: true }); toast('Đã duyệt'); again(); });
  on('#rj', async () => { const c = await ask('Từ chối', 'Ghi rõ lý do:', { reason: 1, ok: 'Từ chối', danger: 1 }); if (c) { await api('POST', `/api/e/${ent}/${id}/approve`, { ok: false, comment: c }); again(); } });
  on('#rn', async () => { const x = await api('POST', `/api/contract/${id}/renew`, {}); toast('Đã tạo HĐ kế tiếp — kiểm tra lại số HĐ, thời hạn'); refresh(); openDetail('contract', x.row.id); });
  on('#ret', async () => { m.close(); await openForm('car_return', null, { book_id: id, got_at: r.start_at, back_at: new Date().toISOString() }); });
  for (const a of acts) on('#a_' + a.k, async () => { const d = {}; if (a.ask) { const f = a.ask[0], v = await ask(a.l, f.l, { reason: 1, date: f.t === 'date' }); if (!v) return; d[f.k] = v; } const x = await api('POST', `/api/e/${ent}/${id}/act/${a.k}`, d); toast('Đã thực hiện'); refresh(); if (x.open) openDetail(x.open[0], x.open[1]); else openDetail(ent, id); });
  on('#ntb', async () => { await api('POST', `/api/e/${ent}/${id}/note`, { body: $('#nt', m.el).value }); openDetail(ent, id); });
  const up = $('#up', m.el); if (up) up.onchange = run(async () => { const fd = new FormData(); [...up.files].forEach(f => fd.append('f', f)); await api('POST', `/api/e/${ent}/${id}/files`, fd); openDetail(ent, id); });
  $$('[data-pl]', m.el).forEach(i => i.onchange = run(async () => { await api('PUT', `/api/payroll/${id}/line/${i.dataset.pl}`, { [i.dataset.k]: +i.value.replace(/\D/g, '') }); await openDetail(ent, id); }));
}

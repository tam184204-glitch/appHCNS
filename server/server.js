// Máy chủ CTG-HCNS — node server/server.js → http://localhost:3600
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const { q, one, tx } = require('./db');
const { migrate } = require('./schema');
const M = require('./meta');
const C = require('./core');
const B = require('./biz');
const V = require('./reports');
const P = require('./print');
const J = require('./jobs');
const { buildXlsx, readXlsx } = require('./xlsx');
const { bad, deny, notFound, HttpError, can } = C;

const PORT = +(process.env.PORT || 3600), HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, '..', 'public'), DATA = path.join(__dirname, '..', 'data'), FILES = path.join(DATA, 'files');
const SESSION_H = 12;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const html = (res, s, q2 = {}, name = 'bieu-mau') => q2.fmt === 'doc' ? sendFile(res, Buffer.from('﻿' + s), name + '.doc', 'application/msword') : send(res, 200, s, { 'Content-Type': 'text/html; charset=utf-8' });
const sendFile = (res, buf, name, mime, inline) => { res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}` }); res.end(buf); };
const readJson = req => new Promise((ok, no) => { const a = []; let z = 0; req.on('data', c => { z += c.length; if (z > 8e6) { no(new HttpError(413, 'Dữ liệu quá lớn')); req.destroy(); } else a.push(c); }); req.on('end', () => { try { ok(a.length ? JSON.parse(Buffer.concat(a).toString('utf8')) : {}); } catch { no(new HttpError(400, 'JSON không hợp lệ')); } }); req.on('error', no); });
const readUpload = req => new Promise((ok, no) => { const files = [], fields = {}; const bb = Busboy({ headers: req.headers, limits: { fileSize: 50e6, files: 30 }, defParamCharset: 'utf8' }); bb.on('field', (k, v) => { fields[k] = v; }); bb.on('file', (_n, s, i) => { const c = []; s.on('data', x => c.push(x)); s.on('end', () => { const b = Buffer.concat(c); if (b.length) files.push({ buffer: b, name: i.filename, mime: i.mimeType }); }); }); bb.on('close', () => ok({ files, fields })); bb.on('error', no); req.pipe(bb); });
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const checkPw = (pw, h) => { if (!h) return false; const [s, x] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(x, 'hex'), crypto.scryptSync(pw, s, 32)); };

// ---------- phiên ----------
const NO_LOGIN = /^(1|true|yes)$/i.test(process.env.NO_LOGIN || ''), NO_LOGIN_USER = process.env.NO_LOGIN_USER || 'admin';
const UC = 'u.id, u.username, u.full_name, u.role, u.title, u.emp_id, u.dept_id, u.legal_ids, u.must_change';
async function userFromReq(req) {
  const sid = cookies(req).hr_sid;
  const u = sid && await one(`SELECT ${UC} FROM hr_session s JOIN hr_user u ON u.id=s.user_id WHERE s.sid=$1 AND s.expires_at>now() AND u.active`, [sid]);
  if (!NO_LOGIN) return u || null;
  const r = u || await one(`SELECT ${UC} FROM hr_user u WHERE lower(u.username)=lower($1)`, [NO_LOGIN_USER]);
  return r && { ...r, must_change: false };
}
async function newSession(res, uid, body = { ok: true }) { const sid = crypto.randomBytes(32).toString('base64url'); await q(`INSERT INTO hr_session (sid,user_id,expires_at) VALUES ($1,$2,now()+interval '${SESSION_H} hours')`, [sid, uid]); send(res, 200, body, { 'Set-Cookie': `hr_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_H * 3600}` }); }
const fails = new Map();
async function login(req, res) {
  const { username, password } = await readJson(req), key = String(username || '').toLowerCase(), f = fails.get(key) || { n: 0, t: 0 };
  if (f.n >= 5 && Date.now() - f.t < 300e3) bad('Sai mật khẩu quá 5 lần — thử lại sau 5 phút');
  const u = await one('SELECT * FROM hr_user WHERE lower(username)=$1', [key]);
  if (!u || !u.active || !checkPw(password || '', u.pw_hash)) { fails.set(key, { n: f.n + 1, t: Date.now() }); bad('Sai tài khoản hoặc mật khẩu'); }
  fails.delete(key); await q('UPDATE hr_user SET last_login=now() WHERE id=$1', [u.id]);
  await q("INSERT INTO hr_audit (ent,rec_id,action,user_id) VALUES ('user',$1,'dang_nhap',$1)", [u.id]);
  await newSession(res, u.id, { ok: true, must_change: u.must_change });
}

async function metaFor(user) {
  const strip = e => ({ ...e, fields: e.fields.filter(f => !f.hide), perm: { r: can(user, e, 'r'), c: can(user, e, 'c'), u: can(user, e, 'u'), d: can(user, e, 'd'), a: can(user, e, 'a'), x: can(user, e, 'x') } });
  const ents = Object.fromEntries(Object.values(M.E).map(e => [e.key, strip(e)]));
  const rOk = code => !({ TL05: 0 })[code] || true;
  const allowed = it => it.startsWith('e:') ? ents[it.slice(2)].perm.r : it.startsWith('r:') ? (user.role !== 'nld' && user.role !== 'truong_bp' || ['HD13', 'XC06', 'PH02'].includes(it.slice(2))) && rOk(it.slice(2)) : it.startsWith('d:') ? user.role !== 'nld' : it === 'v:data' ? ['cv_hc', 'cv_hcns', 'tp_hcns', 'admin'].includes(user.role) : it === 'v:settings' ? ['tp_hcns', 'admin'].includes(user.role) : it === 'v:audit' ? ['tp_hcns', 'admin'].includes(user.role) : true;
  const label = it => it.startsWith('e:') ? [it, ents[it.slice(2)].title, ents[it.slice(2)].code] : it.startsWith('r:') ? [it, V.SPEC[it.slice(2)]?.[0] || it, it.slice(2)] : it === 'v:timesheet' ? [it, 'Bảng công tháng', 'TL01'] : it === 'v:org' ? [it, 'Sơ đồ cơ cấu tổ chức', 'CCTC04'] : [it, it, ''];
  const menu = M.MENU.map(([g, items]) => [g, items.map(([l, ic, x]) => Array.isArray(x) ? [l, ic, x.filter(allowed).map(label)] : allowed(x) ? [l, ic, x] : null).filter(i => i && (!Array.isArray(i[2]) || i[2].length))]).filter(g => g[1].length);
  const pool2 = await q("SELECT id, full_name, role, title, emp_id FROM hr_user WHERE active ORDER BY full_name");
  return { me: user, roles: M.ROLES, menu, ents, virt: M.VIRT, piiRoles: M.PII_ROLES, payRoles: M.PAY_ROLES, noLogin: NO_LOGIN, today: C.today(), users: NO_LOGIN ? pool2 : [],
    legals: await q('SELECT id, code, short FROM hr_legal ORDER BY id'), depts: await q('SELECT id, code, name FROM hr_dept ORDER BY name'), demo: (await one('SELECT (SELECT count(*) FROM hr_attendance WHERE is_demo) + (SELECT count(*) FROM hr_asset WHERE is_demo) n')).n };
}

// ---------- định tuyến ----------
const routes = [];
const r = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts });
const need = (u, roles) => { if (u.role !== 'admin' && !roles.includes(u.role)) deny(); };
r('POST', '/api/login', login, { open: 1 });
r('POST', '/api/logout', async (req, res) => { const s = cookies(req).hr_sid; if (s) await q('DELETE FROM hr_session WHERE sid=$1', [s]); send(res, 200, { ok: true }, { 'Set-Cookie': 'hr_sid=; Path=/; Max-Age=0' }); }, { open: 1 });
r('GET', '/api/login-info', async (req, res) => send(res, 200, { noLogin: NO_LOGIN }), { open: 1 });
r('POST', '/api/as/:id', async (req, res, u, p) => { if (!NO_LOGIN) deny('Chỉ dùng khi chạy thử'); notFound(await one('SELECT id FROM hr_user WHERE id=$1 AND active', [+p.id]), 'tài khoản'); await newSession(res, +p.id); });
r('POST', '/api/password', async (req, res, u) => { const { old, pw } = await readJson(req); const x = await one('SELECT pw_hash FROM hr_user WHERE id=$1', [u.id]); if (!checkPw(old || '', x.pw_hash)) bad('Mật khẩu hiện tại không đúng'); if (!pw || pw.length < 6) bad('Mật khẩu mới tối thiểu 6 ký tự'); await q('UPDATE hr_user SET pw_hash=$1, must_change=false WHERE id=$2', [hashPw(pw), u.id]); send(res, 200, { ok: true }); });
r('GET', '/api/meta', async (req, res, u) => send(res, 200, await metaFor(u)));
r('GET', '/api/opts/:ent', async (req, res, u, p, qs) => {
  const e = M.E[p.ent] || bad('Sai loại'); const add = [], w = [], pr = []; const a = (s, ...v) => { let i = 0; w.push(s.replace(/\$(\d+)/g, () => '$' + (pr.push(v[i++]), pr.length))); };
  if (!['employee', 'legal', 'dept', 'vpp_item', 'att_type', 'room', 'vehicle', 'position'].includes(p.ent)) { if (!can(u, e, 'r')) deny(); C.scopeSql(e, u, a); }
  if (qs.q) a(`(${e.disp}) ILIKE $1`, `%${qs.q}%`);
  const hasCode = C.F[p.ent].code, cols = [`t.id`, `(${e.disp}) AS label`, ...(hasCode ? ['t.code'] : []), ...['name', 'unit', 'full_name'].filter(k => C.F[p.ent][k]).map(k => 't.' + k)];
  send(res, 200, await q(`SELECT ${cols.join(',')} FROM ${e.table} t ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY 2 LIMIT ${qs.q ? 30 : 400}`, pr));
});
r('GET', '/api/e/:ent', async (req, res, u, p, qs) => send(res, 200, await C.list(p.ent, u, qs)));
r('GET', '/api/e/:ent/export', async (req, res, u, p, qs) => {
  const e = M.E[p.ent] || bad('Sai loại'); if (!can(u, e, 'x')) deny('Bạn không được xuất dữ liệu này');
  const { rows } = await C.list(p.ent, u, { ...qs, limit: 20000 }), f = e.fields.filter(x => !x.grid && !x.hide && x.t !== 'json' && x.t !== 'days');
  const data = [f.map(x => x.l), ...rows.map(r2 => f.map(x => { const v = r2[x.k]; return x.t === 'ref' ? r2[x.k + '__l'] ?? '' : x.t === 'sel' ? (x.o || []).find(o => o[0] === v)?.[1] ?? v ?? '' : x.t === 'date' ? C.dmy(v) : x.t === 'bool' ? (v ? 'Có' : '') : ['money', 'num', 'int'].includes(x.t) ? (v == null ? null : +v) : v ?? ''; }))];
  await C.audit({ q }, p.ent, null, 'xuat_excel', null, null, u, `${rows.length} dòng`);
  sendFile(res, buildXlsx({ sheet: e.code || e.key, rows: data, boldRows: [0], widths: f.map(() => 20) }), `${e.code || e.key}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
r('GET', '/api/e/:ent/:id', async (req, res, u, p, qs) => { const x = await C.get(p.ent, p.id, u, { reveal: qs.reveal === '1' }); if (qs.reveal === '1') await C.audit({ q }, p.ent, +p.id, 'xem_dinh_danh', null, null, u); x.history = await q('SELECT a.action, a.at, a.note, u.full_name AS by FROM hr_audit a LEFT JOIN hr_user u ON u.id=a.user_id WHERE a.ent=$1 AND a.rec_id=$2 ORDER BY a.at DESC LIMIT 40', [p.ent, +p.id]); send(res, 200, x); });
r('POST', '/api/e/:ent', async (req, res, u, p) => send(res, 200, await C.create(p.ent, await readJson(req), u)));
r('PUT', '/api/e/:ent/:id', async (req, res, u, p) => send(res, 200, await C.update(p.ent, p.id, await readJson(req), u)));
r('DELETE', '/api/e/:ent/:id', async (req, res, u, p) => send(res, 200, await C.remove(p.ent, p.id, u)));
r('POST', '/api/e/:ent/:id/submit', async (req, res, u, p) => send(res, 200, await C.submit(p.ent, p.id, u, await readJson(req))));
r('POST', '/api/e/:ent/:id/approve', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await C.approve(p.ent, p.id, u, b)); });
r('POST', '/api/e/:ent/:id/act/:k', async (req, res, u, p) => send(res, 200, await C.act(p.ent, p.id, p.k, u, await readJson(req))));
r('POST', '/api/e/:ent/:id/note', async (req, res, u, p) => { await C.addNote(p.ent, p.id, (await readJson(req)).body, u); send(res, 200, { ok: true }); });
r('POST', '/api/e/:ent/:id/files', async (req, res, u, p) => {
  const g = await C.get(p.ent, p.id, u); if (!g.perm.files) deny(); const { files, fields } = await readUpload(req); if (!files.length) bad('Chưa chọn tệp');
  const dir = path.join(FILES, p.ent, p.id); fs.mkdirSync(dir, { recursive: true });
  for (const f of files) { const ext = path.extname(f.name).toLowerCase(); if (['.exe', '.bat', '.cmd', '.js', '.vbs', '.ps1', '.html'].includes(ext)) bad(`Không nhận tệp ${ext}`); const disk = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`); fs.writeFileSync(disk, f.buffer); await q('INSERT INTO hr_file (ent,rec_id,kind,name,mime,size,path,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [p.ent, +p.id, fields.kind || 'tai_lieu', f.name, f.mime, f.buffer.length, path.relative(FILES, disk), u.id]); await C.audit({ q }, p.ent, +p.id, 'tai_tep', null, null, u, f.name); }
  send(res, 200, { ok: true });
});
r('GET', '/api/file/:id', async (req, res, u, p) => { const f = notFound(await one('SELECT * FROM hr_file WHERE id=$1 AND deleted_at IS NULL', [+p.id]), 'tệp'); await C.get(f.ent, f.rec_id, u); await C.audit({ q }, f.ent, f.rec_id, 'tai_ve', null, null, u, f.name); sendFile(res, fs.readFileSync(path.join(FILES, f.path)), f.name, f.mime || 'application/octet-stream'); });
r('POST', '/api/import/:ent', async (req, res, u, p) => {   // nhập Excel: dòng tiêu đề trùng nhãn trường; có mã thì cập nhật
  const e = M.E[p.ent] || bad('Sai loại'); if (!can(u, e, 'c')) deny();
  const { files } = await readUpload(req); if (!files[0]) bad('Chưa chọn tệp');
  const sheet = readXlsx(files[0].buffer)[0], hi = sheet.rows.findIndex(x => x && x.filter(Boolean).length >= 2), hd = sheet.rows[hi].map(s => String(s).trim().toLowerCase());
  const map = hd.map(h => e.fields.find(f => !f.grid && (f.l.toLowerCase() === h || f.k === h || (h === 'mã sp' && f.k === 'code') || (h === 'mô tả' && p.ent === 'vpp_item' && f.k === 'name'))));
  if (!map.filter(Boolean).length) bad('Không nhận ra cột nào — dùng file «Xuất Excel» làm mẫu');
  const out = { ok: 0, upd: 0, err: [] };
  for (let i = hi + 1; i < sheet.rows.length; i++) { const x = sheet.rows[i]; if (!x?.some(v => v !== '')) continue; const o = {}; for (const [j, f] of map.entries()) if (f && x[j] !== '' && x[j] != null) o[f.k] = f.t === 'ref' ? (await one(`SELECT id FROM ${M.E[f.ref].table} t WHERE (${M.E[f.ref].disp}) = $1 OR t.code = $1`, [String(x[j])]))?.id : x[j];
    try { const old = o.code && C.F[p.ent].code && await one(`SELECT id FROM ${e.table} WHERE code=$1`, [String(o.code)]); if (old) { await C.update(p.ent, old.id, o, u); out.upd++; } else { await C.create(p.ent, o, u, { keepCode: 1 }); out.ok++; } } catch (er) { out.err.push(`Dòng ${i + 1}: ${er.message}`); } }
  send(res, 200, out);
});
r('POST', '/api/import-att', async (req, res, u) => {   // nhập file máy chấm công: Mã NV | Ngày | Vào | Ra → tự ra ký hiệu HC / XI / XO / XX; không đè đơn đã duyệt
  need(u, M.NS); const { files } = await readUpload(req); if (!files[0]) bad('Chưa chọn tệp');
  const rows = readXlsx(files[0].buffer)[0].rows, hi = rows.findIndex(x => x?.some(s => /mã\s*nv/i.test(String(s)))); if (hi < 0) bad('Cần cột «Mã NV», «Ngày», «Vào», «Ra»');
  const hd = rows[hi].map(s => String(s).trim().toLowerCase()), ci = re => hd.findIndex(h => re.test(h)), [a, b, c, d] = [ci(/mã\s*nv/), ci(/ngày/), ci(/vào/), ci(/ra/)];
  const out = { ok: 0, skip: 0, err: [] }, t = v => { if (v === '' || v == null) return null; if (typeof v === 'number') { const m = Math.round(v * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; } return String(v).slice(0, 5); };
  for (const x of rows.slice(hi + 1)) { if (!x?.[a]) continue; const e = await one('SELECT id FROM hr_employee WHERE code=$1', [String(x[a]).trim()]), day = C.isoDate(x[b]); if (!e || !day) { out.err.push(`${x[a]} ${x[b]}: không nhận ra`); continue; }
    const cur = await one('SELECT source FROM hr_attendance WHERE emp_id=$1 AND day=$2', [e.id, day]); if (cur && cur.source !== 'may') { out.skip++; continue; }
    const i = t(x[c]), o = t(x[d]); try { await B.setMark({ q, one }, e.id, day, i && o ? 'HC' : i ? 'XO' : o ? 'XI' : 'XX', { in_t: i, out_t: o }, 'may'); out.ok++; } catch (er) { out.err.push(er.message); } }
  send(res, 200, out);
});
r('GET', '/api/report/:code', async (req, res, u, p, qs) => {
  const code = decodeURIComponent(p.code);
  if (qs.snapshot) { const s = notFound(await one('SELECT * FROM hr_snapshot WHERE id=$1', [+qs.snapshot]), 'bản chốt'); return send(res, 200, { ...s.data, snapshot: { id: s.id, version: s.version, at: s.closed_at, period: s.period } }); }
  const data = await V.report(code, qs, u); data.snapshots = await q('SELECT s.id, s.period, s.version, s.closed_at, u.full_name AS by FROM hr_snapshot s LEFT JOIN hr_user u ON u.id=s.closed_by WHERE s.code=$1 ORDER BY s.id DESC LIMIT 12', [code]); send(res, 200, data);
});
r('POST', '/api/report/:code/close', async (req, res, u, p) => {  // chốt kỳ: lưu phiên bản, nguồn cập nhật muộn không đổi số đã chốt
  need(u, M.HC); const code = decodeURIComponent(p.code), b = await readJson(req), data = await V.report(code, b, u), period = b.month || b.year || C.today();
  const v = (await one('SELECT coalesce(max(version),0)+1 AS v FROM hr_snapshot WHERE code=$1 AND period=$2', [code, period])).v;
  await q('INSERT INTO hr_snapshot (code,period,filters,data,version,closed_by) VALUES ($1,$2,$3,$4,$5,$6)', [code, period, JSON.stringify(b), JSON.stringify(data), v, u.id]); await C.audit({ q }, 'report', null, 'chot_ky', null, null, u, `${code} ${period} v${v}`); send(res, 200, { version: v });
});
r('GET', '/api/report/:code/xlsx', async (req, res, u, p, qs) => {
  const code = decodeURIComponent(p.code), d = await V.report(code, qs, u), cell = (c, x) => { const v = x[c[0]]; return c[2] === 'd' ? C.dmy(v) : ['n', 'm'].includes(c[2]) && v !== '' && v != null ? +v : v ?? ''; };
  const rows = [[d.title], [`Kỳ: ${qs.month || qs.year || ''}`], [], d.cols.map(c => c[1]), ...d.rows.map(x => d.cols.map(c => cell(c, x)))];
  await C.audit({ q }, 'report', null, 'xuat_excel', null, null, u, code); sendFile(res, buildXlsx({ sheet: code, rows, boldRows: [0, 3], widths: d.cols.map(() => 18) }), `${code}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
r('GET', '/api/dash/:id', async (req, res, u, p, qs) => { if (u.role === 'nld') deny(); send(res, 200, await V.dash(p.id, qs, u)); });
r('GET', '/api/alerts', async (req, res, u) => send(res, 200, u.role === 'nld' ? [] : await V.alerts(u)));
r('POST', '/api/alerts/:key', async (req, res, u, p) => { need(u, M.HC); const b = await readJson(req), k = decodeURIComponent(p.key); if (b.undo) await q('DELETE FROM hr_alert_state WHERE key=$1', [k]); else await q('INSERT INTO hr_alert_state (key,state,note,by) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET state=$2, note=$3, by=$4, at=now()', [k, 'da_xu_ly', b.note || null, u.id]); send(res, 200, { ok: true }); });
r('GET', '/api/inbox', async (req, res, u) => send(res, 200, await V.inbox(u)));
r('GET', '/api/search', async (req, res, u, p, qs) => {
  const s = String(qs.q || '').trim(); if (s.length < 2) return send(res, 200, []); const out = [];
  for (const k of ['employee', 'contract', 'vpp_item', 'asset', 'vehicle', 'candidate', 'decision']) { const e = M.E[k]; if (!can(u, e, 'r')) continue; for (const x of (await C.list(k, u, { q: s, limit: 5 })).rows) out.push({ ent: k, id: x.id, label: x.full_name || x.no || x.name || x.code, sub: `${e.title}${x.code ? ' · ' + x.code : ''}` }); }
  send(res, 200, out.slice(0, 20));
});
r('GET', '/api/issues', async (req, res, u) => { need(u, M.HC); send(res, 200, await q("SELECT * FROM hr_issue ORDER BY CASE severity WHEN 'mau_thuan' THEN 0 WHEN 'can_cap_nhat' THEN 1 WHEN 'thong_tin' THEN 2 ELSE 3 END, id")); });
r('GET', '/api/jobs', async (req, res, u) => { need(u, M.HC); send(res, 200, await q('SELECT * FROM hr_job ORDER BY at DESC LIMIT 50')); });
r('GET', '/api/audit', async (req, res, u) => { need(u, M.TP); send(res, 200, await q('SELECT a.*, u.full_name AS by FROM hr_audit a LEFT JOIN hr_user u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 300')); });
r('GET', '/api/settings', async (req, res, u) => { need(u, M.TP); send(res, 200, Object.fromEntries((await q('SELECT key,value FROM hr_setting')).map(x => [x.key, x.value]))); });
r('PUT', '/api/settings/:k', async (req, res, u, p) => { need(u, M.TP); await q('UPDATE hr_setting SET value=$1, updated_at=now(), updated_by=$2 WHERE key=$3', [JSON.stringify(await readJson(req)), u.id, p.k]); await C.audit({ q }, 'setting', null, 'sua_cau_hinh', null, null, u, p.k); send(res, 200, { ok: true }); });
r('GET', '/api/org', async (req, res, u) => send(res, 200, { depts: await q(`SELECT d.id, d.code, d.name, d.block, d.parent_id, e.full_name head, (SELECT count(*) FROM hr_employee x WHERE x.dept_id=d.id AND x.state<>'da_nghi') n FROM hr_dept d LEFT JOIN hr_employee e ON e.id=d.head_id ORDER BY d.block, d.name`), legal: await q("SELECT l.short, count(e.id) n FROM hr_legal l LEFT JOIN hr_employee e ON e.legal_id=l.id AND e.state<>'da_nghi' GROUP BY 1 ORDER BY 2 DESC"), unassigned: await q("SELECT full_name, title FROM hr_employee WHERE dept_id IS NULL AND state<>'da_nghi'") }));
r('GET', '/api/timesheet', async (req, res, u, p, qs) => {
  const m = qs.month || C.today().slice(0, 7), w = [], pr = [m + '-31'.replace('31', B.lastDay(m).slice(8))]; const a = (s, ...v) => { let i = 0; w.push(s.replace(/\$(\d+)/g, () => '$' + (pr.push(v[i++]), pr.length))); };
  if (qs.legal) a('t.legal_id=$1', +qs.legal); if (qs.dept) a('t.dept_id=$1', +qs.dept); C.scopeSql(M.E.employee, u, a);
  const emps = await q(`SELECT t.id, t.code, t.full_name FROM hr_employee t WHERE t.join_on <= $1 AND t.state<>'da_nghi' ${w.length ? 'AND ' + w.join(' AND ') : ''} ORDER BY t.full_name`, pr);
  send(res, 200, { emps, att: await B.monthAtt({ q }, m), hol: [...await B.holidays({ q })].filter(d => d.startsWith(m)), last: +B.lastDay(m).slice(8), locked: (await q("SELECT legal_id FROM hr_att_period WHERE month=$1 AND status='khoa'", [m])).length, types: await q('SELECT code, name FROM hr_att_type ORDER BY grp, id') });
});
r('PUT', '/api/timesheet', async (req, res, u) => { need(u, M.NS); const b = await readJson(req); if (b.mark) await B.setMark({ q, one }, +b.emp_id, b.day, b.mark, {}, 'hcns'); else await q('DELETE FROM hr_attendance WHERE emp_id=$1 AND day=$2', [+b.emp_id, b.day]); await C.audit({ q }, 'attendance', +b.emp_id, 'sua_cong', null, null, u, `${b.day}: ${b.mark || 'xóa'}`); send(res, 200, { ok: true }); });
r('GET', '/api/sheet/:ent/:id', async (req, res, u, p) => { const g = await C.get(p.ent, p.id, u); send(res, 200, g.row); });
r('PUT', '/api/payroll/:id/line/:emp', async (req, res, u, p) => { need(u, M.NS); await tx(async db => { const x = notFound(await db.one('SELECT * FROM hr_payroll WHERE id=$1 FOR UPDATE', [+p.id])); await B.editPayLine(db, x, +p.emp, await readJson(req)); }); send(res, 200, { ok: true }); });
r('POST', '/api/vpp/buy', async (req, res, u) => {   // tổng hợp đề xuất đã duyệt + hàng dưới định mức → nháp phiếu nhập kho
  need(u, M.HC); const b = await readJson(req), legal = +b.legal_id || bad('Chọn pháp nhân'), st = await B.vppStock({ q }, legal), want = {};
  for (const n of await q('SELECT item_code, min_qty FROM hr_vpp_norm WHERE legal_id=$1', [legal])) { const g = +n.min_qty - (st[n.item_code] || 0); if (g > 0) want[n.item_code] = g; }
  for (const r2 of await q("SELECT lines FROM hr_vpp_req WHERE legal_id=$1 AND status='da_duyet'", [legal])) for (const l of r2.lines || []) { const g = B.n(l.qty) - (st[l.code] || 0); if (g > 0) want[l.code] = Math.max(want[l.code] || 0, g); }
  const items = Object.fromEntries((await q('SELECT code,name,unit FROM hr_vpp_item')).map(i => [i.code, i])), lines = Object.entries(want).map(([c, v]) => ({ code: c, name: items[c]?.name, unit: items[c]?.unit, qty: String(v), note: '' }));
  if (!lines.length) bad('Không có mặt hàng nào cần mua');
  send(res, 200, await C.create('vpp_in', { legal_id: legal, supplier: 'Nháp từ đề xuất & định mức', in_on: C.today(), lines }, u));
});
r('POST', '/api/contract/:id/renew', async (req, res, u, p) => {   // một chạm: sinh HĐ kế tiếp từ HĐ sắp hết hạn
  need(u, M.NS); const c = notFound(await one('SELECT * FROM hr_contract WHERE id=$1', [+p.id])), b = await readJson(req), from = C.addDays(c.to_on || C.today(), 1), kind = b.kind || (c.kind === 'HD01' ? 'HD02' : 'HD03');
  const e = await one('SELECT code FROM hr_employee WHERE id=$1', [c.emp_id]), yr = from.slice(0, 4), to = kind === 'HD02' ? `${+yr + (b.years || 1)}${from.slice(4)}` : null;
  send(res, 200, await C.create('contract', { emp_id: c.emp_id, legal_id: c.legal_id, kind, no: `${e.code}/${yr}/${kind}`, from_on: from, to_on: to && C.addDays(to, -1), title: c.title, salary: c.salary }, u));
});
r('GET', '/api/gov/:name', async (req, res, u, p) => { need(u, M.NS); const n = path.basename(decodeURIComponent(p.name)), f = path.join(DATA, 'templates', n); if (!fs.existsSync(f)) notFound(null, 'mẫu'); sendFile(res, fs.readFileSync(f), n, 'application/octet-stream'); });
r('GET', '/api/gov-files', async (req, res) => send(res, 200, fs.readdirSync(path.join(DATA, 'templates'))));
r('POST', '/api/demo/clear', async (req, res, u) => { need(u, M.TP); for (const e of Object.values(M.E).reverse()) await q(`DELETE FROM ${e.table} WHERE is_demo`); await q('DELETE FROM hr_approval WHERE is_demo'); await q("DELETE FROM hr_payroll WHERE status = 'nhap'"); await q("DELETE FROM hr_job WHERE name = 'nhap_luong'"); await J.tick(); send(res, 200, { ok: true }); });
// in
r('GET', '/print/:ent/:id', async (req, res, u, p, qs) => html(res, await P.form(p.ent, p.id, u), qs, p.ent + '-' + p.id));
r('GET', '/print-report/:code', async (req, res, u, p, qs) => { const c = decodeURIComponent(p.code); html(res, P.report(await V.report(c, qs, u), qs), qs, c); });
r('GET', '/print-payslip/:id', async (req, res, u, p, qs) => {
  const x = notFound(await one('SELECT t.*, l.name lg FROM hr_payroll t JOIN hr_legal l ON l.id=t.legal_id WHERE t.id=$1', [+p.id]));
  const ls = (x.lines || []).filter(l => M.PAY_ROLES.includes(u.role) ? (!qs.emp || l.emp_id === +qs.emp) : l.emp_id === u.emp_id); if (!ls.length) deny();
  await C.audit({ q }, 'payroll', x.id, 'in_phieu_luong', null, null, u); html(res, P.page('TL03', ls.map(l => P.payslip(x, l, x.lg)).join('')), qs, 'phieu-luong');
});
r('GET', '/print-bank/:id', async (req, res, u, p, qs) => { need(u, [...M.NS, 'ke_toan']); const x = notFound(await one('SELECT * FROM hr_payroll WHERE id=$1', [+p.id])); html(res, P.bank(x, await one('SELECT name FROM hr_legal WHERE id=$1', [x.legal_id])), qs, 'chuyen-khoan'); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), qs = Object.fromEntries(url.searchParams), pathn = decodeURI(url.pathname);
  try {
    if (pathn.startsWith('/api/') || pathn.startsWith('/print')) {
      for (const rt of routes) { if (rt.method !== req.method) continue; const m = rt.re.exec(url.pathname); if (!m) continue;
        const u = rt.open ? null : await userFromReq(req); if (!rt.open && !u) throw new HttpError(401, 'Cần đăng nhập');
        return await rt.fn(req, res, u, m.groups || {}, qs); }
      throw new HttpError(404, 'Không có đường dẫn này');
    }
    const f = path.normalize(path.join(PUBLIC, pathn === '/' ? 'index.html' : pathn)); if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Không tìm thấy', { 'Content-Type': 'text/plain; charset=utf-8' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  } catch (e) { if (!(e instanceof HttpError)) console.error(e); if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Lỗi máy chủ: ' + e.message, fields: e.fields }); }
});
(async () => { await migrate({ q, one }); J.start(); server.listen(PORT, HOST, () => console.log(`CTG-HCNS: http://localhost:${PORT}`)); })().catch(e => { console.error(e); process.exit(1); });

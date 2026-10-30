// Bản demo GitHub Pages: chạy nguyên máy chủ (server/*.js) trong trình duyệt trên PGlite,
// chặn fetch('/api/…') của giao diện để gọi thẳng handle() thay vì qua mạng.
const pgShim = require('./shims/pg');
const fsShim = require('./shims/fs');
const say = t => { const el = document.getElementById('bootmsg'); if (el) el.textContent = t; };
const SID_KEY = 'ctg-hcns-demo-sid', DB = 'ctg-hcns-demo';
let sid = null;
try { sid = localStorage.getItem(SID_KEY); } catch {}

function fakeReq(method, url, headers, body) {
  const h = {}; let fired = false;
  const req = {
    method, url, headers: { ...headers, cookie: sid ? `hr_sid=${sid}` : '' },
    on(ev, fn) {
      (h[ev] ||= []).push(fn);
      if (ev === 'end' && !fired) {
        fired = true;
        setTimeout(() => { if (typeof body === 'string' && body.length) (h.data || []).forEach(f => f(Buffer.from(body, 'utf8'))); (h.end || []).forEach(f => f()); }, 0);
      }
      return req;
    },
    pipe(bb) { bb._run(body instanceof FormData ? body : new FormData()); return bb; },
    destroy() {},
  };
  return req;
}
function fakeRes(done) {
  let status = 200, head = {};
  return {
    headersSent: false,
    writeHead(s, hd = {}) { status = s; head = hd; this.headersSent = true; },
    setHeader(k, v) { head[k] = v; },
    end(body) {
      const ck = head['Set-Cookie'];
      if (ck) { const m = /hr_sid=([^;]*)/.exec(ck); sid = m && m[1] ? m[1] : null; try { sid ? localStorage.setItem(SID_KEY, sid) : localStorage.removeItem(SID_KEY); } catch {} }
      const hs = new Headers();
      for (const [k, v] of Object.entries(head)) if (k !== 'Set-Cookie') hs.set(k, encodeURI(String(v)));
      const b = body == null || body === '' ? null : typeof body === 'string' ? body : new Uint8Array(body);
      done(new Response([204, 304].includes(status) ? null : b, { status, headers: hs }));
    },
  };
}
const isApi = u => typeof u === 'string' && (u.startsWith('/api/') || u.startsWith('/print'));

async function boot(pgliteUrl) {
  say('Đang khởi tạo cơ sở dữ liệu trong trình duyệt…');
  const { PGlite } = await import(pgliteUrl);
  const ts = v => v == null ? null : new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();
  const num = v => v == null ? null : +v;
  const pg = await PGlite.create('idb://' + DB, { relaxedDurability: true, parsers: { 1082: v => v, 1700: num, 1184: ts, 20: num } });
  await pg.exec("SET TIME ZONE 'Asia/Bangkok'");
  pgShim.setDb(Promise.resolve(pg));
  await fsShim.loadFiles();
  const { one, q } = require('../server/db');
  const { migrate } = require('../server/schema');
  await migrate({ q, one });
  if (!(await one('SELECT count(*) n FROM hr_user')).n) {
    say('Lần đầu mở: đang nạp dữ liệu mẫu (khoảng 1 phút)…');
    await require('../server/seed');
    if (!(await one('SELECT count(*) n FROM hr_user')).n) throw new Error('Không nạp được dữ liệu mẫu');
  }
  const J = require('../server/jobs');
  await J.tick();
  const { handle } = require('../server/server');
  const call = (method, url, headers, body) => new Promise((ok, fail) => { Promise.resolve(handle(fakeReq(method, url, headers, body), fakeRes(ok))).catch(fail); });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isApi(url)) return realFetch(input, init);
    const hd = {}; new Headers(init.headers || {}).forEach((v, k) => { hd[k] = v; });
    return call((init.method || 'GET').toUpperCase(), url, hd, init.body);
  };
  // mở / tải tệp từ /api/… và /print… (in, xuất Excel qua link)
  const openBlob = async (url, win, dlName) => {
    try {
      const r = await window.fetch(url);
      const href = URL.createObjectURL(await r.blob());
      if (dlName) { const a = document.createElement('a'); a.href = href; a.download = dlName; document.body.append(a); a.click(); a.remove(); win && win.close(); }
      else if (win) win.location.href = href; else location.href = href;
      setTimeout(() => URL.revokeObjectURL(href), 12e4);
    } catch (e) { win && win.close(); alert(e.message); }
  };
  const realOpen = window.open.bind(window);
  window.open = (url, target, feat) => { if (!isApi(url)) return realOpen(url, target, feat); const w = realOpen('about:blank', target || '_blank', feat); openBlob(url, w); return w; };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href'); if (!isApi(href)) return;
    e.preventDefault();
    if (a.hasAttribute('download') || /xlsx|[?&]dl=1|[?&]fmt=doc/.test(href)) openBlob(href, null, a.getAttribute('download') || href.split('?')[0].split('/').pop() + (/fmt=doc/.test(href) ? '.doc' : '.xlsx'));
    else openBlob(href, realOpen('about:blank', '_blank'));
  }, true);
  window.__ctgReset = async () => {
    if (!confirm('Xóa toàn bộ dữ liệu demo trên trình duyệt này và nạp lại từ đầu?')) return;
    await pg.close();
    indexedDB.deleteDatabase('/pglite/' + DB); indexedDB.deleteDatabase('ctg-hcns-files');
    try { localStorage.removeItem(SID_KEY); } catch {}
    setTimeout(() => location.reload(), 500);
  };
  say('Đang mở giao diện…');
}
window.__ctgBoot = boot;

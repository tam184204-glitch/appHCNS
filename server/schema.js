// Tạo / cập nhật cấu trúc CSDL từ meta.js. Chạy mỗi lần khởi động, chạy lại bao nhiêu lần cũng được:
// bảng thiếu thì tạo, cột thiếu thì thêm. Không bao giờ xóa cột hay bảng đang có dữ liệu.
const { E, ROLES, SETTINGS } = require('./meta');
const SQLT = { text: 'text', long: 'text', sel: 'text', month: 'text', code: 'text', int: 'integer', num: 'numeric', money: 'numeric(18,0)',
  date: 'date', dt: 'timestamptz', ref: 'integer', user: 'integer', bool: 'boolean', json: 'jsonb', days: 'jsonb', multi: 'jsonb' };
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const BASE = `
CREATE TABLE IF NOT EXISTS hr_user (
  id serial PRIMARY KEY, username text NOT NULL, full_name text NOT NULL,
  role text NOT NULL CHECK (role IN (${ROLES.map(r => lit(r[0])).join(',')})),
  emp_id integer, dept_id integer, legal_ids integer[], title text, active boolean NOT NULL DEFAULT true,
  pw_hash text, must_change boolean NOT NULL DEFAULT true, last_login timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS hr_user_username ON hr_user (lower(username));
CREATE TABLE IF NOT EXISTS hr_session (sid text PRIMARY KEY, user_id integer NOT NULL REFERENCES hr_user(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS hr_setting (key text PRIMARY KEY, value jsonb, updated_at timestamptz DEFAULT now(), updated_by integer);
CREATE TABLE IF NOT EXISTS hr_counter (prefix text PRIMARY KEY, n integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS hr_file (id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, kind text, name text NOT NULL, mime text, size integer, path text NOT NULL, version integer NOT NULL DEFAULT 1,
  uploaded_by integer REFERENCES hr_user(id), uploaded_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deleted_by integer, is_demo boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS hr_file_rec ON hr_file (ent, rec_id);
CREATE TABLE IF NOT EXISTS hr_note (id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, body text NOT NULL, by integer REFERENCES hr_user(id), at timestamptz NOT NULL DEFAULT now(), is_demo boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS hr_audit (id bigserial PRIMARY KEY, ent text NOT NULL, rec_id integer, action text NOT NULL, before jsonb, after jsonb, user_id integer REFERENCES hr_user(id), at timestamptz NOT NULL DEFAULT now(), note text, is_demo boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS hr_audit_rec ON hr_audit (ent, rec_id);
CREATE INDEX IF NOT EXISTS hr_audit_at ON hr_audit (at DESC);
CREATE TABLE IF NOT EXISTS hr_approval (id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, title text, roles text[] NOT NULL, approver_id integer REFERENCES hr_user(id),
  status text NOT NULL DEFAULT 'cho_duyet' CHECK (status IN ('cho_duyet','da_duyet','tu_choi','huy')), requested_by integer REFERENCES hr_user(id), requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by integer REFERENCES hr_user(id), decided_at timestamptz, comment text, is_demo boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX IF NOT EXISTS hr_approval_one_open ON hr_approval (ent, rec_id) WHERE status = 'cho_duyet';
CREATE TABLE IF NOT EXISTS hr_alert_state (key text PRIMARY KEY, state text NOT NULL, note text, by integer REFERENCES hr_user(id), at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hr_snapshot (id serial PRIMARY KEY, code text NOT NULL, period text NOT NULL, filters jsonb, data jsonb NOT NULL, version integer NOT NULL, closed_by integer REFERENCES hr_user(id), closed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hr_issue (id serial PRIMARY KEY, src text NOT NULL, severity text NOT NULL, title text NOT NULL, detail text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hr_job (id serial PRIMARY KEY, name text NOT NULL, period text NOT NULL, result text, at timestamptz NOT NULL DEFAULT now(), UNIQUE (name, period));
`;
async function migrate(db) {
  await db.q(BASE);
  const cols = new Map();
  for (const r of await db.q("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name LIKE 'hr\\_%'"))
    (cols.get(r.table_name) || cols.set(r.table_name, new Set()).get(r.table_name)).add(r.column_name);
  for (const e of Object.values(E)) {
    const t = e.table, have = cols.get(t);
    const defs = e.fields.map(f => `${f.k} ${SQLT[f.t]}${f.t === 'bool' ? ` DEFAULT ${f.def === true}` : ''}`);
    if (!have) await db.q(`CREATE TABLE ${t} (id serial PRIMARY KEY, ${defs.join(', ')}, is_demo boolean NOT NULL DEFAULT false, created_by integer, created_at timestamptz NOT NULL DEFAULT now(), updated_by integer, updated_at timestamptz)`);
    else for (const f of e.fields) if (!have.has(f.k)) await db.q(`ALTER TABLE ${t} ADD COLUMN ${f.k} ${SQLT[f.t]}`);
  }
  for (const e of Object.values(E)) {
    const t = e.table;
    for (const c of await db.q(`SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND conname LIKE 'fk\\_%'`, [t])) await db.q(`ALTER TABLE ${t} DROP CONSTRAINT ${c.conname}`);
    const add = e.fields.filter(f => f.t === 'ref').map(f => `ADD CONSTRAINT fk_${t}_${f.k} FOREIGN KEY (${f.k}) REFERENCES ${E[f.ref].table}(id) ON DELETE RESTRICT`);
    if (add.length) await db.q(`ALTER TABLE ${t} ${add.join(', ')}`);
    for (const f of e.fields.filter(f => f.uniq || f.t === 'code')) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${f.k}_uq ON ${t} (${f.k})`);
    for (const u of e.uniq || []) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${u.join('_')}_uq ON ${t} (${u.join(', ')})`);
    for (const f of e.fields.filter(f => f.t === 'ref' || f.k === 'status')) await db.q(`CREATE INDEX IF NOT EXISTS ${t}_${f.k}_ix ON ${t} (${f.k})`);
  }
  for (const [k, v] of Object.entries(SETTINGS)) await db.q('INSERT INTO hr_setting (key, value) VALUES ($1,$2) ON CONFLICT DO NOTHING', [k, JSON.stringify(v)]);
}
module.exports = { migrate };

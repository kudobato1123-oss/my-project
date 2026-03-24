const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

// ─── CẤU HÌNH ────────────────────────────────────────────────
const PLAN_PASSWORD = 'matkhau123'; // ← ĐỔI MẬT KHẨU TẠI ĐÂY
const fe = path.join(__dirname, '../frontend');
const dbPath = path.join(__dirname, '../data/production.db');

// ─── DATABASE ────────────────────────────────────────────────
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS lines (
    line_code TEXT PRIMARY KEY, line_name TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS styles (
    style_code TEXT, buyer TEXT, product_type TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    style_code TEXT, buyer TEXT, product_type TEXT,
    lot_name TEXT, start_date TEXT, end_date TEXT,
    planned_qty INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS production (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, line_code TEXT NOT NULL,
    style_code TEXT NOT NULL, lot_name TEXT NOT NULL,
    output INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reason_types (
    reason_code TEXT PRIMARY KEY, reason_name TEXT,
    reason_group TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, line_code TEXT NOT NULL,
    reason_code TEXT NOT NULL, time_start TEXT NOT NULL,
    time_end TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
    note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed dữ liệu mặc định
[['10','Chuyền 10'],['11','Chuyền 11'],['12','Chuyền 12'],['13','Chuyền 13'],
 ['14','Chuyền 14'],['15','Chuyền 15'],['16','Chuyền 16'],['17','Chuyền 17'],
 ['18','Chuyền 18'],['19','Chuyền 19']
].forEach(([c,n]) => db.prepare(`INSERT OR IGNORE INTO lines VALUES (?,?,'active')`).run(c,n));

[['70645','puma','T-shirt'],['70639','puma','T-shirt'],['70640','puma','T-shirt'],
 ['70641','puma','jacket'],['70643','puma','polo'],['70644','puma','T-shirt'],
 ['70469','puma','hoody'],['70470','puma','polo'],['70477','puma','polo'],
 ['70478','puma','polo'],['70479','puma','polo'],['70480','puma','polo'],
 ['69401','alo','quần'],['70294','alo','quần']
].forEach(([c,b,t]) => db.prepare(`INSERT OR IGNORE INTO styles VALUES (?,?,?,'active')`).run(c,b,t));

db.prepare(`INSERT OR IGNORE INTO lots (style_code,buyer,product_type,lot_name,start_date,end_date) VALUES (?,?,?,?,?,?)`)
  .run('70645','puma','T-shirt','lô 1','2026-03-10','2026-03-30');
db.prepare(`INSERT OR IGNORE INTO lots (style_code,buyer,product_type,lot_name,start_date,end_date) VALUES (?,?,?,?,?,?)`)
  .run('70645','puma','T-shirt','lô 2','2026-04-01','2026-04-25');

[['NPL01','Thiếu NPL','NGUYÊN PHỤ LIỆU'],
 ['NPL02','NPL lỗi','NGUYÊN PHỤ LIỆU'],
 ['NPL03','NPL giao muộn','NGUYÊN PHỤ LIỆU'],
 ['NPL04','Bán thành phẩm chưa cấp','NGUYÊN PHỤ LIỆU'],
 ['CN01','Công nhân nghỉ','NHÂN LỰC'],
 ['CN02','Công nhân mới','NHÂN LỰC'],
 ['CN03','Tay nghề chưa đạt','NHÂN LỰC'],
 ['BT01','Chờ sửa máy','MÁY MÓC'],
 ['BT02','Thiếu máy','MÁY MÓC']
].forEach(([c,n,g]) => db.prepare(`INSERT OR IGNORE INTO reason_types VALUES (?,?,?,'active')`).run(c,n,g));

// ─── HELPER ──────────────────────────────────────────────────
function getCookies(req) {
  const result = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) result[c.slice(0, idx).trim()] = c.slice(idx + 1).trim();
  });
  return result;
}

function dateWhere(from, to, alias) {
  return from && to ? ` AND ${alias}.date BETWEEN ? AND ?` : '';
}
function dateParams(from, to) {
  return from && to ? [from, to] : [];
}

// ─── API ROUTES (dùng chung cho cả 3 port) ───────────────────
function registerApiRoutes(app) {
  app.get('/api/lines', (_, res) =>
    res.json(db.prepare(`SELECT * FROM lines WHERE status='active' ORDER BY line_code`).all()));

  app.get('/api/styles', (_, res) =>
    res.json(db.prepare(`SELECT DISTINCT style_code,buyer,product_type FROM styles WHERE status='active' ORDER BY style_code`).all()));

  app.get('/api/lots/:style_code', (req, res) =>
    res.json(db.prepare(`SELECT * FROM lots WHERE style_code=? ORDER BY start_date`).all(req.params.style_code)));

  app.post('/api/production', (req, res) => {
    const { date, line_code, style_code, lot_name, output } = req.body;
    if (!date || !line_code || !style_code || !lot_name || output === undefined)
      return res.status(400).json({ error: 'Thiếu dữ liệu' });
    const r = db.prepare(`INSERT INTO production (date,line_code,style_code,lot_name,output) VALUES (?,?,?,?,?)`)
      .run(date, line_code, style_code, lot_name, output);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  app.get('/api/production/recent', (_, res) =>
    res.json(db.prepare(`
      SELECT p.*, l.line_name, s.buyer, s.product_type
      FROM production p
      LEFT JOIN lines l ON p.line_code=l.line_code
      LEFT JOIN styles s ON p.style_code=s.style_code
      ORDER BY p.created_at DESC LIMIT 20
    `).all()));

  app.delete('/api/production/:id', (req, res) => {
    db.prepare(`DELETE FROM production WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/reasons', (_, res) =>
    res.json(db.prepare(`SELECT * FROM reason_types WHERE status='active' ORDER BY reason_group,reason_code`).all()));

  app.post('/api/incidents', (req, res) => {
    const { date, line_code, reason_code, time_start, time_end, note } = req.body;
    if (!date || !line_code || !reason_code || !time_start || !time_end)
      return res.status(400).json({ error: 'Thiếu dữ liệu' });
    const [sh, sm] = time_start.split(':').map(Number);
    const [eh, em] = time_end.split(':').map(Number);
    const dur = (eh * 60 + em) - (sh * 60 + sm);
    if (dur <= 0) return res.status(400).json({ error: 'Giờ kết thúc phải sau giờ bắt đầu' });
    const r = db.prepare(`INSERT INTO incidents (date,line_code,reason_code,time_start,time_end,duration_minutes,note) VALUES (?,?,?,?,?,?,?)`)
      .run(date, line_code, reason_code, time_start, time_end, dur, note || '');
    res.json({ success: true, id: r.lastInsertRowid, duration_minutes: dur });
  });

  app.get('/api/incidents/recent', (_, res) =>
    res.json(db.prepare(`
      SELECT i.*, l.line_name, r.reason_name, r.reason_group
      FROM incidents i
      LEFT JOIN lines l ON i.line_code=l.line_code
      LEFT JOIN reason_types r ON i.reason_code=r.reason_code
      ORDER BY i.date DESC, i.time_start DESC LIMIT 30
    `).all()));

  app.delete('/api/incidents/:id', (req, res) => {
    db.prepare(`DELETE FROM incidents WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/report/by-date', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT date, SUM(output) as total FROM production WHERE 1=1${from&&to?' AND date BETWEEN ? AND ?':''} GROUP BY date ORDER BY date DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/report/by-month', (_, res) =>
    res.json(db.prepare(`SELECT strftime('%Y-%m',date) as month, SUM(output) as total FROM production GROUP BY month ORDER BY month DESC`).all()));

  app.get('/api/report/by-line', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT p.line_code, l.line_name, SUM(p.output) as total FROM production p LEFT JOIN lines l ON p.line_code=l.line_code WHERE 1=1${dateWhere(from,to,'p')} GROUP BY p.line_code ORDER BY total DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/report/by-style', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT p.style_code, s.buyer, s.product_type, SUM(p.output) as total FROM production p LEFT JOIN styles s ON p.style_code=s.style_code WHERE 1=1${dateWhere(from,to,'p')} GROUP BY p.style_code ORDER BY total DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/report/incidents-by-reason', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT i.reason_code, r.reason_name, r.reason_group, SUM(i.duration_minutes) as total_minutes, COUNT(*) as occurrences FROM incidents i LEFT JOIN reason_types r ON i.reason_code=r.reason_code WHERE 1=1${dateWhere(from,to,'i')} GROUP BY i.reason_code ORDER BY total_minutes DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/report/incidents-by-line', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT i.line_code, l.line_name, SUM(i.duration_minutes) as total_minutes, COUNT(*) as occurrences FROM incidents i LEFT JOIN lines l ON i.line_code=l.line_code WHERE 1=1${dateWhere(from,to,'i')} GROUP BY i.line_code ORDER BY total_minutes DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/report/incidents-detail', (req, res) => {
    const { from, to } = req.query;
    res.json(db.prepare(`SELECT i.*, l.line_name, r.reason_name, r.reason_group FROM incidents i LEFT JOIN lines l ON i.line_code=l.line_code LEFT JOIN reason_types r ON i.reason_code=r.reason_code WHERE 1=1${dateWhere(from,to,'i')} ORDER BY i.date DESC, i.time_start DESC`).all(...dateParams(from, to)));
  });

  app.get('/api/lines/all', (_, res) =>
    res.json(db.prepare(`SELECT * FROM lines ORDER BY line_code`).all()));
  app.post('/api/lines', (req, res) => {
    const { line_code, line_name, status } = req.body;
    try { db.prepare(`INSERT INTO lines VALUES (?,?,?)`).run(line_code, line_name, status || 'active'); res.json({ success: true }); }
    catch(e) { res.json({ error: 'Mã chuyền đã tồn tại' }); }
  });
  app.put('/api/lines/:code', (req, res) => {
    db.prepare(`UPDATE lines SET line_name=?,status=? WHERE line_code=?`).run(req.body.line_name, req.body.status, req.params.code);
    res.json({ success: true });
  });
  app.delete('/api/lines/:code', (req, res) => {
    db.prepare(`DELETE FROM lines WHERE line_code=?`).run(req.params.code);
    res.json({ success: true });
  });

  app.get('/api/styles/all', (_, res) =>
    res.json(db.prepare(`SELECT rowid as id, * FROM styles ORDER BY style_code`).all()));
  app.post('/api/styles', (req, res) => {
    const { style_code, buyer, product_type, status } = req.body;
    try { db.prepare(`INSERT INTO styles VALUES (?,?,?,?)`).run(style_code, buyer, product_type || '', status || 'active'); res.json({ success: true }); }
    catch(e) { res.json({ error: e.message }); }
  });
  app.put('/api/styles/:code', (req, res) => {
    db.prepare(`UPDATE styles SET buyer=?,product_type=?,status=? WHERE style_code=?`).run(req.body.buyer, req.body.product_type, req.body.status, req.params.code);
    res.json({ success: true });
  });
  app.delete('/api/styles/:code', (req, res) => {
    db.prepare(`DELETE FROM styles WHERE style_code=?`).run(req.params.code);
    res.json({ success: true });
  });

  app.get('/api/lots/all', (req, res) => {
    const { style } = req.query;
    let sql = `SELECT l.*, s.buyer, s.product_type FROM lots l LEFT JOIN styles s ON l.style_code=s.style_code`;
    const p = [];
    if (style) { sql += ` WHERE l.style_code=?`; p.push(style); }
    sql += ` ORDER BY l.start_date DESC`;
    res.json(db.prepare(sql).all(...p));
  });
  app.post('/api/lots', (req, res) => {
    const { style_code, lot_name, start_date, end_date, planned_qty } = req.body;
    if (!style_code || !lot_name) return res.status(400).json({ error: 'Thiếu thông tin' });
    const r = db.prepare(`INSERT INTO lots (style_code,lot_name,start_date,end_date,planned_qty) VALUES (?,?,?,?,?)`)
      .run(style_code, lot_name, start_date || '', end_date || '', planned_qty || 0);
    res.json({ success: true, id: r.lastInsertRowid });
  });
  app.put('/api/lots/:id', (req, res) => {
    db.prepare(`UPDATE lots SET lot_name=?,start_date=?,end_date=?,planned_qty=? WHERE id=?`)
      .run(req.body.lot_name, req.body.start_date || '', req.body.end_date || '', req.body.planned_qty || 0, req.params.id);
    res.json({ success: true });
  });
  app.delete('/api/lots/:id', (req, res) => {
    db.prepare(`DELETE FROM lots WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/import', (req, res) => {
    const { lines, styles, lots } = req.body;
    let lC = 0, sC = 0, loC = 0;
    lines.forEach(l => { db.prepare(`INSERT OR REPLACE INTO lines VALUES (?,?,?)`).run(l.line_code, l.line_name, l.status); lC++; });
    styles.forEach(s => { db.prepare(`INSERT OR IGNORE INTO styles VALUES (?,?,?,?)`).run(s.style_code, s.buyer, s.product_type, s.status); sC++; });
    lots.forEach(l => { db.prepare(`INSERT INTO lots (style_code,lot_name,start_date,end_date,planned_qty) VALUES (?,?,?,?,?)`).run(l.style_code, l.lot_name, l.start_date || '', l.end_date || '', 0); loC++; });
    res.json({ success: true, lines: lC, styles: sC, lots: loC });
  });
}

// ═══════════════════════════════════════════════════════════════
// PORT 3000 — CHỈ form.html
// ═══════════════════════════════════════════════════════════════
const app3000 = express();
app3000.use(express.json());
registerApiRoutes(app3000);

// Chặn plan và dashboard
app3000.get('/plan.html', (_, res) => res.status(403).send('Không có quyền truy cập'));
app3000.get('/dashboard.html', (_, res) => res.status(403).send('Không có quyền truy cập'));

// Chỉ phục vụ form.html và các file liên quan
app3000.get('/', (_, res) => res.sendFile(path.join(fe, 'form.html')));
app3000.get('/form.html', (_, res) => res.sendFile(path.join(fe, 'form.html')));

app3000.listen(3000, '0.0.0.0', () => console.log('✅ Form running on port 3000'));

// ═══════════════════════════════════════════════════════════════
// PORT 3002 — CHỈ plan.html, YÊU CẦU MẬT KHẨU
// ═══════════════════════════════════════════════════════════════

// Xóa session cũ hơn 8 tiếng
db.prepare(`DELETE FROM sessions WHERE created_at < datetime('now','-8 hours')`).run();

const app3002 = express();
app3002.use(express.json());

// API login — KHÔNG cần xác thực
app3002.post('/api/login', (req, res) => {
  if (req.body.password === PLAN_PASSWORD) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.prepare(`INSERT OR REPLACE INTO sessions (token) VALUES (?)`).run(token);
    res.setHeader('Set-Cookie', `plan_token=${token}; Path=/; Max-Age=28800; HttpOnly`);
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// Trang login — KHÔNG cần xác thực
app3002.get('/login.html', (_, res) => res.sendFile(path.join(fe, 'login.html')));
app3002.get('/', (_, res) => res.redirect('/login.html'));

// Middleware xác thực — chặn TẤT CẢ request khác
app3002.use((req, res, next) => {
  const cookies = getCookies(req);
  const token = cookies['plan_token'];
  if (!token) return res.redirect('/login.html');
  const session = db.prepare(`SELECT token FROM sessions WHERE token=?`).get(token);
  if (!session) return res.redirect('/login.html');
  next();
});

// Chặn form và dashboard
app3002.get('/form.html', (_, res) => res.status(403).send('Không có quyền truy cập'));
app3002.get('/dashboard.html', (_, res) => res.status(403).send('Không có quyền truy cập'));

// Chỉ phục vụ plan.html sau khi xác thực
app3002.get('/plan.html', (_, res) => res.sendFile(path.join(fe, 'plan.html')));
registerApiRoutes(app3002);

app3002.listen(3002, '0.0.0.0', () => console.log('✅ Plan running on port 3002'));

// ═══════════════════════════════════════════════════════════════
// PORT 3005 — CHỈ dashboard.html
// ═══════════════════════════════════════════════════════════════
const app3005 = express();
app3005.use(express.json());
registerApiRoutes(app3005);

// Chặn form và plan
app3005.get('/form.html', (_, res) => res.status(403).send('Không có quyền truy cập'));
app3005.get('/plan.html', (_, res) => res.status(403).send('Không có quyền truy cập'));

// Chỉ phục vụ dashboard.html
app3005.get('/', (_, res) => res.sendFile(path.join(fe, 'dashboard.html')));
app3005.get('/dashboard.html', (_, res) => res.sendFile(path.join(fe, 'dashboard.html')));

app3005.listen(3005, '0.0.0.0', () => console.log('✅ Dashboard running on port 3005'));

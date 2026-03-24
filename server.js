const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Init DB
const dbPath = path.join(__dirname, '../data/production.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS lines (
    line_code TEXT PRIMARY KEY,
    line_name TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS styles (
    style_code TEXT PRIMARY KEY,
    buyer TEXT,
    product_type TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    style_code TEXT,
    buyer TEXT,
    product_type TEXT,
    lot_name TEXT,
    start_date TEXT,
    end_date TEXT,
    UNIQUE(style_code, lot_name)
  );

  CREATE TABLE IF NOT EXISTS production (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    line_code TEXT NOT NULL,
    style_code TEXT NOT NULL,
    lot_name TEXT NOT NULL,
    output INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed master data from Excel (chạy 1 lần)
const lines = [
  ['10','Chuyền 10','active'],['11','Chuyền 11','active'],['12','Chuyền 12','active'],
  ['13','Chuyền 13','active'],['14','Chuyền 14','active'],['15','Chuyền 15','active'],
  ['16','Chuyền 16','active'],['17','Chuyền 17','active'],['18','Chuyền 18','active'],
  ['19','Chuyền 19','active']
];
const insertLine = db.prepare(`INSERT OR IGNORE INTO lines VALUES (?,?,?)`);
lines.forEach(l => insertLine.run(...l));

const styles = [
  ['70645','puma','T-shirt','active'],['70639','puma','T-shirt','active'],
  ['70640','puma','T-shirt','active'],['70641','puma','jacket','active'],
  ['70643','puma','polo','active'],['70644','puma','T-shirt','active'],
  ['70469','puma','hoody','active'],['70470','puma','polo','active'],
  ['70477','puma','polo','active'],['70478','puma','polo','active'],
  ['70479','puma','polo','active'],['70480','puma','polo','active'],
  ['69401','alo','quần','active'],['70294','alo','quần','active']
];
const insertStyle = db.prepare(`INSERT OR IGNORE INTO styles VALUES (?,?,?,?)`);
styles.forEach(s => insertStyle.run(...s));

const lots = [
  ['70645','puma','T-shirt','lô 1','2026-03-10','2026-03-30'],
  ['70645','puma','T-shirt','lô 2','2026-04-01','2026-04-25']
];
const insertLot = db.prepare(`INSERT OR IGNORE INTO lots (style_code,buyer,product_type,lot_name,start_date,end_date) VALUES (?,?,?,?,?,?)`);
lots.forEach(l => insertLot.run(...l));

// ─── API ROUTES ───────────────────────────────────────────────

// Lấy danh sách lines
app.get('/api/lines', (req, res) => {
  const rows = db.prepare(`SELECT * FROM lines WHERE status='active' ORDER BY line_code`).all();
  res.json(rows);
});

// Lấy danh sách styles
app.get('/api/styles', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT style_code, buyer, product_type FROM styles WHERE status='active' ORDER BY style_code`).all();
  res.json(rows);
});

// Lấy lô sx theo style
app.get('/api/lots/:style_code', (req, res) => {
  const rows = db.prepare(`SELECT * FROM lots WHERE style_code=? ORDER BY start_date`).all(req.params.style_code);
  res.json(rows);
});

// Lưu dữ liệu production
app.post('/api/production', (req, res) => {
  const { date, line_code, style_code, lot_name, output } = req.body;
  if (!date || !line_code || !style_code || !lot_name || output === undefined) {
    return res.status(400).json({ error: 'Thiếu dữ liệu' });
  }
  const stmt = db.prepare(`INSERT INTO production (date, line_code, style_code, lot_name, output) VALUES (?,?,?,?,?)`);
  const result = stmt.run(date, line_code, style_code, lot_name, output);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Lấy lịch sử nhập liệu gần đây
app.get('/api/production/recent', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, l.line_name, s.buyer, s.product_type
    FROM production p
    LEFT JOIN lines l ON p.line_code = l.line_code
    LEFT JOIN styles s ON p.style_code = s.style_code
    ORDER BY p.created_at DESC LIMIT 20
  `).all();
  res.json(rows);
});

// ─── DASHBOARD APIs ──────────────────────────────────────────

// Tổng sản lượng theo ngày
app.get('/api/report/by-date', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT date, SUM(output) as total FROM production`;
  const params = [];
  if (from && to) { sql += ` WHERE date BETWEEN ? AND ?`; params.push(from, to); }
  sql += ` GROUP BY date ORDER BY date DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Tổng sản lượng theo tháng
app.get('/api/report/by-month', (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(output) as total
    FROM production GROUP BY month ORDER BY month DESC
  `).all();
  res.json(rows);
});

// Sản lượng theo line
app.get('/api/report/by-line', (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT p.line_code, l.line_name, SUM(p.output) as total
    FROM production p LEFT JOIN lines l ON p.line_code = l.line_code
  `;
  const params = [];
  if (from && to) { sql += ` WHERE p.date BETWEEN ? AND ?`; params.push(from, to); }
  sql += ` GROUP BY p.line_code ORDER BY total DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Sản lượng theo style
app.get('/api/report/by-style', (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT p.style_code, s.buyer, s.product_type, SUM(p.output) as total
    FROM production p LEFT JOIN styles s ON p.style_code = s.style_code
  `;
  const params = [];
  if (from && to) { sql += ` WHERE p.date BETWEEN ? AND ?`; params.push(from, to); }
  sql += ` GROUP BY p.style_code ORDER BY total DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Xóa bản ghi
app.delete('/api/production/:id', (req, res) => {
  db.prepare(`DELETE FROM production WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

app.listen(3000, '0.0.0.0', () => console.log('✅ Server running on port 3000'));

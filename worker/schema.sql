-- Cấu trúc cơ sở dữ liệu D1 "phuocloc" (binding DB) của Worker phuocloc-api.
-- Lấy từ cơ sở dữ liệu đang chạy ngày 17/10/2026. Chỉ có cấu trúc bảng, KHÔNG có dữ liệu thành viên.
-- Dùng để dựng lại cơ sở dữ liệu khi cần (ví dụ bản thử nghiệm):
--   npx wrangler d1 execute <ten-csdl> --file=schema.sql
-- KHÔNG chạy file này lên cơ sở dữ liệu thật "phuocloc" (bảng đã tồn tại).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT,
  expires_at TEXT,
  chart_limit INTEGER,
  pdf_limit INTEGER,
  chart_used INTEGER NOT NULL DEFAULT 0,
  pdf_used INTEGER NOT NULL DEFAULT 0,
  max_devices INTEGER NOT NULL DEFAULT 2,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  last_login TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  fail_until TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ua TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS charts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chart_key TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  has_pdf INTEGER NOT NULL DEFAULT 0,
  png_count INTEGER NOT NULL DEFAULT 0,
  pdf_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  UNIQUE (user_id, chart_key)
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_charts_user ON charts (user_id, last_at);
CREATE INDEX IF NOT EXISTS idx_logs_at ON logs (at);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs (user_id, at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

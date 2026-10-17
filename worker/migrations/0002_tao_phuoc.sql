-- Migration 0002 — Tạo Phước (17/10/2026)
-- Chỉ THÊM, không xóa hay sửa dữ liệu cũ. Tài khoản hiện có giữ nguyên quyền Tử Vi & Tâm Không (apps = 'tuvi').
--   apps     : các dịch vụ tài khoản được dùng, cách nhau bằng dấu phẩy: 'tuvi' (Tử Vi + Tâm Không), 'taophuoc' (Tạo Phước)
--   tp_limit : số bộ bài Tạo Phước được tạo (NULL = không giới hạn)
--   tp_used  : số bộ bài Tạo Phước đã tạo
-- Bảng tp_docs: mỗi dòng là một bộ bài của một người đọc (tải lại không trừ lượt).

ALTER TABLE users ADD COLUMN apps TEXT NOT NULL DEFAULT 'tuvi';
ALTER TABLE users ADD COLUMN tp_limit INTEGER;
ALTER TABLE users ADD COLUMN tp_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tp_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  doc_key TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  dl_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  UNIQUE (user_id, doc_key)
);
CREATE INDEX IF NOT EXISTS idx_tp_docs_user ON tp_docs (user_id, last_at);

-- Bảng tp_assets: nội dung các bài tu Tạo Phước (mã tạo bài), KHÔNG để trong kho công khai.
-- Chỉ tài khoản có quyền Tạo Phước tải được qua /api/tp/engine. Bản gốc lưu trong Project "Phước Lộc Web" trên claude.ai.
CREATE TABLE IF NOT EXISTS tp_assets (
  name TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

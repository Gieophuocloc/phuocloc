/*
 * phuocloc-api — máy chủ tài khoản thành viên của phuocloc.vn (Cloudflare Worker + D1).
 * Mã này được lấy từ bản đang chạy trên Cloudflare ngày 17/10/2026 (bản đã nén, được định dạng lại cho dễ đọc).
 * Khóa bí mật SETUP_KEY không nằm trong mã: nó được lưu riêng trên Cloudflare (Settings → Variables and Secrets).
 */
const SESSION_DAYS = 30,
  PBKDF2_ITER = 1e5,
  MAX_FAILS = 8,
  LOCK_MINUTES = 15,
  ROLES = ['admin', 'manager', 'member'],
  // Dịch vụ: 'tuvi' = Tử Vi + Tâm Không (mặc định của mọi tài khoản cũ), 'taophuoc' = Tạo Phước (bài tu, bài đọc)
  APPS = ['tuvi', 'taophuoc'];
var index_default = {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      return (Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v)), res);
    } catch (e) {
      const status = e.status || 500;
      return (
        status === 500 && console.error((e && e.stack) || e),
        json(
          {
            ok: !1,
            error: e.code || 'server_error',
            message: e.status ? e.message : 'Lỗi máy chủ, vui lòng thử lại.',
          },
          status,
          cors,
        )
      );
    }
  },
};
async function route(req, env) {
  const url = new URL(req.url),
    p = url.pathname.replace(/\/+$/, '').replace(/^\/api/, '') || '/',
    m = req.method,
    ctx = { req, env, url, ip: req.headers.get('CF-Connecting-IP') || '' };
  if (p === '/ping') return json({ ok: !0, service: 'phuocloc-api' });
  if (p === '/setup' && m === 'POST') return setup(ctx);
  if (p === '/login' && m === 'POST') return login(ctx);
  const me = await auth(ctx);
  if (((ctx.me = me), p === '/logout' && m === 'POST')) return logout(ctx);
  if (p === '/me' && m === 'GET') return json({ ok: !0, user: publicUser(me) });
  if (p === '/password' && m === 'POST') return changeOwnPassword(ctx);
  if (p === '/chart' && m === 'POST') return useChart(ctx, 'chart');
  if (p === '/png' && m === 'POST') return useChart(ctx, 'png');
  if (p === '/pdf' && m === 'POST') return useChart(ctx, 'pdf');
  if (p === '/history' && m === 'GET')
    return hasApp(me, 'tuvi') ? history(ctx, me.id) : json({ ok: !0, items: [] });
  if (p === '/tp/doc' && m === 'POST') return useTp(ctx);
  if (p === '/tp/history' && m === 'GET') return (needApp(me, 'taophuoc'), tpHistory(ctx, me.id));
  if (p.startsWith('/admin/')) {
    if (me.role !== 'admin' && me.role !== 'manager')
      throw err(403, 'forbidden', 'Tài khoản không có quyền quản trị.');
    if (p === '/admin/users' && m === 'GET') return listUsers(ctx);
    if (p === '/admin/users' && m === 'POST') return createUser(ctx);
    let mm = p.match(/^\/admin\/users\/(\d+)$/);
    if (mm && m === 'PATCH') return updateUser(ctx, +mm[1]);
    if (mm && m === 'DELETE') return deleteUser(ctx, +mm[1]);
    if (((mm = p.match(/^\/admin\/users\/(\d+)\/charts$/)), mm && m === 'GET'))
      return (await target(ctx, +mm[1]), history(ctx, +mm[1]));
    if (((mm = p.match(/^\/admin\/users\/(\d+)\/tp$/)), mm && m === 'GET'))
      return (await target(ctx, +mm[1]), tpHistory(ctx, +mm[1]));
    if (p === '/admin/logs' && m === 'GET') return listLogs(ctx);
  }
  throw err(404, 'not_found', 'Không tìm thấy.');
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}
function err(status, code, message) {
  const e = new Error(message);
  return ((e.status = status), (e.code = code), e);
}
function nowIso() {
  return new Date().toISOString();
}
function addDaysIso(fromIso, days) {
  const d = new Date(fromIso);
  return (d.setTime(d.getTime() + days * 864e5), d.toISOString());
}
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '',
    allowed = String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    'Access-Control-Allow-Origin':
      allowed.includes('*') || allowed.includes(origin) ? origin || '*' : allowed[0] || '',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
async function body(ctx) {
  const t = await ctx.req.text();
  if (t.length > 2e4) throw err(413, 'too_large', 'Dữ liệu gửi lên quá lớn.');
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    throw err(400, 'bad_json', 'Dữ liệu không hợp lệ.');
  }
}
function b64url(bytes) {
  let s = '';
  return (
    bytes.forEach((b) => {
      s += String.fromCharCode(b);
    }),
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  );
}
function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function hashPassword(password, saltHex) {
  const salt = saltHex || hex(crypto.getRandomValues(new Uint8Array(16))),
    key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', !1, [
      'deriveBits',
    ]),
    bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: 1e5 },
      key,
      256,
    );
  return { hash: hex(bits), salt };
}
function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}
function safeEqual(a, b) {
  ((a = String(a)), (b = String(b)));
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function log(ctx, userId, action, detail) {
  await ctx.env.DB.prepare(
    'INSERT INTO logs (user_id, actor_id, action, detail, at, ip) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      userId ?? null,
      ctx.me ? ctx.me.id : null,
      action,
      typeof detail == 'string' ? detail : JSON.stringify(detail || {}),
      nowIso(),
      ctx.ip,
    )
    .run();
}
function cleanText(v, max) {
  return String(v ?? '')
    .trim()
    .slice(0, max);
}
function intOrNull(v, name) {
  if (v === null || v === '' || v === void 0) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1e6)
    throw err(400, 'bad_input', name + ' phải là số nguyên ≥ 0 (để trống = không giới hạn).');
  return n;
}
function checkUsername(u) {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(u || ''))
    throw err(
      400,
      'bad_username',
      'Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới.',
    );
}
function checkPassword(pw) {
  if (typeof pw != 'string' || pw.length < 6 || pw.length > 128)
    throw err(400, 'bad_password', 'Mật khẩu cần từ 6 đến 128 ký tự.');
}
/* ---------- quyền dịch vụ (Tử Vi & Tâm Không / Tạo Phước) ---------- */
function appsOf(u) {
  if (u.role === 'admin') return APPS.slice();
  return String(u.apps == null ? 'tuvi' : u.apps)
    .split(',')
    .map((s) => s.trim())
    .filter((x) => APPS.includes(x));
}
function hasApp(u, app) {
  return appsOf(u).includes(app);
}
function needApp(u, app) {
  if (!hasApp(u, app))
    throw err(
      403,
      'no_app',
      app === 'taophuoc'
        ? 'Tài khoản này chưa được cấp quyền Tạo Phước. Vui lòng liên hệ quản trị viên.'
        : 'Tài khoản này chỉ dùng cho Tạo Phước (taophuoc.html), chưa được cấp quyền Tử Vi & Tâm Không. Vui lòng liên hệ quản trị viên.',
    );
}
function parseApps(v) {
  const list = (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!list.length) throw err(400, 'bad_input', 'Hãy chọn ít nhất một dịch vụ cho tài khoản.');
  if (list.some((x) => !APPS.includes(x))) throw err(400, 'bad_input', 'Dịch vụ không hợp lệ.');
  return APPS.filter((x) => list.includes(x)).join(',');
}
// Quản lý chỉ được cấp/thu những dịch vụ mà chính mình có
function checkGrant(me, before, after) {
  if (me.role === 'admin') return;
  const mine = appsOf(me),
    a = before ? before.split(',') : [],
    b = after.split(',');
  const changed = APPS.filter((x) => a.includes(x) !== b.includes(x));
  if (changed.some((x) => !mine.includes(x)))
    throw err(403, 'forbidden', 'Bạn chỉ được cấp quyền những dịch vụ mà tài khoản của bạn có.');
}
function isExpired(u) {
  return !!(u.expires_at && u.expires_at < nowIso());
}
function publicUser(u) {
  const daysLeft = u.expires_at ? Math.ceil((new Date(u.expires_at) - Date.now()) / 864e5) : null;
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    phone: u.phone,
    note: u.note,
    role: u.role,
    status: u.status,
    startsAt: u.starts_at,
    expiresAt: u.expires_at,
    daysLeft,
    expired: isExpired(u),
    chart: { used: u.chart_used, limit: u.chart_limit },
    pdf: { used: u.pdf_used, limit: u.pdf_limit },
    apps: appsOf(u),
    tp: { used: u.tp_used ?? 0, limit: u.tp_limit ?? null },
    maxDevices: u.max_devices,
    createdBy: u.created_by,
    createdAt: u.created_at,
    lastLogin: u.last_login,
  };
}
async function auth(ctx) {
  const h = ctx.req.headers.get('Authorization') || '',
    token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw err(401, 'unauthorized', 'Vui lòng đăng nhập.');
  const th = await sha256(token),
    row = await ctx.env.DB.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
      .bind(th, nowIso())
      .first();
  if (!row) throw err(401, 'unauthorized', 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại.');
  if (row.status !== 'active')
    throw err(403, 'locked', 'Tài khoản đang bị khóa. Vui lòng liên hệ quản trị viên.');
  return ((ctx.tokenHash = th), row);
}
async function login(ctx) {
  const b = await body(ctx),
    username = cleanText(b.username, 64),
    password = String(b.password || ''),
    bad = () => err(401, 'bad_login', 'Sai tên đăng nhập hoặc mật khẩu.');
  if (!username || !password) throw bad();
  const DB = ctx.env.DB,
    u = await DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!u) throw (await hashPassword(password, '00000000000000000000000000000000'), bad());
  if (u.fail_until && u.fail_until > nowIso())
    throw err(429, 'too_many', 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.');
  const { hash } = await hashPassword(password, u.salt);
  if (!safeEqual(hash, u.pass_hash)) {
    const fails = (u.fail_count || 0) + 1;
    throw (
      await DB.prepare('UPDATE users SET fail_count = ?, fail_until = ? WHERE id = ?')
        .bind(fails >= 8 ? 0 : fails, fails >= 8 ? addDaysIso(nowIso(), 15 / 1440) : null, u.id)
        .run(),
      (ctx.me = null),
      await log(ctx, u.id, 'login_fail', ''),
      bad()
    );
  }
  if (u.status !== 'active')
    throw err(403, 'locked', 'Tài khoản đang bị khóa. Vui lòng liên hệ quản trị viên.');
  const token = b64url(crypto.getRandomValues(new Uint8Array(32))),
    now = nowIso();
  return (
    await DB.batch([
      DB.prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)',
      ).bind(
        await sha256(token),
        u.id,
        now,
        addDaysIso(now, 30),
        cleanText(ctx.req.headers.get('User-Agent'), 200),
      ),
      DB.prepare(
        'DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)',
      ).bind(u.id, u.id, Math.max(1, u.max_devices || 1)),
      DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      DB.prepare(
        'UPDATE users SET fail_count = 0, fail_until = NULL, last_login = ? WHERE id = ?',
      ).bind(now, u.id),
    ]),
    (ctx.me = u),
    await log(ctx, u.id, 'login', ''),
    (u.last_login = now),
    json({ ok: !0, token, user: publicUser(u) })
  );
}
async function logout(ctx) {
  return (
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.tokenHash).run(),
    json({ ok: !0 })
  );
}
async function changeOwnPassword(ctx) {
  const b = await body(ctx),
    u = ctx.me,
    { hash } = await hashPassword(String(b.oldPassword || ''), u.salt);
  if (!safeEqual(hash, u.pass_hash)) throw err(400, 'bad_old', 'Mật khẩu hiện tại không đúng.');
  checkPassword(b.newPassword);
  const np = await hashPassword(b.newPassword),
    DB = ctx.env.DB;
  return (
    await DB.batch([
      DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(
        np.hash,
        np.salt,
        u.id,
      ),
      DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(
        u.id,
        ctx.tokenHash,
      ),
    ]),
    await log(ctx, u.id, 'password_change', ''),
    json({ ok: !0 })
  );
}
async function setup(ctx) {
  const b = await body(ctx);
  if (!ctx.env.SETUP_KEY || !safeEqual(String(b.setupKey || ''), ctx.env.SETUP_KEY))
    throw err(403, 'bad_setup_key', 'Mã khởi tạo không đúng.');
  if (
    (await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first()).n > 0
  )
    throw err(409, 'already_setup', 'Đã có tài khoản quản trị. Hãy đăng nhập.');
  const username = cleanText(b.username, 32);
  (checkUsername(username), checkPassword(b.password));
  const { hash, salt } = await hashPassword(b.password),
    now = nowIso(),
    r = await ctx.env.DB.prepare(
      "INSERT INTO users (username, pass_hash, salt, full_name, role, status, starts_at, max_devices, created_at) VALUES (?,?,?,?, 'admin', 'active', ?, 5, ?)",
    )
      .bind(username, hash, salt, cleanText(b.fullName, 80), now, now)
      .run();
  return (await log(ctx, r.meta.last_row_id, 'setup_admin', username), json({ ok: !0 }));
}
async function useChart(ctx, kind) {
  const u = ctx.me,
    DB = ctx.env.DB;
  needApp(u, 'tuvi');
  if (isExpired(u))
    throw err(
      403,
      'expired',
      'Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn.',
    );
  const b = await body(ctx),
    key = cleanText(b.key, 160);
  if (!key) throw err(400, 'bad_input', 'Thiếu mã lá số.');
  const entry = b.entry && typeof b.entry == 'object' ? b.entry : {},
    data = JSON.stringify(entry).slice(0, 12e3),
    name = cleanText(entry.name, 80),
    now = nowIso();
  let row = await DB.prepare('SELECT * FROM charts WHERE user_id = ? AND chart_key = ?')
      .bind(u.id, key)
      .first(),
    countedChart = !1,
    countedPdf = !1;
  if (!row) {
    if (
      !(
        await DB.prepare(
          'UPDATE users SET chart_used = chart_used + 1 WHERE id = ? AND (chart_limit IS NULL OR chart_used < chart_limit)',
        )
          .bind(u.id)
          .run()
      ).meta.changes
    )
      throw err(
        403,
        'quota_chart',
        'Bạn đã dùng hết ' +
          u.chart_limit +
          ' lượt lập lá số của gói. Vui lòng liên hệ quản trị viên để cộng thêm.',
      );
    ((
      await DB.prepare(
        'INSERT OR IGNORE INTO charts (user_id, chart_key, name, data, created_at, last_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(u.id, key, name, data, now, now)
        .run()
    ).meta.changes
      ? ((countedChart = !0), await log(ctx, u.id, 'chart_new', { key, name }))
      : await DB.prepare('UPDATE users SET chart_used = chart_used - 1 WHERE id = ?')
          .bind(u.id)
          .run(),
      (row = await DB.prepare('SELECT * FROM charts WHERE user_id = ? AND chart_key = ?')
        .bind(u.id, key)
        .first()));
  }
  if (kind === 'pdf' && !row.has_pdf) {
    if (
      !(
        await DB.prepare(
          'UPDATE users SET pdf_used = pdf_used + 1 WHERE id = ? AND (pdf_limit IS NULL OR pdf_used < pdf_limit)',
        )
          .bind(u.id)
          .run()
      ).meta.changes
    )
      throw err(
        403,
        'quota_pdf',
        'Bạn đã dùng hết ' +
          u.pdf_limit +
          ' lượt tải bản luận giải của gói. Vui lòng liên hệ quản trị viên để cộng thêm.',
      );
    (
      await DB.prepare('UPDATE charts SET has_pdf = 1 WHERE id = ? AND has_pdf = 0')
        .bind(row.id)
        .run()
    ).meta.changes
      ? ((countedPdf = !0), await log(ctx, u.id, 'pdf_new', { key, name: row.name }))
      : await DB.prepare('UPDATE users SET pdf_used = pdf_used - 1 WHERE id = ?').bind(u.id).run();
  }
  await DB.prepare(
    'UPDATE charts SET last_at = ?, data = ?, name = ?, png_count = png_count + ?, pdf_count = pdf_count + ? WHERE id = ?',
  )
    .bind(now, data, name || row.name, kind === 'png' ? 1 : 0, kind === 'pdf' ? 1 : 0, row.id)
    .run();
  const fresh = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  return json({ ok: !0, countedChart, countedPdf, user: publicUser(fresh) });
}
async function history(ctx, userId) {
  const lim = Math.min(2e3, Math.max(1, +ctx.url.searchParams.get('limit') || 1e3)),
    items = (
      (
        await ctx.env.DB.prepare(
          'SELECT chart_key, name, data, has_pdf, png_count, pdf_count, created_at, last_at FROM charts WHERE user_id = ? ORDER BY last_at DESC LIMIT ?',
        )
          .bind(userId, lim)
          .all()
      ).results || []
    ).map((x) => {
      let d = {};
      try {
        d = JSON.parse(x.data);
      } catch {}
      return Object.assign(d, {
        key: x.chart_key,
        name: x.name || d.name,
        hasPdf: !!x.has_pdf,
        pngCount: x.png_count,
        pdfCount: x.pdf_count,
        createdAt: x.created_at,
        lastAt: x.last_at,
      });
    });
  return json({ ok: !0, items });
}
/* ---------- Tạo Phước: mỗi người đọc = 1 bộ bài = 1 lượt; tải lại không trừ ---------- */
async function useTp(ctx) {
  const u = ctx.me,
    DB = ctx.env.DB;
  needApp(u, 'taophuoc');
  if (isExpired(u))
    throw err(
      403,
      'expired',
      'Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn.',
    );
  const b = await body(ctx),
    key = cleanText(b.key, 160);
  if (!key) throw err(400, 'bad_input', 'Thiếu mã bộ bài.');
  const entry = b.entry && typeof b.entry == 'object' ? b.entry : {},
    data = JSON.stringify(entry);
  if (data.length > 16e3)
    throw err(413, 'too_large', 'Thông tin bộ bài quá dài, vui lòng rút gọn bớt.');
  const name = cleanText(entry.name, 80),
    now = nowIso();
  let row = await DB.prepare('SELECT * FROM tp_docs WHERE user_id = ? AND doc_key = ?')
      .bind(u.id, key)
      .first(),
    counted = !1;
  if (!row) {
    if (
      !(
        await DB.prepare(
          'UPDATE users SET tp_used = tp_used + 1 WHERE id = ? AND (tp_limit IS NULL OR tp_used < tp_limit)',
        )
          .bind(u.id)
          .run()
      ).meta.changes
    )
      throw err(
        403,
        'quota_tp',
        'Bạn đã dùng hết ' +
          u.tp_limit +
          ' lượt tạo bộ bài Tạo Phước của gói. Vui lòng liên hệ quản trị viên để cộng thêm.',
      );
    (
      await DB.prepare(
        'INSERT OR IGNORE INTO tp_docs (user_id, doc_key, name, data, created_at, last_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(u.id, key, name, data, now, now)
        .run()
    ).meta.changes
      ? ((counted = !0), await log(ctx, u.id, 'tp_new', { key, name }))
      : await DB.prepare('UPDATE users SET tp_used = tp_used - 1 WHERE id = ?').bind(u.id).run();
    row = await DB.prepare('SELECT * FROM tp_docs WHERE user_id = ? AND doc_key = ?')
      .bind(u.id, key)
      .first();
  }
  await DB.prepare(
    'UPDATE tp_docs SET last_at = ?, data = ?, name = ?, dl_count = dl_count + 1 WHERE id = ?',
  )
    .bind(now, data, name || row.name, row.id)
    .run();
  const fresh = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  return json({ ok: !0, counted, user: publicUser(fresh) });
}
async function tpHistory(ctx, userId) {
  const lim = Math.min(2e3, Math.max(1, +ctx.url.searchParams.get('limit') || 1e3)),
    items = (
      (
        await ctx.env.DB.prepare(
          'SELECT doc_key, name, data, dl_count, created_at, last_at FROM tp_docs WHERE user_id = ? ORDER BY last_at DESC LIMIT ?',
        )
          .bind(userId, lim)
          .all()
      ).results || []
    ).map((x) => {
      let d = {};
      try {
        d = JSON.parse(x.data);
      } catch {}
      return {
        key: x.doc_key,
        name: x.name || d.name || '',
        data: d,
        dlCount: x.dl_count,
        createdAt: x.created_at,
        lastAt: x.last_at,
      };
    });
  return json({ ok: !0, items });
}
async function target(ctx, id) {
  const t = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!t) throw err(404, 'not_found', 'Không tìm thấy tài khoản.');
  if (
    ctx.me.role === 'admin' ||
    t.id === ctx.me.id ||
    (t.role === 'member' && t.created_by === ctx.me.id)
  )
    return t;
  throw err(403, 'forbidden', 'Bạn không có quyền với tài khoản này.');
}
async function listUsers(ctx) {
  const DB = ctx.env.DB,
    users =
      (
        await (
          ctx.me.role === 'admin'
            ? DB.prepare('SELECT * FROM users ORDER BY created_at DESC')
            : DB.prepare(
                "SELECT * FROM users WHERE id = ? OR (role = 'member' AND created_by = ?) ORDER BY created_at DESC",
              ).bind(ctx.me.id, ctx.me.id)
        ).all()
      ).results || [],
    names = {};
  return (
    users.forEach((u) => {
      names[u.id] = u.username;
    }),
    ctx.me.role !== 'admin' && (names[ctx.me.id] = ctx.me.username),
    json({
      ok: !0,
      me: publicUser(ctx.me),
      users: users.map((u) =>
        Object.assign(publicUser(u), { createdByName: names[u.created_by] || '' }),
      ),
    })
  );
}
function packageFields(b, base) {
  const out = {};
  if (b.days !== void 0 && b.days !== null && b.days !== '') {
    const d = Number(b.days);
    if (!Number.isInteger(d) || d < 1 || d > 36500)
      throw err(400, 'bad_input', 'Số ngày sử dụng phải là số nguyên dương.');
    out.expires_at = addDaysIso(base || nowIso(), d);
  } else if (b.expiresAt !== void 0)
    if (b.expiresAt === null || b.expiresAt === '') out.expires_at = null;
    else {
      const t = new Date(b.expiresAt);
      if (isNaN(t)) throw err(400, 'bad_input', 'Ngày hết hạn không hợp lệ.');
      (/^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) &&
        t.setTime(new Date(b.expiresAt + 'T23:59:59+07:00').getTime()),
        (out.expires_at = t.toISOString()));
    }
  return (
    b.chartLimit !== void 0 && (out.chart_limit = intOrNull(b.chartLimit, 'Số lá số')),
    b.pdfLimit !== void 0 && (out.pdf_limit = intOrNull(b.pdfLimit, 'Số bản luận giải')),
    b.tpLimit !== void 0 && (out.tp_limit = intOrNull(b.tpLimit, 'Số bộ bài Tạo Phước')),
    out
  );
}
async function createUser(ctx) {
  const b = await body(ctx),
    me = ctx.me,
    DB = ctx.env.DB,
    username = cleanText(b.username, 32);
  (checkUsername(username), checkPassword(b.password));
  const role = b.role || 'member';
  if (!ROLES.includes(role)) throw err(400, 'bad_input', 'Vai trò không hợp lệ.');
  if (me.role !== 'admin' && role !== 'member')
    throw err(403, 'forbidden', 'Quản lý chỉ được tạo tài khoản Thành viên.');
  const apps = b.apps === void 0 ? 'tuvi' : parseApps(b.apps);
  checkGrant(me, '', apps);
  if (await DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first())
    throw err(409, 'username_taken', 'Tên đăng nhập "' + username + '" đã có người dùng.');
  const pk = packageFields(b),
    { hash, salt } = await hashPassword(b.password),
    now = nowIso(),
    maxDev = b.maxDevices === void 0 || b.maxDevices === '' ? 2 : Number(b.maxDevices);
  if (!Number.isInteger(maxDev) || maxDev < 1 || maxDev > 20)
    throw err(400, 'bad_input', 'Số thiết bị đăng nhập cùng lúc từ 1 đến 20.');
  const id = (
    await DB.prepare(
      'INSERT INTO users (username, pass_hash, salt, full_name, phone, note, role, status, starts_at, expires_at, chart_limit, pdf_limit, max_devices, created_by, created_at, apps, tp_limit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        username,
        hash,
        salt,
        cleanText(b.fullName, 80),
        cleanText(b.phone, 30),
        cleanText(b.note, 300),
        role,
        'active',
        now,
        pk.expires_at === void 0 ? null : pk.expires_at,
        pk.chart_limit === void 0 ? null : pk.chart_limit,
        pk.pdf_limit === void 0 ? null : pk.pdf_limit,
        maxDev,
        me.id,
        now,
        apps,
        pk.tp_limit === void 0 ? null : pk.tp_limit,
      )
      .run()
  ).meta.last_row_id;
  await log(ctx, id, 'user_create', {
    username,
    role,
    expires_at: pk.expires_at || null,
    chart_limit: pk.chart_limit ?? null,
    pdf_limit: pk.pdf_limit ?? null,
    apps,
    tp_limit: pk.tp_limit ?? null,
  });
  const u = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ ok: !0, user: publicUser(u) });
}
async function updateUser(ctx, id) {
  const t = await target(ctx, id),
    b = await body(ctx),
    me = ctx.me,
    DB = ctx.env.DB,
    set = {},
    extra = [],
    self = t.id === me.id;
  if (
    (b.fullName !== void 0 && (set.full_name = cleanText(b.fullName, 80)),
    b.phone !== void 0 && (set.phone = cleanText(b.phone, 30)),
    b.note !== void 0 && (set.note = cleanText(b.note, 300)),
    b.status !== void 0)
  ) {
    if (!['active', 'locked'].includes(b.status))
      throw err(400, 'bad_input', 'Trạng thái không hợp lệ.');
    if (self) throw err(400, 'bad_input', 'Không thể tự khóa tài khoản của mình.');
    set.status = b.status;
  }
  if (b.role !== void 0 && b.role !== t.role) {
    if (me.role !== 'admin') throw err(403, 'forbidden', 'Chỉ admin được đổi vai trò.');
    if (!ROLES.includes(b.role)) throw err(400, 'bad_input', 'Vai trò không hợp lệ.');
    if (self) throw err(400, 'bad_input', 'Không thể tự đổi vai trò của mình.');
    set.role = b.role;
  }
  if (b.apps !== void 0) {
    const na = parseApps(b.apps),
      cur = t.apps == null ? 'tuvi' : t.apps;
    if (na !== cur) {
      if (self) throw err(400, 'bad_input', 'Không thể tự đổi quyền dịch vụ của mình.');
      (checkGrant(me, cur, na), (set.apps = na));
    }
  }
  if (b.maxDevices !== void 0) {
    const n = Number(b.maxDevices);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      throw err(400, 'bad_input', 'Số thiết bị đăng nhập cùng lúc từ 1 đến 20.');
    set.max_devices = n;
  }
  if (
    self &&
    me.role !== 'admin' &&
    (b.chartLimit !== void 0 ||
      b.pdfLimit !== void 0 ||
      b.tpLimit !== void 0 ||
      b.addTps ||
      b.days !== void 0 ||
      b.expiresAt !== void 0 ||
      b.addDays ||
      b.addCharts ||
      b.addPdfs ||
      b.renew ||
      b.resetUsage)
  )
    throw err(403, 'forbidden', 'Quản lý không tự sửa hạn mức của mình.');
  if (b.renew) {
    const pk = packageFields(b.renew);
    // Gói mới chỉ đặt lại số đã dùng của dịch vụ được gửi lên (Tử Vi: lá số/PDF; Tạo Phước: bộ bài)
    (Object.assign(set, pk, { starts_at: nowIso() }),
      (b.renew.chartLimit !== void 0 || b.renew.pdfLimit !== void 0) &&
        Object.assign(set, { chart_used: 0, pdf_used: 0 }),
      b.renew.tpLimit !== void 0 && (set.tp_used = 0));
  } else
    (Object.assign(
      set,
      packageFields({
        days: b.days,
        expiresAt: b.expiresAt,
        chartLimit: b.chartLimit,
        pdfLimit: b.pdfLimit,
        tpLimit: b.tpLimit,
      }),
    ),
      // resetUsage: true = lá số + PDF (như cũ), 'tp' = chỉ bộ bài Tạo Phước, 'all' = tất cả
      b.resetUsage &&
        b.resetUsage !== 'tp' &&
        Object.assign(set, { chart_used: 0, pdf_used: 0 }),
      (b.resetUsage === 'tp' || b.resetUsage === 'all') && (set.tp_used = 0));
  if (b.addDays) {
    const d = Number(b.addDays);
    if (!Number.isInteger(d) || d < 1 || d > 36500)
      throw err(400, 'bad_input', 'Số ngày gia hạn phải là số nguyên dương.');
    const cur = set.expires_at !== void 0 ? set.expires_at : t.expires_at,
      base = cur && cur > nowIso() ? cur : nowIso();
    set.expires_at = addDaysIso(base, d);
  }
  ['addCharts:chart_limit', 'addPdfs:pdf_limit', 'addTps:tp_limit'].forEach((pair) => {
    const [k, col] = pair.split(':');
    if (!b[k]) return;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < 1 || n > 1e5)
      throw err(400, 'bad_input', 'Số lượt cộng thêm phải là số nguyên dương.');
    const cur = set[col] !== void 0 ? set[col] : t[col];
    cur !== null && (set[col] = cur + n);
  });
  let killSessions = set.status === 'locked' || set.role !== void 0;
  if (b.password !== void 0 && b.password !== '') {
    checkPassword(b.password);
    const np = await hashPassword(b.password);
    ((set.pass_hash = np.hash),
      (set.salt = np.salt),
      (set.fail_count = 0),
      (set.fail_until = null),
      (killSessions = !0),
      extra.push('password_reset'));
  }
  const cols = Object.keys(set);
  if (!cols.length) throw err(400, 'bad_input', 'Không có thay đổi nào.');
  const stmts = [
    DB.prepare('UPDATE users SET ' + cols.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?').bind(
      ...cols.map((c) => set[c]),
      id,
    ),
  ];
  (killSessions &&
    stmts.push(
      self
        ? DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(
            id,
            ctx.tokenHash,
          )
        : DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    ),
    await DB.batch(stmts));
  const logged = {};
  (cols.forEach((c) => {
    ['pass_hash', 'salt', 'fail_count', 'fail_until'].includes(c) || (logged[c] = set[c]);
  }),
    await log(ctx, id, 'user_update', Object.assign(logged, extra.length ? { extra } : {})));
  const u = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ ok: !0, user: publicUser(u) });
}
async function deleteUser(ctx, id) {
  if (ctx.me.role !== 'admin')
    throw err(403, 'forbidden', 'Chỉ admin được xóa tài khoản. Quản lý có thể khóa tài khoản.');
  if (id === ctx.me.id) throw err(400, 'bad_input', 'Không thể tự xóa tài khoản của mình.');
  const t = await target(ctx, id),
    DB = ctx.env.DB;
  return (
    await DB.batch([
      DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      DB.prepare('DELETE FROM charts WHERE user_id = ?').bind(id),
      DB.prepare('DELETE FROM tp_docs WHERE user_id = ?').bind(id),
      DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]),
    await log(ctx, id, 'user_delete', { username: t.username }),
    json({ ok: !0 })
  );
}
async function listLogs(ctx) {
  const DB = ctx.env.DB,
    sp = ctx.url.searchParams,
    lim = Math.min(1e3, Math.max(1, +sp.get('limit') || 300)),
    uid = sp.get('userId') ? +sp.get('userId') : null;
  uid && (await target(ctx, uid));
  let sql =
    'SELECT l.*, u.username AS username, a.username AS actor FROM logs l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users a ON a.id = l.actor_id';
  const where = [],
    args = [];
  (uid && (where.push('l.user_id = ?'), args.push(uid)),
    ctx.me.role !== 'admin' &&
      (where.push(
        "(l.user_id = ? OR l.user_id IN (SELECT id FROM users WHERE role = 'member' AND created_by = ?))",
      ),
      args.push(ctx.me.id, ctx.me.id)),
    where.length && (sql += ' WHERE ' + where.join(' AND ')),
    (sql += ' ORDER BY l.id DESC LIMIT ?'),
    args.push(lim));
  const r = await DB.prepare(sql)
    .bind(...args)
    .all();
  return json({ ok: !0, items: r.results || [] });
}
export { index_default as default };

# phuocloc-api — Máy chủ tài khoản phuocloc.vn

Cloudflare Worker xử lý đăng nhập, tài khoản thành viên, hạn mức lượt lập/tải lá số và nhật ký. Dữ liệu lưu trong cơ sở dữ liệu **D1 `phuocloc`**.

- Địa chỉ: `https://phuocloc-api.gieophuocloc.workers.dev/api/...`
- Trang web gọi tới qua `window.PL_API` trong `config.js` ở thư mục gốc.

## Thư mục này có gì

| File | Vai trò |
|---|---|
| `src/index.js` | Toàn bộ mã Worker |
| `wrangler.toml` | Cấu hình: tên Worker, cơ sở dữ liệu D1, tên miền được phép gọi (`ALLOWED_ORIGINS`) |
| `schema.sql` | Cấu trúc 4 bảng: `users`, `sessions`, `charts`, `logs` (không có dữ liệu thật) |
| `package.json` | Lệnh tiện dụng: `npm run dev`, `npm run check`, `npm run deploy` |

**Khóa bí mật `SETUP_KEY` không nằm ở đây** — nó được lưu trên Cloudflare. Kho GitHub là công khai, tuyệt đối không ghi mật khẩu, khóa, token vào bất kỳ file nào.

## Các endpoint

| Phương thức | Đường dẫn | Ai dùng | Việc |
|---|---|---|---|
| GET | `/api/ping` | ai cũng được | Kiểm tra máy chủ còn sống |
| POST | `/api/setup` | lần đầu | Tạo tài khoản quản trị đầu tiên (cần `SETUP_KEY`) |
| POST | `/api/login`, `/api/logout` | mọi người | Đăng nhập / đăng xuất |
| GET | `/api/me` | đã đăng nhập | Thông tin tài khoản, lượt còn lại |
| POST | `/api/password` | đã đăng nhập | Đổi mật khẩu |
| POST | `/api/chart`, `/api/png`, `/api/pdf` | đã đăng nhập | Ghi nhận lập/tải lá số và trừ lượt (mở lại lá số cũ không trừ lượt) |
| GET | `/api/history` | đã đăng nhập | Lịch sử lá số của tài khoản |
| GET/POST | `/api/admin/users` | admin, manager | Danh sách / tạo thành viên |
| PATCH/DELETE | `/api/admin/users/:id` | admin, manager | Sửa / xóa thành viên |
| GET | `/api/admin/users/:id/charts` | admin, manager | Lá số của một thành viên |
| GET | `/api/admin/logs` | admin, manager | Nhật ký hoạt động |

## Triển khai tự động (GitHub → Cloudflare)

Sau khi bật **Workers Builds** (hướng dẫn bên dưới), mỗi lần gộp code vào nhánh `main` có thay đổi trong thư mục `worker/`, Cloudflare sẽ tự build và cập nhật Worker. Không cần chạy lệnh tay.

### Bật Workers Builds (làm một lần)

1. Vào Cloudflare → **Workers & Pages** → **phuocloc-api** → **Settings** → **Build**.
2. Ở **Git repository**, bấm **Connect** → chọn GitHub → chọn kho `Gieophuocloc/phuocloc`.
3. Điền cấu hình:
   - **Production branch:** `main`
   - **Root directory (Path):** `worker`
   - **Build command:** để trống
   - **Deploy command:** `npx wrangler deploy`
   - **Build watch paths:** `worker/*` (để chỉ chạy khi thư mục worker thay đổi)
4. Bấm **Save**. Lần gộp code tiếp theo vào `main` sẽ tự triển khai.

## Làm việc cục bộ (cho Claude Code / lập trình viên)

```bash
cd worker
npm install
npx wrangler d1 execute phuocloc --local --file=schema.sql   # cơ sở dữ liệu giả lập trên máy
npx wrangler dev --local --var SETUP_KEY:thu-nghiem          # chạy thử tại http://localhost:8787
npm run check                                                 # kiểm tra build, không triển khai
```

Luôn chạy thử cục bộ trước khi mở Pull Request. **Không** chạy lệnh ghi (`d1 execute` không có `--local`, `migrations apply`…) lên cơ sở dữ liệu thật khi chưa được chủ dự án đồng ý — trong đó là tài khoản khách hàng thật.

## Thay đổi cấu trúc cơ sở dữ liệu

Không sửa bảng trực tiếp. Tạo file migration mới trong `worker/migrations/` (ví dụ `0002_them_cot_x.sql`), chỉ dùng lệnh thêm (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`), không xóa cột hay bảng, cập nhật `schema.sql`, và chờ chủ dự án duyệt trước khi áp dụng lên cơ sở dữ liệu thật.

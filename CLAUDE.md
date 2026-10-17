# CLAUDE.md — Phước Lộc Tử Vi (phuocloc.vn)

Hướng dẫn cho Claude Code khi làm việc trong kho này. Đọc hết trước khi sửa bất cứ file nào.

## 1. Dự án là gì

**Phước Lộc Tử Vi** — website lập lá số Tử Vi, tải lá số dạng ảnh PNG, luận giải dạng PDF, và Lá Số Tâm Không. Thuộc hệ sinh thái **Tâm Không (TKS)**, triết lý "Lợi Cộng Đồng – Lợi Người Khác – Lợi Mình", khung **6 Chữ Vàng** (Khỏe – Tiền – Tài – Tình – Tu – An).

- Chủ dự án: Đào Đức Đắc (đồng sáng lập Tâm Không)
- Tên miền: `phuocloc.vn` (file `CNAME`)
- Lưu trữ: **GitHub Pages**, kho `Gieophuocloc/phuocloc`, nhánh `main` — push lên `main` là lên mạng ngay
- Khách hàng và giao diện: **tiếng Việt**. Mọi chữ hiển thị, thông báo lỗi, chú thích code mới đều viết tiếng Việt có dấu.

## 2. Cấu trúc kho

| File | Vai trò |
|---|---|
| `index.html` | Trang chính: lịch âm dương, an sao, vẽ lá số, chấm điểm, luận giải, lịch sử lá số (~2.700 dòng) |
| `tamkhong.html` | Lá Số / Bản đồ Tâm Không (thần số học), xuất ảnh và PDF bằng html2canvas + jsPDF |
| `taophuoc.html` | **Tạo Phước**: nhập người đọc + gia đình + dòng họ + địa chỉ, xuất bộ bài tu dạng Word (.docx) theo “Quy trình tu tập tạo phước cho người mới” (11 bài, bài tổng hợp, bảng kê biếu tiền, bài mẫu). Bộ tạo Word tự viết trong biến `DOCX` (không dùng thư viện ngoài). **Nội dung các bài (biến `BAI`) không nằm trong kho**: lưu ở bảng D1 `tp_assets` (dòng `name='bai'`), trang tải qua `GET /api/tp/engine` sau khi đăng nhập tài khoản có quyền Tạo Phước. Bản gốc để sửa nằm trong Project claude.ai “Phước Lộc Web” (`claude/tao-phuoc-bai.js`); sửa xong thì cập nhật dòng đó trong D1 (cần chủ dự án duyệt). Không đưa nội dung bài vào kho |
| `admin.html` | Trang quản trị tài khoản thành viên, hạn mức, nhật ký; có mục riêng **Tử Vi & Tâm Không** và **Tạo Phước** |
| `config.js` | Cấu hình chung: `window.PL_API` (địa chỉ Worker), `window.PL_CONTACT` (liên hệ Zalo) |
| `CNAME` | Tên miền GitHub Pages — **không sửa, không xóa** |
| `worker/` | Mã máy chủ tài khoản (Cloudflare Worker + D1), xem mục 3 |

**Phần web không có bước build, không có npm, không có framework** (npm chỉ dùng trong `worker/`). Mỗi trang là một file HTML tự chứa (HTML + CSS + JS thuần trong cùng file). Giữ nguyên kiểu này: không tách file, không thêm bundler, không thêm React/Vue trừ khi chủ dự án yêu cầu rõ.

Thư viện ngoài chỉ nạp từ `cdnjs.cloudflare.com`; font chỉ từ Google Fonts.

## 3. Máy chủ tài khoản (Cloudflare Worker) — thư mục `worker/`

- Mã nguồn: `worker/src/index.js`; cấu hình `worker/wrangler.toml`; cấu trúc CSDL `worker/schema.sql`. Đọc `worker/README.md` trước khi sửa.
- Địa chỉ: `https://phuocloc-api.gieophuocloc.workers.dev`, mọi lệnh gọi qua tiền tố `/api`
- Cơ sở dữ liệu **D1 `phuocloc`** (binding `DB`), 6 bảng: `users`, `sessions`, `charts`, `logs`, `tp_docs` (bộ bài Tạo Phước), `tp_assets` (nội dung bài tu) — hai bảng sau thêm bởi `migrations/0002_tao_phuoc.sql`. Chứa tài khoản khách thật: **không chạy lệnh ghi lên CSDL thật** khi chưa được duyệt; thay đổi cấu trúc chỉ qua file migration mới, chỉ thêm, không xóa.
- Khóa bí mật `SETUP_KEY` lưu trên Cloudflare, không bao giờ ghi vào kho.
- Triển khai: gộp vào `main` → Cloudflare Workers Builds **tự triển khai** thư mục `worker/` (đã bật từ 17/10/2026). Vì vậy mọi thay đổi trong `worker/` được gộp là lên máy chủ thật ngay — phải chạy thử cục bộ kỹ trước. Preview builds cố ý TẮT (dùng chung CSDL thật). Trước khi mở PR, chạy `cd worker && npm run check` và chạy thử cục bộ bằng `wrangler dev --local`.
- Endpoint:
  - Chung: `GET /ping`, `POST /setup`, `POST /login`, `POST /logout`, `GET /me`, `POST /password`, `POST /chart` · `/png` · `/pdf` (ghi nhận và trừ lượt; mở lại lá số cũ không trừ), `GET /history?limit=…`
  - Tạo Phước: `POST /tp/doc` (mỗi người đọc = 1 bộ bài = 1 lượt; tạo/tải lại bộ cũ không trừ), `GET /tp/history`
  - Quản trị (admin, manager): `GET/POST /admin/users`, `PATCH/DELETE /admin/users/:id`, `GET /admin/users/:id/charts`, `GET /admin/users/:id/tp`, `GET /admin/logs?limit=…&userId=…`
- Một tính năng cần cả web và máy chủ thì sửa cả hai trong cùng một Pull Request, và đảm bảo bản web cũ vẫn chạy được với máy chủ mới (không đổi tên trường đang dùng).
- Vai trò: `admin` (toàn quyền), `manager` (quản lý thành viên), `member` (bị giới hạn lượt lập/tải lá số và luận giải theo số lượng và thời hạn).
- Quyền dịch vụ (cột `apps`): `tuvi` = Tử Vi + Tâm Không (mặc định mọi tài khoản cũ), `taophuoc` = Tạo Phước. Tài khoản chỉ có `taophuoc` bị Worker chặn lập lá số (`no_app`) và ngược lại. Admin có cả hai. Quản lý chỉ cấp/thu được dịch vụ mà mình có. Hạn sử dụng dùng chung; hạn mức riêng: `chart_limit`/`pdf_limit` cho Tử Vi, `tp_limit` cho Tạo Phước.
- Nội dung chỉ dành cho admin (ví dụ bảng "Các chỉ số và cách tính") phải ẩn với `member`. Nhớ rằng ẩn ở giao diện không phải bảo mật thật — dữ liệu nhạy cảm cần chặn ở Worker.

## 4. Lưu trữ trên trình duyệt

| Khóa localStorage | Nội dung |
|---|---|
| `phuocloc.token.v1` | Token đăng nhập (dùng chung cả 3 trang) |
| `phuocloc.history.v1` | Lịch sử lá số cục bộ (tối đa 2.000 mục) |
| `phuocloc.lastInput` | Thông tin nhập gần nhất |
| `phuocloc.tp.lastInput` | Thông tin nhập gần nhất ở trang Tạo Phước |

Không đổi tên khóa (sẽ làm mất dữ liệu của khách). Nếu buộc phải đổi cấu trúc, tăng hậu tố `.v2` và viết đoạn chuyển dữ liệu từ `.v1`. Luôn bọc đọc/ghi localStorage trong `try/catch`.

## 5. Quy tắc nghiệp vụ quan trọng

- **Kiểm tra lịch sử trước khi tạo mới:** nếu lá số / luận giải của khách đã có trong Lịch sử lá số, tính năng phải cho tải lại bản cũ chứ không sinh bản mới và không trừ thêm lượt.
- **Lá số Tử Vi giao dạng ảnh PNG**; luận giải giao dạng PDF.
- **Không tự ý sửa thuật toán lịch và an sao** (`jdFromDate`, `newMoon`, `sunLongitude`, `getLunarMonth`, `napAm`, `lapLaSo`, `starPos`…). Mọi thay đổi ở phần này phải:
  1. Nêu rõ quy tắc Tử Vi đang áp dụng và nguồn,
  2. Kiểm tra với ít nhất 3 ngày sinh mẫu (có tháng nhuận, giờ Tý, năm chuyển giao) trước và sau khi sửa,
  3. Chờ chủ dự án duyệt.
- Văn bản luận giải giữ giọng tích cực, khuyến thiện, hướng hành động (gieo phước, tu tâm) — không phán xét, không gây sợ hãi.
- **Tạo Phước:** quan hệ gia đình để trống thì ghi “Người thân”. Câu chữ các bài phải giữ đúng file quy trình của chủ dự án; sửa nội dung bài cần chủ dự án duyệt.
- Cuối luận giải 6 Chữ Vàng Tử Vi có trang **"Bản Đồ Nguồn Lực"** (Kích Hoạt Sức Mạnh Tử Vi, theo SOP Kích Hoạt 4 Tầng của TKS).

## 6. Thiết kế và thương hiệu

Mỗi trang đã có bộ biến màu riêng trên `:root` — **dùng lại biến, không viết mã màu cứng mới**:

- `index.html` / `admin.html`: giấy `--paper #f7f4ec`, mực `--ink #1c1d21`, vàng `--gold #a8862f`, ngọc `--jade #2f5d3a`, son `--seal #9b2a1f`. Font: Lora (tiêu đề), Be Vietnam Pro (giao diện), Roboto/Tinos (dữ liệu lá số).
- `tamkhong.html`: màu thương hiệu TKS — xanh Tara `#0B5D3B`, vàng `#B8860B`; font Times New Roman cho văn bản.
- Thiết kế mới ưu tiên tông hợp dụng thần **Hỏa – Thổ – Kim**: đỏ son, vàng kim, vàng đất, nâu, trắng ngà. Hạn chế mảng lớn màu xanh dương/đen (Thủy).
- Có sẵn **chế độ tối** (`prefers-color-scheme: dark`): mọi thành phần mới phải hiển thị đúng ở cả hai chế độ.
- Phải dùng tốt trên **điện thoại** (khách chủ yếu mở từ Zalo/Facebook): không cuộn ngang, nút bấm đủ lớn, kiểm tra ở bề rộng 375px.
- Tiếng Việt phải hiển thị đúng dấu ở cả trang web, ảnh PNG và PDF (kiểm tra font khi xuất).

## 7. Quy trình làm việc

1. Đọc phần code liên quan trước khi sửa; file lớn thì dùng tìm kiếm theo tên hàm thay vì đọc toàn bộ.
2. Sửa nhỏ, có mục tiêu; không định dạng lại hay đổi tên hàng loạt ngoài phạm vi yêu cầu.
3. Chạy thử cục bộ: `python3 -m http.server 8000` rồi mở `http://localhost:8000` (đừng mở file trực tiếp bằng `file://` vì sẽ lỗi gọi API).
4. Kiểm tra: lập lá số mẫu, tải PNG, xuất PDF, đăng nhập/đăng xuất, thử với cả tài khoản `member` và `admin`, cả giao diện sáng/tối, máy tính và điện thoại. Mở console xem có lỗi không.
5. Làm trên nhánh riêng (`feature/…`, `fix/…`) và mở Pull Request; chỉ merge vào `main` khi chủ dự án đồng ý, vì `main` là trang thật.
6. Commit message viết tiếng Việt, ngắn gọn, mô tả điều đã thay đổi (theo kiểu các commit cũ, ví dụ: "Ẩn bảng Các chỉ số và cách tính với thành viên, chỉ hiện cho admin").

## 8. Tuyệt đối không

- Không đưa mật khẩu, token, khóa API, dữ liệu khách hàng thật vào kho (kho đang **công khai**).
- Không xóa hay sửa `CNAME`.
- Không đổi `window.PL_API` khi chưa được yêu cầu.
- Không push thẳng lên `main` khi chưa được duyệt.
- Không thêm theo dõi, quảng cáo, hay gửi dữ liệu khách sang dịch vụ bên thứ ba.

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
| `admin.html` | Trang quản trị tài khoản thành viên, hạn mức, nhật ký |
| `config.js` | Cấu hình chung: `window.PL_API` (địa chỉ Worker), `window.PL_CONTACT` (liên hệ Zalo) |
| `CNAME` | Tên miền GitHub Pages — **không sửa, không xóa** |

**Không có bước build, không có npm, không có framework.** Mỗi trang là một file HTML tự chứa (HTML + CSS + JS thuần trong cùng file). Giữ nguyên kiểu này: không tách file, không thêm bundler, không thêm React/Vue trừ khi chủ dự án yêu cầu rõ.

Thư viện ngoài chỉ nạp từ `cdnjs.cloudflare.com`; font chỉ từ Google Fonts.

## 3. Máy chủ tài khoản (Cloudflare Worker)

- Địa chỉ: `https://phuocloc-api.gieophuocloc.workers.dev`, mọi lệnh gọi qua tiền tố `/api`
- **Mã nguồn Worker không nằm trong kho này.** Nếu một tính năng cần sửa phía máy chủ, hãy nói rõ và đề xuất mã cho Worker riêng — đừng giả định endpoint mới đã tồn tại.
- Endpoint trang đang dùng:
  - Chung: `POST /login`, `POST /logout`, `POST /password`, `POST /setup`, `GET /me`, `GET /history?limit=…`, `POST /consume` (trừ lượt, `kind: 'chart'`)
  - Quản trị: `GET/POST /admin/users`, `GET/PATCH/DELETE /admin/users/:id`, `GET /admin/logs?limit=…&userId=…`
- Vai trò: `admin` (toàn quyền), `manager` (quản lý thành viên), `member` (bị giới hạn lượt lập/tải lá số và luận giải theo số lượng và thời hạn).
- Nội dung chỉ dành cho admin (ví dụ bảng "Các chỉ số và cách tính") phải ẩn với `member`. Nhớ rằng ẩn ở giao diện không phải bảo mật thật — dữ liệu nhạy cảm cần chặn ở Worker.

## 4. Lưu trữ trên trình duyệt

| Khóa localStorage | Nội dung |
|---|---|
| `phuocloc.token.v1` | Token đăng nhập (dùng chung cả 3 trang) |
| `phuocloc.history.v1` | Lịch sử lá số cục bộ (tối đa 2.000 mục) |
| `phuocloc.lastInput` | Thông tin nhập gần nhất |

Không đổi tên khóa (sẽ làm mất dữ liệu của khách). Nếu buộc phải đổi cấu trúc, tăng hậu tố `.v2` và viết đoạn chuyển dữ liệu từ `.v1`. Luôn bọc đọc/ghi localStorage trong `try/catch`.

## 5. Quy tắc nghiệp vụ quan trọng

- **Kiểm tra lịch sử trước khi tạo mới:** nếu lá số / luận giải của khách đã có trong Lịch sử lá số, tính năng phải cho tải lại bản cũ chứ không sinh bản mới và không trừ thêm lượt.
- **Lá số Tử Vi giao dạng ảnh PNG**; luận giải giao dạng PDF.
- **Không tự ý sửa thuật toán lịch và an sao** (`jdFromDate`, `newMoon`, `sunLongitude`, `getLunarMonth`, `napAm`, `lapLaSo`, `starPos`…). Mọi thay đổi ở phần này phải:
  1. Nêu rõ quy tắc Tử Vi đang áp dụng và nguồn,
  2. Kiểm tra với ít nhất 3 ngày sinh mẫu (có tháng nhuận, giờ Tý, năm chuyển giao) trước và sau khi sửa,
  3. Chờ chủ dự án duyệt.
- Văn bản luận giải giữ giọng tích cực, khuyến thiện, hướng hành động (gieo phước, tu tâm) — không phán xét, không gây sợ hãi.
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

# Chơi Bài Cùng Bạn

Game bài 3D gồm **Tiến Lên Miền Nam** (2–4 người) và **Xì Dách** (2–10 người). Chơi một mình với máy, hoặc mở phòng online với bạn bè; đăng nhập Google là tùy chọn.

## Chạy ở máy

Cần Node.js ≥ 22. Không có dependency nào, không cần `npm install`.

```bash
cp env.example .env   # rồi điền GOOGLE_CLIENT_ID, SESSION_SECRET nếu muốn
npm start             # http://localhost:8080
npm run dev           # tự khởi động lại khi sửa code server
npm test              # test luật chơi, bàn chơi, phòng, đăng nhập
```

Bạn bè cùng mạng LAN vào `http://<IP-máy-bạn>:8080` → tab **Online** → chọn phòng trong danh sách, hoặc nhập mã 4 chữ cái.

## Cấu hình (biến môi trường)

Xem `env.example`. Khi chạy ở máy thì để trong `.env`; khi deploy thì đặt trong phần Environment của nền tảng.

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng lắng nghe (nền tảng thường tự đặt) |
| `GOOGLE_CLIENT_ID` | Bật nút đăng nhập Google. Để trống → chỉ chơi dạng khách |
| `SESSION_SECRET` | Khóa ký cookie phiên. Để trống → khóa tạm, restart là mọi người bị đăng xuất |
| `COOKIE_SECURE` | `true` khi chạy HTTPS |
| `MAX_ROOMS`, `TURN_MS` | Giới hạn số phòng; thời gian suy nghĩ trước khi máy đánh hộ |
| `TRUST_PROXY` | `true` khi chạy sau nginx/proxy của nền tảng (đọc IP thật từ `X-Forwarded-For`) |
| `MAX_STREAMS_PER_IP` | Số kết nối chơi tối đa từ một IP (mặc định 8) |

### Lấy Google Client ID

1. Vào [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** → loại **Web application**.
2. **Authorized JavaScript origins**: thêm `http://localhost:8080` và domain thật (vd. `https://bai.example.com`). Không cần redirect URI.
3. Chép Client ID vào `GOOGLE_CLIENT_ID`.

Luồng: trình duyệt dùng Google Identity Services lấy **ID token** → `POST /api/auth/google` → server tự kiểm chữ ký RS256 bằng khóa công khai của Google (`server/auth.js`, không dùng thư viện), kiểm `aud`, `iss`, `exp` → lưu người dùng vào cookie ký HMAC.

## Deploy

Server giữ phòng trong RAM → **chỉ chạy 1 instance** (restart là mất phòng; tài khoản thì vẫn còn vì nằm trong cookie).

- **Render / Railway / Fly.io**: tạo Web Service từ repo, lệnh start `npm start`, đặt các biến môi trường ở trên.
- **VPS**: `node server/index.js` chạy bằng pm2/systemd. Sau nginx thì tắt buffering cho SSE:

  ```nginx
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;                       # server so Origin với Host để chặn request từ trang khác
    proxy_set_header X-Forwarded-For $remote_addr;     # kèm TRUST_PROXY=true
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
  ```

- **Chỉ hosting tĩnh** (GitHub Pages…): upload nội dung `public/` và thư mục `shared/` đặt vào trong đó (`public/shared/`). Chơi với máy vẫn chạy; tab Online sẽ báo là không có máy chủ.

## Cấu trúc code

```
shared/            chạy ở CẢ server (phòng online) lẫn trình duyệt (chơi solo)
  deck.js          lá bài: id 0..51 = rank*4 + suit, xào bài
  table.js         bàn chơi gốc: ghế, chủ phòng, bot, AFK, người vào giữa ván, biểu cảm
  tienlen/         rules.js (luật, bot) · table.js (bàn Tiến Lên)
  xidach/          rules.js (điểm, xì bàng, ngũ linh…) · table.js (bàn Xì Dách, nhà cái)
server/
  index.js         HTTP routes: /api/* + file tĩnh
  config.js        đọc biến môi trường / .env
  http.js          JSON, cookie, SSE, phục vụ file tĩnh an toàn
  auth.js          phiên khách / Google, xác thực ID token
  rooms.js         Lobby + Room: ai ngồi ghế nào, chống trùng người, kick, vào lại
public/
  index.html       chỉ markup      css/style.css   giao diện
  js/main.js       gắn sự kiện DOM + vòng lặp render
  js/session.js    điều phối: chọn trò, solo/online, hàng đợi event → animation
  js/net.js        solo (bàn chạy trong trang) hoặc online (SSE + POST)
  js/core/         state (trạng thái dùng chung), util, audio (âm thanh tổng hợp)
  js/scene/        3D: stage (renderer, camera, bàn), cards, buddies, tween, effects
  js/ui/           hud (thẻ tên, banner), menu (tab, phòng, kết quả), account
  js/games/        view riêng từng trò: tienlen.js, xidach.js
tests/             node:test — chạy bằng `npm test`
```

**Luồng dữ liệu:** bàn chơi (`shared/*/table.js`) là nguồn sự thật. Nó phát *event* (`deal`, `play`, `xd-draw`…) tới từng ghế — lá úp chỉ gửi cho chủ lá. Trình duyệt xếp event vào hàng đợi và diễn từng cái một (`session.js → games/*.js`). Người chơi gửi *action* (`{type:'draw'}`…); bàn kiểm luật và trả lỗi nếu sai. Solo và online dùng chung code, chỉ khác đường truyền (`net.js`).

## Hành vi phòng online

- **Một người một ghế**: mỗi người có id (khách hoặc Google). Mở tab thứ hai / mất mạng rồi vào lại → lấy lại đúng ghế cũ, không bị nhân đôi; tab cũ được báo và đóng. Vào phòng khác thì tự rời phòng cũ.
- **Refresh trang** trong phòng → tự vào lại phòng. Phòng trống vẫn giữ 30 giây.
- **Thoát giữa ván** → máy đánh thay ngay (trình duyệt báo server bằng `sendBeacon` khi đóng trang). Vào lại giữa ván → máy đánh nốt ván đó, bạn vào từ ván sau.
- **Để hết giờ** (`TURN_MS`) → máy đánh hộ, và từ đó đánh với tốc độ máy cho tới khi bạn bấm gì đó.
- **Kick**: chủ phòng bấm **Mời ra** trong danh sách ghế (nút 👥 khi đang chơi). Người bị mời ra không vào lại phòng đó được.

## Bảo mật

- Cookie phiên ký HMAC, `HttpOnly` + `SameSite=Lax`, hạn 30 ngày nằm *trong* dữ liệu đã ký. ID token Google được kiểm chữ ký, `aud`, `iss`, `exp`.
- POST từ trang khác (khác `Origin`) bị chặn → không CSRF, không login CSRF.
- CSP chặt (chỉ cho script của mình, jsDelivr, Google Sign-In; importmap cho qua bằng hash), `frame-ancestors 'none'` chống clickjacking, `nosniff`.
- Giới hạn: body 4 KB, `MAX_STREAMS_PER_IP` kết nối/IP, `MAX_ROOMS` phòng, biểu cảm 1 lần/1,2 giây/ghế.
- Lá úp chỉ gửi cho chủ lá; người vào giữa ván không nhận event của ván đó.
- Còn biết: kick chặn theo tài khoản — khách xóa cookie là thành khách mới vào lại được (chặn theo IP thì oan cả nhóm chung wifi). Đăng xuất không thu hồi cookie cũ đã bị lộ (phiên không lưu trên server).

## Xì Dách: mở bài

Bộ bài được xào (riffle) trước mỗi ván. Bài của bạn đến **úp**: chạm để lật, hoặc **kéo lá bài lên từ từ để nặn** — lớp úp được lột chéo từ góc (clipping plane trong `scene/cards.js`). Bài người khác lật trên bàn từng lá; nhà cái lật có tiếng trống và dừng một nhịp trước lá cuối.

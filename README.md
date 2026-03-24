# Production App — Quản lý Sản xuất

Ứng dụng nhập liệu và báo cáo sản lượng, chạy trên NAS Synology DS918+.

## Truy cập
Sau khi deploy: http://192.168.1.10:3000

---

## Cách chạy trên NAS (Docker)

### 1. Upload code lên NAS
Copy thư mục này vào NAS, ví dụ: `/volume1/docker/production-app`

### 2. SSH vào NAS
```bash
ssh admin@192.168.1.10
```

### 3. Di chuyển vào thư mục
```bash
cd /volume1/docker/production-app
```

### 4. Build và chạy
```bash
docker-compose up -d --build
```

### 5. Kiểm tra
```bash
docker logs production-app
```

---

## Chạy thử trên máy tính (Windows)

Mở Git Bash trong thư mục này:
```bash
cd backend
npm install
node server.js
```
Truy cập: http://localhost:3000

---

## Cấu trúc
```
production-app/
├── backend/
│   ├── server.js      # API + SQLite
│   └── package.json
├── frontend/
│   └── index.html     # Giao diện
├── data/              # Database (tự tạo)
├── Dockerfile
└── docker-compose.yml
```

## Tính năng
- ✅ Form nhập liệu: ngày, chuyền, style, lô sx, sản lượng
- ✅ Lô sx tự động lọc theo style được chọn
- ✅ Dashboard: sản lượng theo ngày, tháng, chuyền, style
- ✅ Lịch sử nhập liệu gần đây
- ✅ Lọc báo cáo theo khoảng ngày

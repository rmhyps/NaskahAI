# NaskahAI

**NaskahAI** adalah studio perencana proyek cerdas (*AI Project Planner & Markdown Document Studio*) yang membantu pengembang dan tim merancang spesifikasi aplikasi secara matang, konsisten, dan terstruktur sebelum mulai menulis kode.

NaskahAI membedakan ide mentah dengan keputusan terkonfirmasi melalui wawancara kebutuhan adaptif, lalu menyusun paket dokumen spesifikasi berstandar industri dengan diagram visual interaktif dan ekspor lengkap.

---

## Fitur Utama

- **Wawancara Kebutuhan Adaptif**: AI menganalisis ide proyek Anda, menemukan hal yang ambigu, dan mengajukan maksimal 3 pertanyaan terarah per putaran.
- **Preset Ide & Quick Tags**:
  - Template ide siap pakai: *Habit & Focus Tracker (Mobile)*, *Multi-Tenant SaaS Analytics (Web)*, *Local-First Visual Canvas (Desktop)*, dan *AI Issue Triaging & Inbox (Full-Stack)*.
  - Tag instruksi cepat untuk platform (`Flutter`, `Next.js 15`, `React Native`, `Tauri`, `FastAPI`, `Go API`) dan vibe arsitektur (`Linear Dark Minimalist`, `Apple Paper Clean`, `Bento Grid Modern`, `Dense Dev-First`).
- **Paket 10 Dokumen Spesifikasi Terstruktur**:
  - `PRD.md`: Masalah, tujuan, MVP scope, non-goals, katalog matriks fitur ber-ID stabil (`F-001`), dan acceptance criteria.
  - `architecture.md`: Komponen sistem, aliran data, pilihan tech stack beserta alasan, dan diagram arsitektur.
  - `design.md`: Halaman, navigasi, spesifikasi UI/UX, states, dan user flow diagram.
  - `database.md`: Entitas, relasi, constraint, dan ERD jika penyimpanan diperlukan.
  - `api.md`: Kontrak endpoint API internal/eksternal dalam format tabel rapi.
  - `implementation-plan.md`: Fase pengerjaan bertahap dan checklist deliverable.
  - `decisions.md`: Catatan keputusan terkonfirmasi, alasan, asumsi, dan pertanyaan terbuka.
  - `security.md`: Model autentikasi, otorisasi peran (RBAC), perlindungan data, dan kepatuhan OWASP.
  - `testing-plan.md`: Strategi unit testing, skenario integrasi, acceptance criteria, dan kriteria rilis.
  - `env-example.md`: Kamus variabel lingkungan sistem, deskripsi, dan template konfigurasi aman.
- **Estimator Kompleksitas Proyek**:
  - Menghitung perkiraan tingkat kompleksitas (Rendah / Sedang / Tinggi / Sangat Kompleks), estimasi waktu pengerjaan MVP, serta rekomendasi jumlah sprint secara otomatis di tahap review.
- **Checklist Interaktif & Preview Markdown**:
  - Item to-do dan kriteria pengerjaan dapat langsung dicentang/di-toggle pada panel preview dengan efek coret teks (*strikethrough*).
- **Render Visual Diagram (Mermaid)**:
  - Diagram alur otomatis di-render menjadi visual grafis editorial yang elegan.
  - Tombol beralih antara tampilan **Visual Diagram** dan **Kode Mermaid**.
  - Kontrol Zoom diagram: Zoom In, Zoom Out, dan Reset ke ukuran semula (skala 40% - 250%).
  - Unduh diagram langsung dalam format file vektor `.svg`.
  - Mode **Fullscreen** untuk presentasi dan inspeksi arsitektur detail.
- **Opsi Ekspor Lengkap**:
  - **Salin Teks (Clipboard)**: Salin isi Markdown satu per satu langsung ke clipboard.
  - **Unduh Satuan**: Unduh file dokumen spesifik dalam format `.md`.
  - **Unduh FULL_SPEC.md**: Gabungkan seluruh dokumen spesifikasi proyek menjadi satu file komprehensif untuk konteks LLM atau arsip offline.
  - **Unduh Semua (.zip)**: Unduh seluruh rangkaian dokumen proyek sekaligus dalam satu arsip `.zip`.
- **Manajemen Proyek Lengkap (Sidebar)**:
  - Pencarian proyek real-time berdasarkan judul atau deskripsi ide.
  - Duplikasi proyek dengan sekali klik (*clone* instan untuk variasi arsitektur).
  - Rename langsung dari sidebar.
  - Hapus proyek dengan konfirmasi inline yang aman.
  - Indikator waktu relatif pembaruan terakhir.
- **Tema Gelap & Terang Global (Dark Mode)**:
  - Dukungan tema Kertas (*Paper Light*) dan Studio (*OLED Deep Zinc Dark*).
  - Mengikuti preferensi sistem operasi secara otomatis atau dikontrol manual via tombol toggle.
- **Pemilih Model AI Dinamis**:
  - Dropdown pemilihan model AI aktif langsung dari antarmuka via router endpoint `/api/models`.
- **Penyimpanan Lokal & Cloudflare D1**:
  - Sinkronisasi otomatis ke browser (`localStorage`) dan penyimpanan persisten server/disk lokal (`.data/projects.json`), dengan dukungan fallback Cloudflare D1 Database.

---

## Pintasan Keyboard (Shortcuts)

| Shortcut | Aksi |
| :--- | :--- |
| `Ctrl` + `Enter` / `Cmd` + `Enter` | Analisis ide / Lanjutkan wawancara / Generate dokumen |
| `Ctrl` + `S` / `Cmd` + `S` | Simpan proyek secara manual |

---

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Runtime & Bundler**: Vite 8 + Vinext (Cloudflare Workers runtime)
- **Styling**: Tailwind CSS v4 + Lucide Icons + next-themes
- **Diagramming**: Mermaid.js (dinamis, zoomable, SVG export)
- **Notifikasi**: Sonner Toast Notifications
- **Database/Storage**: Cloudflare D1 / Local JSON File Storage

---

## Persyaratan Sistem

- Node.js `>= 22.13.0`
- Package manager: `pnpm` (disarankan) atau `npm`
- Router AI: [9Router](https://github.com/rmhyps) atau endpoint OpenAI-compatible completions API

---

## Panduan Instalasi & Menjalankan Lokal

### 1. Klon Repositori
```bash
git clone https://github.com/rmhyps/NaskahAI.git
cd NaskahAI
```

### 2. Instalasi Dependensi
```bash
pnpm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```

Sesuaikan konfigurasi router AI Anda di `.env`:
```env
NINE_ROUTER_BASE_URL=http://localhost:20128
NINE_ROUTER_API_KEY=sk-your-api-key-here
NINE_ROUTER_MODEL=ag/gemini-3.8-flash-high
```

### 4. Jalankan Server Pengembangan
```bash
pnpm dev
# atau
npm run dev
```

Buka peramban di:
**`http://localhost:5173`** atau **`http://127.0.0.1:5173`**

---

## Skrip yang Tersedia

- `pnpm dev`: Menjalankan server pengembangan lokal dengan HMR pada port `5173`.
- `pnpm build`: Melakukan compile dan build produksi aplikasi dengan Vite/Vinext.
- `pnpm start`: Menjalankan server produksi lokal menggunakan runtime Wrangler/Cloudflare.
- `pnpm lint`: Menjalankan linter ESLint untuk memeriksa kualitas kode.
- `pnpm db:generate`: Menjalankan migrasi skema Drizzle ORM.

---

## Opsi Deployment Cloudflare (Opsional)

Proyek ini dibangun di atas runtime [Vinext](https://github.com/cloudflare/vinext). Jika Anda ingin men-deploy aplikasi ini ke **Cloudflare Workers**:
1. Login ke akun Cloudflare via CLI:
   ```bash
   npx wrangler login
   ```
2. Buat database Cloudflare D1 (jika ingin menggunakan D1):
   ```bash
   npx wrangler d1 create site-creator-d1
   ```
3. Lakukan build dan deploy Worker:
   ```bash
   pnpm build
   npx wrangler deploy
   ```

---

## Lisensi

Dilisensikan di bawah lisensi MIT.

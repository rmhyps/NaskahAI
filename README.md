# NaskahAI

**NaskahAI** adalah studio perencana proyek cerdas (*AI Project Planner & Markdown Document Studio*) yang membantu pengembang dan tim merancang spesifikasi aplikasi secara matang, konsisten, dan terstruktur sebelum mulai menulis kode.

NaskahAI membedakan ide mentah dengan keputusan terkonfirmasi melalui wawancara kebutuhan adaptif, lalu menyusun paket dokumen spesifikasi berstandar industri dengan diagram visual otomatis.

---

## Fitur Utama

- **Wawancara Kebutuhan Adaptif**: AI menganalisis ide proyek Anda, menemukan hal yang ambigu, dan mengajukan maksimal 3 pertanyaan terarah per putaran.
- **Paket Dokumen Terstruktur**:
  - `PRD.md`: Masalah, tujuan, MVP scope, non-goals, katalog matriks fitur ber-ID stabil (`F-001`), dan acceptance criteria.
  - `architecture.md`: Komponen sistem, aliran data, pilihan tech stack beserta alasan, dan diagram arsitektur.
  - `design.md`: Halaman, navigasi, spesifikasi UI/UX, states, dan user flow diagram.
  - `database.md`: Entitas, relasi, constraint, dan ERD jika penyimpanan diperlukan.
  - `api.md`: Kontrak endpoint API internal/eksternal dalam format tabel rapi.
  - `implementation-plan.md`: Fase pengerjaan bertahap dan checklist checklist deliverable.
  - `decisions.md`: Catatan keputusan terkonfirmasi, alasan, asumsi, dan pertanyaan terbuka.
- **Render Visual Diagram (Mermaid)**:
  - Diagram alur otomatis di-render menjadi visual grafis dengan gaya desain Editorial & Paper Light yang selaras dengan antarmuka aplikasi.
  - Tombol beralih antara tampilan **Visual Diagram** dan **Kode Mermaid**.
  - Opsi toggle tema: **Kertas (Light)** ⇄ **Studio (Deep Forest Dark)**.
  - Tombol **Fullscreen** untuk presentasi dan inspeksi arsitektur.
- **Ekspor Fleksibel**:
  - **Salin Teks (Clipboard)**: Salin isi Markdown satu per satu langsung ke clipboard dengan tombol *Salin*.
  - **Unduh Satuan**: Unduh file dokumen spesifik dalam format `.md`.
  - **Unduh Semua (.zip)**: Unduh seluruh rangkaian dokumen proyek sekaligus dalam satu arsip file `.zip` (0 dependensi, cepat, aman offline).
- **Penyimpanan Lokal Mandiri**:
  - Setiap perubahan otomatis tersimpan di peramban (`localStorage`) dan server lokal disk (`.data/projects.json`), sehingga tombol **Simpan** langsung aktif tanpa perlu login pihak ketiga.

---

## Persyaratan Sistem

- Node.js `>= 22.13.0`
- Package manager: `pnpm` (disarankan) atau `npm`
- Router AI: [9Router](https://github.com/rmhyps) atau OpenAI-compatible completions API endpoint

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
NINE_ROUTER_BASE_URL=http://localhost:20128/v1
NINE_ROUTER_API_KEY=sk-your-api-key-here
NINE_ROUTER_MODEL=ag/gemini-3.8-flash-high
```

### 4. Jalankan Server Pengembangan
```bash
npm run dev
# atau
pnpm dev
```
Buka browser di:
👉 **`http://localhost:5173`** atau **`http://127.0.0.1:5173`**

---

## Skrip yang Tersedia

- `pnpm dev`: Menjalankan server pengembangan lokal dengan HMR pada port `5173`.
- `pnpm build`: Melakukan compile dan build produksi aplikasi dengan Vite/Vinext.
- `pnpm lint`: Menjalankan linter ESLint untuk memeriksa kualitas kode.

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
3. Lakukan build dan jalankan preview Worker:
   ```bash
   pnpm build
   pnpm start
   ```

---

## Lisensi

Dilisensikan di bawah lisensi MIT.

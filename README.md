# SignalForge — Content Intelligence

**Turn content signals into smarter decisions.**

Local-first · Multi-platform · AI-assisted · Evidence-driven

Dokumentasi ini adalah source of truth (development playbook) untuk membangun SignalForge, dashboard analitik konten lokal (local-first), dari initial project sampai fitur MVP selesai.

## Identitas produk

| Item | Nilai |
|---|---|
| Nama project | `SignalForge` |
| Nama aplikasi | `SignalForge — Content Intelligence` |
| Tagline | Turn content signals into smarter decisions. |
| Folder dokumentasi | `docs/` |
| Instruksi coding agent | `AGENTS.md` |

### Siklus analisis (prinsip inti produk)

1. **Measure** — catat metrik manual per platform sebagai snapshot, termasuk yang tidak lengkap (unknown ≠ 0).
2. **Understand** — baca performa pada usia post yang setara, dengan konteks platform, definisi metrik, dan keterbatasan data.
3. **Experiment** — ubah insight menjadi hipotesis dan eksperimen yang terukur.
4. **Improve** — catat keputusan dan pelajaran untuk konten berikutnya.

Nama `signalforge` (huruf kecil) dipakai untuk package name, nama folder, dan identifier teknis; `SignalForge — Content Intelligence` dipakai untuk judul aplikasi dan UI.

## Cara memakai dokumentasi

1. Baca `docs/product/PRD.md` dan `docs/delivery/ROADMAP.md` untuk memahami tujuan dan urutan kerja.
2. Baca `docs/architecture/ARCHITECTURE.md`, `docs/architecture/DATA_MODEL.md`, dan seluruh ADR sebelum mengubah fondasi teknis.
3. Ikuti `docs/design/DESIGN_SYSTEM.md` dan `docs/design/REFERENCE_RESEARCH.md` untuk implementasi UI.
4. Ikuti `docs/ai/AI_CONNECTIONS.md` sebelum mengerjakan koneksi Claude/Codex.
5. Jalankan checklist di `docs/testing/QUALITY_GATES.md` untuk setiap milestone.
6. Update `docs/delivery/IMPLEMENTATION_LOG.md` dan status roadmap setelah setiap pekerjaan selesai.

## Aturan untuk Claude dan Codex

- Baca `AGENTS.md` sebelum mengubah kode.
- Jangan mengklaim test lulus jika tidak benar-benar dijalankan.
- Jangan mengganti keputusan arsitektur tanpa ADR baru atau revisi ADR yang ada.
- Data yang tidak diketahui harus `NULL`/unknown, bukan `0`.
- Pisahkan observasi dari hipotesis; korelasi bukan bukti kausalitas.
- Jangan mengirim data ke model AI tanpa aksi pengguna yang jelas dan ringkasan data yang akan dikirim.
- Jangan meminta atau menampilkan access token, refresh token, cookie, atau isi file kredensial.

## Menjalankan secara lokal

Prasyarat: Node.js >= 22.13 (memakai `node:sqlite` bawaan, masih experimental — lihat ADR 0005) dan pnpm (ADR 0004).

```bash
pnpm install
pnpm dev      # http://127.0.0.1:3000 (hanya loopback)
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium   # sekali saja
pnpm test:e2e # build produksi + server di 127.0.0.1:3100 dengan database sementara; hentikan `pnpm dev` dulu
pnpm build
```

Data tersimpan di `./.data/` (database SQLite + `backups/`), dapat diubah lewat `SIGNALFORGE_DATA_DIR`. Salin `.env.example` ke `.env.local` jika perlu override. Jangan menaruh token atau secret di file env. Hapus data lokal dengan menghapus folder tersebut saat server berhenti.

## Fitur

Tersedia: ringkasan; CRUD episode + tag; CRUD distribusi (Facebook/YouTube/TikTok); snapshot metrik manual (append-only; koreksi lewat snapshot pengganti); definisi metrik yang dapat dikonfigurasi; analitik pada usia post yang setara (per platform, tidak digabung; nilai tidak diketahui tetap kosong, bukan 0); eksperimen dengan ambang sukses terstruktur dan bukti observasional; impor/ekspor CSV, cadangan dan pemulihan database; koneksi AI opsional (Claude dan Codex lewat CLI resmi) dengan persetujuan sebelum data dikirim; `/api/health`.

Belum ada: tema gelap, data demo, pengelolaan tag terpisah. Lihat `docs/delivery/ROADMAP.md` dan batasan yang diketahui di bawah.

## Data Anda

- **Lokasi:** `./.data/` (database `signalforge.sqlite` dan folder `backups/`), atau folder dari `SIGNALFORGE_DATA_DIR`. Tidak ada data yang keluar dari komputer ini kecuali Anda menjalankan analisis AI dan menyetujui ringkasan data yang ditampilkan.
- **CSV:** menu *Impor & Ekspor*. Unduh templat, isi, unggah, tinjau pratinjau (baris valid/ditolak), lalu simpan. Impor bersifat semua-atau-tidak-sama-sekali per snapshot; duplikat dapat dilewati atau digantikan (snapshot lama tidak pernah diubah). Sel teks yang diawali `= + - @` diberi awalan `'` saat ekspor agar tidak dieksekusi spreadsheet; angka tidak diubah. Format dan batasnya ada di `docs/adr/0007-csv-format-and-backup-restore.md`.
- **Cadangan:** tombol *Buat cadangan* menyimpan salinan konsisten ke `.data/backups/`. Cadangan otomatis dibuat sebelum migrasi skema dan sebelum pemulihan.
- **Pulihkan:** unggah file `.sqlite` di halaman Cadangan, tinjau ringkasan, ketik `PULIHKAN`. File divalidasi dulu (integritas, versi skema, tabel yang diharapkan, tanpa trigger/view asing); jika gagal, database sekarang tidak berubah. Pulihkan manual: hentikan server, ganti `signalforge.sqlite` dengan salinan dari `backups/`, jalankan lagi.
- **Menghapus semua data:** hentikan server lalu hapus folder data.

## Koneksi AI (opsional)

Dasbor berfungsi penuh tanpa AI. Buka *Pengaturan → Koneksi AI* untuk melihat status Claude dan Codex, memasang/masuk lewat alur resmi masing-masing, dan menguji koneksi (satu permintaan nyata, dengan konfirmasi). Analisis dimulai dari tombol *Analisis dengan AI* di halaman Analitik: Anda melihat rentang tanggal, jumlah data, kolom yang dikirim/tidak dikirim, dan payload persisnya sebelum menekan *Lanjutkan*. SignalForge tidak pernah meminta atau menampilkan token; tidak ada kolom token. Detail dan batasan: `docs/ai/AI_CONNECTIONS.md`, ADR 0008.

Variabel lingkungan opsional: `SIGNALFORGE_DATA_DIR`, `SIGNALFORGE_CLAUDE_PATH` / `SIGNALFORGE_CODEX_PATH` (lokasi lengkap CLI jika tidak ada di PATH), `SIGNALFORGE_AI_MODE=fake` (hanya untuk pengujian: penyedia palsu dalam proses, ditandai banner "Mode uji").

## Pemecahan masalah

- *Port 3000 dipakai / E2E gagal start:* hentikan `pnpm dev` lain; E2E memakai port 3100 dan menulis ke `.next`.
- *`node:sqlite` tidak ditemukan:* butuh Node.js >= 22.13.
- *CLI AI "tidak ditemukan":* jalankan SignalForge dari terminal baru setelah memasang CLI, atau set `SIGNALFORGE_CLAUDE_PATH`/`SIGNALFORGE_CODEX_PATH`. Panel *Cara menyiapkan* di tiap kartu memuat langkah per OS.
- *Halaman 403:* server hanya menerima Host loopback (`127.0.0.1`, `localhost`) dan permintaan tulis dari origin yang sama.
- *Database tidak bisa dibuka setelah upgrade:* pulihkan salinan pra-migrasi di `.data/backups/`.

## Batasan yang diketahui (v0.1.0)

- `node:sqlite` masih berstatus experimental di Node.js; versi Node dibatasi lewat `engines`.
- Analisis AI hanya diuji dengan CLI palsu dan penyedia palsu; login dan inferensi asli ke Claude/Codex belum dijalankan di repositori ini, dan bentuk keluaran CLI asli dapat berbeda antar versi.
- Audit pembaca layar dan axe, serta uji di browser selain Chromium, belum dijalankan.
- Eksperimen tidak dapat dibuka lagi setelah selesai; bukti bersifat observasional (bukan sebab-akibat).
- Grafik adalah SVG tanpa zoom; tidak ada tema gelap.

## Struktur

- `AGENTS.md` — instruksi lintas-agent.
- `docs/product/PRD.md` — problem, target user, scope, requirements.
- `docs/architecture/ARCHITECTURE.md` — struktur aplikasi dan batas proses.
- `docs/architecture/DATA_MODEL.md` — entitas dan aturan data.
- `docs/design/DESIGN_SYSTEM.md` — visual language dan UI behavior.
- `docs/design/REFERENCE_RESEARCH.md` — inspirasi desain yang diteliti.
- `docs/ai/AI_CONNECTIONS.md` — koneksi Claude/Codex dan halaman setup.
- `docs/security/SECURITY.md` — threat model dan mitigasi.
- `docs/testing/QUALITY_GATES.md` — test strategy dan Definition of Done.
- `docs/delivery/ROADMAP.md` — milestone dari setup sampai MVP.
- `docs/delivery/IMPLEMENTATION_LOG.md` — log keputusan, progress, blocker.
- `docs/adr/` — architecture decision records.

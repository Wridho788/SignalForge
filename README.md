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

## Status awal

Repository saat ini hanya berisi dokumentasi (belum ada `package.json`, source code, atau git history). Inspeksi M0 dicatat di `docs/delivery/IMPLEMENTATION_LOG.md`. Implementasi, versi dependency, dan status fitur harus diverifikasi terhadap repository ketika kode ada. Tidak ada fitur yang dianggap selesai hanya karena spesifikasinya sudah ditulis.

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

## Status fitur (setelah M3)

Tersedia: ringkasan, CRUD episode + tag, CRUD distribusi (Facebook/YouTube/TikTok), timeline snapshot metrik manual (append-only, koreksi lewat snapshot pengganti), definisi metrik yang dapat dikonfigurasi, pengaturan zona waktu dan jendela perbandingan, `/api/health`. Belum ada: analitik dan perbandingan usia setara (M4), eksperimen (M5), impor/ekspor CSV dan cadangan manual (M6), AI Connections (M7), tema gelap dan data demo. Lihat `docs/delivery/ROADMAP.md`.

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

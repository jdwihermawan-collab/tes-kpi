# Checklist Setting Cron Job — TES KPI

Status: **BELUM DISETTING**. Dikerjakan nanti bersama, dari awal sampai akhir.
Aplikasi: https://tes-kpi-8lbc.vercel.app — Firebase: `tes-kpi-0f618c`

---

## A. Kenapa butuh cron job

Vercel (paket gratis) tidak bisa menjalankan tugas tiap menit sendiri, jadi dipakai layanan
gratis **cron-job.org** yang "mengetuk" alamat `/api/cron` setiap 1 menit. Setiap ketukan,
server memeriksa apakah ada tugas yang perlu dijalankan.

Tanpa cron, fitur berikut **TIDAK jalan**:

| # | Fitur | Jadwal | Penerima |
|---|-------|--------|----------|
| 1 | Lead tidak diterima 5 menit → dialihkan otomatis ke marketing berikutnya | tiap menit | Marketing berikutnya |
| 2 | Peringatan "Sisa 1 menit, segera tekan Terima" | tiap menit | Marketing yang dituju |
| 3 | "Lead belum diterima siapa pun" (semua marketing terlewati) | tiap menit | CS + SPV/Manager |
| 4 | Cadangan push "Lead baru masuk" kalau push dari aplikasi CS gagal | tiap menit | Marketing yang dituju |
| 5 | Pengingat janji kunjungan hari ini | 08.00 WIB | SPV/Manager + marketing-nya |
| 6 | Ringkasan follow-up hari ini | 09.00 WIB | Marketing |
| 7 | **KPI:** belum lapor Live TikTok / Canvasing hari ini | 16.00 WIB, Senin–Sabtu | Marketing yang belum lapor |
| 8 | **KPI:** skor di bawah jalur | tanggal 20, 10.00 WIB (sekali sebulan) | Marketing + ringkasan ke SPV/Manager |
| 9 | **KPI:** simpan rekap bulan lalu untuk grafik tren 6 bulan | tanggal 3, 02.00 WIB (sekali sebulan) | — (tanpa notifikasi) |

Yang **tidak** butuh cron (sudah jalan): push lead baru dari CS, lead diterima, janji kunjungan
dibuat/dibatalkan, Kirim Notif, closing perlu verifikasi, closing disetujui/ditolak, laporan
tidak valid.

---

## B. Yang perlu disiapkan

### B1. Di Vercel (project `tes-kpi`) → Settings → Environment Variables

| Nama | Wajib? | Isi | Status |
|------|--------|-----|--------|
| `FIREBASE_SERVICE_ACCOUNT` | Wajib | Isi lengkap file JSON service account Firebase `tes-kpi-0f618c` | ☐ cek sudah ada |
| `CRON_SECRET` | Wajib | Kata sandi acak & panjang (jangan dibagikan). Dipakai juga di URL cron | ☐ cek sudah ada |
| `APP_URL` | Disarankan | `https://tes-kpi-8lbc.vercel.app` (link di notifikasi) | ☐ |
| `DAILY_REMINDER_HOUR` | Opsional | Jam ringkasan follow-up, default `9` | ☐ |
| `VISIT_REMINDER_HOUR` | Opsional | Jam pengingat kunjungan, default `8` | ☐ |
| `REPORT_REMINDER_HOUR` | Opsional | Jam pengingat laporan Live/Canvasing, default `16` | ☐ |
| `KPI_PACE_DAY` | Opsional | Tanggal pengingat KPI, default `20` | ☐ |
| `KPI_PACE_HOUR` | Opsional | Jam pengingat KPI, default `10` | ☐ |
| `KPI_LOCK_DAY` | Opsional | Tanggal simpan rekap bulan lalu (grafik tren), default `3` | ☐ |
| `KPI_LOCK_HOUR` | Opsional | Jam simpan rekap bulan lalu, default `2` | ☐ |

Semua jam memakai **WIB**. Setelah menambah/mengubah variabel → **Redeploy**.

### B2. Di cron-job.org

| Langkah | Isi | Status |
|---------|-----|--------|
| Akun | Daftar / login di https://cron-job.org (gratis) | ☐ |
| Buat job baru | Title: `TES KPI - cron` | ☐ |
| URL | `https://tes-kpi-8lbc.vercel.app/api/cron?key=ISI_CRON_SECRET` | ☐ |
| Jadwal | **Every 1 minute** | ☐ |
| Method | GET (default) | ☐ |
| Timeout | Maksimal yang tersedia (pengingat tanggal 20 butuh beberapa detik) | ☐ |
| Notifikasi gagal | Aktifkan "notify on failure" ke email sendiri | ☐ |
| Zona waktu | Bebas (server sudah menghitung WIB sendiri) | — |

### B3. Di HP masing-masing akun (supaya push sampai)

| Langkah | Status |
|---------|--------|
| Buka aplikasi → tekan **Aktifkan Notifikasi** → izinkan | ☐ |
| iPhone: aplikasi harus di-"Add to Home Screen" dulu, lalu dibuka dari ikon itu | ☐ |
| Uji dengan **Tes Push** (Super Admin) ke akun tersebut | ☐ |

### B4. Firestore

Tidak perlu index tambahan untuk cron (semua query memakai satu field).

---

## C. Cara menguji setelah disetting

1. Buka di browser: `https://tes-kpi-8lbc.vercel.app/api/cron?key=ISI_CRON_SECRET`
   → harus muncul JSON seperti `{"pending":0, ..., "errors":[]}`.
   - `401 Kunci salah` → `CRON_SECRET` di URL tidak sama dengan di Vercel.
   - `500 Server belum dikonfigurasi` → `FIREBASE_SERVICE_ACCOUNT` belum benar.
2. Di cron-job.org → History: status harus **200** setiap menit.
3. Uji pengalihan lead: CS input lead iklan, marketing jangan tekan Terima → menit ke-4
   muncul "Sisa 1 menit", menit ke-5 lead pindah ke marketing berikutnya.
4. Uji pengingat jam tertentu tanpa menunggu: ubah sementara `REPORT_REMINDER_HOUR` ke jam
   sekarang (WIB) → Redeploy → tunggu 1–2 menit. Kembalikan ke `16` setelahnya.
   (Pengingat hanya terkirim sekali per hari; penandanya di dokumen `settings/pushReport`.)

---

## D. Perkiraan pemakaian kuota (Firebase gratis: 50.000 baca/hari)

| Sumber | Perkiraan |
|--------|-----------|
| Cron tiap menit tanpa kejadian | 1 baca × 1.440 menit ≈ **1.440 baca/hari** |
| Pengingat 08.00 / 09.00 | sekali sehari, sebanyak lead aktif / kunjungan hari itu |
| Pengingat 16.00 | 1 baca per marketing per hari |
| Pengingat tanggal 20 | sekali sebulan, sebanyak lead yang berubah bulan itu |

Vercel: 1.440 panggilan fungsi/hari, masih dalam batas paket gratis.

---

## E. Catatan

- Aplikasi CRM PRN yang asli punya cron sendiri; **jangan** dipakai untuk TES KPI
  (database berbeda). Buat job baru khusus TES KPI.
- Kalau nanti pakai domain sendiri, ganti URL di cron-job.org dan `APP_URL`.

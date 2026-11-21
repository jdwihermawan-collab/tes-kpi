# tes-kpi
Pengembangan dari CRM PRN (Lead Tracker) untuk uji coba fitur KPI Marketing.
Memakai Firebase project TERPISAH dari crm-prn supaya data tidak tercampur.

Yang perlu diisi setelah Firebase baru dibuat:
1. `index.html` -> `APP_CONFIG.firebase` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, vapidKey)
2. `firebase-messaging-sw.js` -> config yang sama
3. Vercel env: `FIREBASE_SERVICE_ACCOUNT` (JSON service account project baru), `CRON_SECRET`, opsional `APP_URL`
4. Firestore Rules: salin isi `firestore.rules` ke Firebase Console project baru
5. `APP_CONFIG.crmUrl` -> URL Vercel aplikasi tes ini

## KPI Marketing (bulanan)
Menu **KPI** di panel SPV/Manager & Super Admin, dan kartu **KPI Saya** di panel Marketing.
Super Admin bisa mengubah target & bobot lewat tombol **Atur Target** (tersimpan di `settings/kpi`).

| Indikator | Target | Bobot | Cara hitung |
|---|---|---|---|
| Online/Offline | 26 kali | 10% | Laporan Live TikTok / Canvasing dari marketing, maks. 1 per hari |
| Database Baru | 78 | 10% | Lead Input Mandiri yang masuk bulan itu |
| Follow Up User | 250 kali | 10% | Setiap Update Status lead bulan itu |
| User Survey | 4 user | 15% | Lead yang pertama kali masuk Site Visit bulan itu |
| User WI | 2 user | 5% | Lead bersumber Walk-in yang masuk bulan itu |
| Closing ITJ | 1 user | 15% | Lead yang pertama kali masuk status Closing ITJ bulan itu |
| Closing SPPR | 1 user | 35% | Lead yang pertama kali masuk status Closing SPPR bulan itu |

Skor per indikator = min(capaian / target, 1) x bobot (total maksimal 100).
Status lead baru: `Closing ITJ` dan `Closing SPPR` (menggantikan `Closed (Deal)`).
Laporan Online/Offline disimpan di `kpiReports/{uid}/kpiItems` (lihat `firestore.rules`).

## Index Firestore
Daftar index gabungan ada di `firestore.indexes.json` (sudah dibuat di project `tes-kpi-0f618c`):
- `leads`: assignedTo + lastUpdated — KPI marketing hanya membaca lead yang berubah bulan itu (hemat read)
- `leads`: assignedTo + createdAt — mode hemat daftar lead marketing
Tanpa index, aplikasi tetap jalan (otomatis memakai query lengkap), hanya lebih boros read.

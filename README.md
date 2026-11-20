# tes-kpi
Pengembangan dari CRM PRN (Lead Tracker) untuk uji coba fitur KPI Marketing.
Memakai Firebase project TERPISAH dari crm-prn supaya data tidak tercampur.

Yang perlu diisi setelah Firebase baru dibuat:
1. `index.html` -> `APP_CONFIG.firebase` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, vapidKey)
2. `firebase-messaging-sw.js` -> config yang sama
3. Vercel env: `FIREBASE_SERVICE_ACCOUNT` (JSON service account project baru), `CRON_SECRET`, opsional `APP_URL`
4. Firestore Rules: salin isi `firestore.rules` ke Firebase Console project baru
5. `APP_CONFIG.crmUrl` -> URL Vercel aplikasi tes ini

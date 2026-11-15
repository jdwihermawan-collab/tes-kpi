/* Service worker Push Notification (Firebase Cloud Messaging).
   Wajib berada di root situs (/firebase-messaging-sw.js).
   Config di bawah HARUS sama dengan bagian `firebase` di APP_CONFIG (index.html).
   Notifikasi yang dikirim server memakai `webpush.notification` + `fcmOptions.link`,
   jadi SDK otomatis menampilkannya saat aplikasi ditutup/di latar belakang dan
   membuka link tersebut saat notifikasi ditekan. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCtATrTFtvUEqe2G5mOplp4LMIzZKkIdNM',
  authDomain: 'crm-prn-d93a4.firebaseapp.com',
  projectId: 'crm-prn-d93a4',
  storageBucket: 'crm-prn-d93a4.firebasestorage.app',
  messagingSenderId: '249285239078',
  appId: '1:249285239078:web:e223d46bc2417ca1bce1e7'
});

firebase.messaging();

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

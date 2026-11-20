/* Service worker Push Notification (Firebase Cloud Messaging).
   Wajib berada di root situs (/firebase-messaging-sw.js).
   Config di bawah HARUS sama dengan bagian `firebase` di APP_CONFIG (index.html).
   Notifikasi yang dikirim server memakai `webpush.notification` + `fcmOptions.link`,
   jadi SDK otomatis menampilkannya saat aplikasi ditutup/di latar belakang dan
   membuka link tersebut saat notifikasi ditekan. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Isi dengan config Firebase project BARU (TES KPI), sama persis dengan APP_CONFIG.firebase di index.html.
firebase.initializeApp({
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
});

firebase.messaging();

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

// ============================================================
// Vercel Serverless Function: kirim Push Notification (Firebase Cloud Messaging).
//
// POST /api/send-push
//   Header : Authorization: Bearer <Firebase ID token pengguna yang login>
//   Body   : { targetUid: '<uid>' | '__all__', title, body }
//
// Saat ini hanya Super Admin yang boleh memanggil (tombol "Tes Push").
//
// Environment Variable di Vercel (Settings > Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT = isi LENGKAP file JSON dari Firebase Console >
//                              Project settings > Service accounts > Generate new private key
// ============================================================
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum diisi di Vercel.');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });

  try {
    initAdmin();
  } catch (e) {
    return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message });
  }

  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Belum login.' });

  let caller;
  try {
    caller = await admin.auth().verifyIdToken(m[1]);
  } catch (e) {
    return res.status(401).json({ error: 'Sesi login tidak valid. Coba keluar lalu masuk lagi.' });
  }

  const db = admin.firestore();
  const me = await db.collection('users').doc(caller.uid).get();
  if (!me.exists || me.data().role !== 'SuperAdmin' || me.data().active === false) {
    return res.status(403).json({ error: 'Hanya Super Admin yang boleh mengirim tes notifikasi.' });
  }

  const body = readBody(req);
  const targetUid = String(body.targetUid || '');
  const title = String(body.title || 'Tes Notifikasi').slice(0, 100);
  const text = String(body.body || 'Push notification berhasil diterima.').slice(0, 300);
  if (!targetUid) return res.status(400).json({ error: 'Pilih penerima.' });

  const docs = targetUid === '__all__'
    ? (await db.collection('pushTokens').get()).docs
    : [await db.collection('pushTokens').doc(targetUid).get()].filter(function (d) { return d.exists; });

  const owners = [];   // { token, ref }
  docs.forEach(function (d) {
    (d.data().tokens || []).forEach(function (t) { if (t) owners.push({ token: t, ref: d.ref }); });
  });
  if (!owners.length) {
    return res.status(404).json({ error: 'Penerima belum mengaktifkan notifikasi di perangkatnya.' });
  }

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const link = proto + '://' + req.headers.host + '/';

  const result = await admin.messaging().sendEachForMulticast({
    tokens: owners.map(function (o) { return o.token; }),
    data: { title: title, body: text, link: link },
    webpush: {
      notification: {
        title: title,
        body: text,
        icon: link + 'icons/icon-192.png',
        badge: link + 'icons/icon-192.png',
        tag: 'crm-' + Date.now()
      },
      fcmOptions: { link: link }
    }
  });

  // Bersihkan token yang sudah tidak berlaku (aplikasi dihapus, izin dicabut, dsb).
  const cleanups = [];
  result.responses.forEach(function (r, i) {
    if (!r.success && r.error && INVALID_TOKEN_CODES.indexOf(r.error.code) !== -1) {
      cleanups.push(owners[i].ref.update({ tokens: admin.firestore.FieldValue.arrayRemove(owners[i].token) }));
    }
  });
  await Promise.all(cleanups).catch(function () {});

  return res.status(200).json({
    sent: result.successCount,
    failed: result.failureCount,
    removed: cleanups.length,
    devices: owners.length
  });
};

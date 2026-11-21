// ============================================================
// POST /api/reset-data  — "Reset Data" khusus Super Admin (menu Kelola Akun > Reset Data):
// menghapus data uji coba supaya tidak tercampur dengan data asli.
//   Header : Authorization: Bearer <Firebase ID token Super Admin>
//   Body   : { action: 'count' }                                  -> jumlah data per jenis
//            { action: 'reset', confirm: 'RESET', items: [...] }  -> hapus (dipanggil berulang
//                                                                    sampai more = false)
//   items  : 'leads' (wajib)  = semua lead buyer (input CS & input mandiri marketing) + indeks nomor WA
//            'spam'           = nomor spam dari CS
//            'reminderLogs'   = log pengingat WA ke marketing
//            'activity'       = aktivitas marketing (login / update)
//            'broadcasts'     = riwayat Kirim Notif + riwayat lonceng (notifLogs)
//            'rotation'       = antrean giliran rotasi lead dimulai ulang
// Akun (users, credentials, pushTokens) dan pengaturan (daftar proyek dsb.) TIDAK pernah dihapus.
//
// Satu panggilan dibatasi ~7 detik supaya tidak kena batas waktu Vercel; aplikasi memanggil
// lagi selama more = true. Setiap dokumen yang dihapus dihitung 1 "delete" di kuota Firestore.
// ============================================================
const L = require('./_lib');

const ITEMS = {
  leads: ['leads', 'waIndex'],
  spam: ['spamNumbers'],
  reminderLogs: ['reminderLogs'],
  activity: ['marketingActivity'],
  broadcasts: ['broadcasts', 'notifLogs']
};
const TIME_BUDGET_MS = 7000;
const PAGE = 400;

// Isi subkoleksi marketingActivity/{uid}/logs ikut dihapus (dan itulah yang dihitung);
// indeks nomor WA ikut dihapus bersama lead tapi tidak ditampilkan di hitungan.
function queriesFor(item) {
  const db = L.db();
  if (item === 'activity') {
    return [{ q: db.collectionGroup('logs'), counted: true }, { q: db.collection('marketingActivity'), counted: false }];
  }
  return ITEMS[item].map(function (c) { return { q: db.collection(c), counted: c !== 'waIndex' }; });
}

async function countItem(item) {
  let total = 0;
  for (const x of queriesFor(item)) {
    if (x.counted) total += (await x.q.count().get()).data().count;
  }
  return total;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });
  try { L.initAdmin(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message }); }

  const caller = await L.authUser(req);
  if (!caller) return res.status(401).json({ error: 'Belum login / sesi tidak valid.' });
  if (caller.profile.role !== 'SuperAdmin') return res.status(403).json({ error: 'Hanya Super Admin yang boleh mereset data.' });

  const body = L.readBody(req);

  if (body.action === 'count') {
    const counts = {};
    for (const item of Object.keys(ITEMS)) counts[item] = await countItem(item);
    return res.json({ counts: counts });
  }

  if (body.action !== 'reset') return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  if (body.confirm !== 'RESET') return res.status(400).json({ error: 'Ketik RESET untuk konfirmasi.' });
  const requested = Array.isArray(body.items) ? body.items.map(String) : [];
  const items = ['leads'].concat(requested.filter(function (i) { return i !== 'leads' && ITEMS[i]; }));

  const started = Date.now();
  const deleted = {};
  let more = false;
  outer:
  for (const item of items) {
    deleted[item] = 0;
    for (const x of queriesFor(item)) {
      while (true) {
        if (Date.now() - started > TIME_BUDGET_MS) { more = true; break outer; }
        const snap = await x.q.select().limit(PAGE).get();
        if (snap.empty) break;
        const batch = L.db().batch();
        snap.docs.forEach(function (d) { batch.delete(d.ref); });
        await batch.commit();
        if (x.counted) deleted[item] += snap.size;
        if (snap.size < PAGE) break;
      }
    }
  }

  if (!more) {
    if (requested.indexOf('rotation') !== -1) {
      await L.db().collection('settings').doc('adRotation')
        .set({ queue: [], counter: 0, updatedAt: L.FieldValue.serverTimestamp() }, { merge: true });
    }
    await L.db().collection('settings').doc('lastReset').set({
      by: caller.profile.name || '', byUid: caller.uid, items: items.concat(requested.indexOf('rotation') !== -1 ? ['rotation'] : []),
      at: L.FieldValue.serverTimestamp()
    });
  }

  return res.json({ deleted: deleted, more: more });
};

// ============================================================
// POST /api/broadcast  — "Kirim Notif" dari SPV/Manager (role Admin) & Super Admin:
// push peringatan atau pengumuman ke marketing / tim.
//   Header : Authorization: Bearer <Firebase ID token>
//   Body   : { action: 'send', target, names?, title, body }   -> kirim
//            { action: 'history' }                              -> 10 kiriman terakhir
//   target : 'due'       = marketing yang masih punya lead belum di-follow up hari ini
//            'marketing' = semua marketing aktif
//            'groupA' / 'groupB' = marketing per grup
//            'pick'      = marketing tertentu (names: [nama, ...])
//            'team'      = semua marketing + CS
// {nama} dan {jumlah} di judul/isi diganti untuk tiap penerima.
//
// Hemat kuota Firestore: lead hanya dibaca (lead aktif saja) kalau target 'due' atau pesan
// memakai {jumlah}. Setiap kiriman dicatat 1 dokumen di koleksi broadcasts (ditulis server,
// tidak perlu Firestore Rules tambahan).
// ============================================================
const L = require('./_lib');

const TARGET_LABELS = {
  due: 'Marketing belum follow-up',
  marketing: 'Semua marketing',
  groupA: 'Marketing Grup A',
  groupB: 'Marketing Grup B',
  pick: 'Marketing pilihan',
  team: 'Semua tim (marketing + CS)'
};
const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

// Sama dengan pengingat harian di cron.js & lonceng di aplikasi: 'New' selalu dihitung,
// status lain dihitung kalau jadwal follow-up-nya hari ini atau sudah lewat.
async function dueCounts() {
  const todayKey = L.wibParts(Date.now()).dateKey;
  const snap = await L.db().collection('leads').where('status', 'not-in', L.CLOSED_STATUSES).get();
  const counts = {};
  snap.docs.forEach(function (d) {
    const l = d.data();
    if (!l.assignedTo || l.pendingAccept === true || L.CLOSED_STATUSES.indexOf(l.status) !== -1) return;
    let due = l.status === 'New';
    if (!due) {
      const ms = L.toMillis(l.nextFollowUpDate || l.lastUpdated || l.createdAt);
      due = !!ms && L.wibParts(ms).dateKey <= todayKey;
    }
    if (due) counts[l.assignedTo] = (counts[l.assignedTo] || 0) + 1;
  });
  return counts;
}

function pickRecipients(users, target, names, counts) {
  const marketing = users.filter(function (u) { return u.role === 'Marketing'; });
  if (target === 'due') return marketing.filter(function (u) { return counts[u.name] > 0; });
  if (target === 'marketing') return marketing;
  if (target === 'groupA') return marketing.filter(function (u) { return u.group !== 'B'; });
  if (target === 'groupB') return marketing.filter(function (u) { return u.group === 'B'; });
  if (target === 'pick') {
    const set = new Set(names);
    return marketing.filter(function (u) { return set.has(u.name); });
  }
  if (target === 'team') return users.filter(function (u) { return u.role === 'Marketing' || u.role === 'CS'; });
  return [];
}

async function history(res) {
  const snap = await L.db().collection('broadcasts').orderBy('createdAt', 'desc').limit(10).get();
  return res.json({
    items: snap.docs.map(function (d) {
      const b = d.data();
      return {
        id: d.id, title: b.title || '', body: b.body || '', targetLabel: b.targetLabel || '',
        senderName: b.senderName || '', recipientCount: b.recipientCount || 0,
        sent: b.sent || 0, createdAt: L.toMillis(b.createdAt)
      };
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });
  try { L.initAdmin(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message }); }

  const caller = await L.authUser(req);
  if (!caller) return res.status(401).json({ error: 'Belum login / sesi tidak valid.' });
  const role = caller.profile.role;
  if (role !== 'Admin' && role !== 'SuperAdmin') {
    return res.status(403).json({ error: 'Hanya SPV/Manager dan Super Admin yang boleh mengirim notif.' });
  }

  const body = L.readBody(req);
  if (body.action === 'history') return history(res);

  const target = String(body.target || '');
  if (!TARGET_LABELS[target]) return res.status(400).json({ error: 'Pilih penerima.' });
  const title = String(body.title || '').trim().slice(0, 80);
  const text = String(body.body || '').trim().slice(0, 500);
  if (!title || !text) return res.status(400).json({ error: 'Judul dan isi pesan wajib diisi.' });
  const names = Array.isArray(body.names) ? body.names.map(String).slice(0, 100) : [];
  if (target === 'pick' && !names.length) return res.status(400).json({ error: 'Pilih minimal satu marketing.' });

  const users = await L.activeUsers();
  const needCounts = target === 'due' || /\{jumlah\}/i.test(title + ' ' + text);
  const counts = needCounts ? await dueCounts() : {};
  const recipients = pickRecipients(users, target, names, counts);
  if (!recipients.length) {
    return res.json({
      recipients: 0, sent: 0, failed: 0, devices: 0, noDevice: [],
      info: target === 'due' ? 'Semua marketing sudah follow-up hari ini. Tidak ada yang dikirimi.' : 'Tidak ada penerima yang cocok.'
    });
  }

  // Token perangkat semua penerima dibaca sekaligus (1 baca per penerima).
  const db = L.db();
  const snaps = await db.getAll.apply(db, recipients.map(function (u) { return db.collection('pushTokens').doc(u.uid); }));
  const link = L.baseUrl(req);
  const tag = 'broadcast-' + Date.now();
  const fill = function (s, u) {
    return s.replace(/\{nama\}/gi, u.name).replace(/\{jumlah\}/gi, String(counts[u.name] || 0));
  };
  // Riwayat lonceng tiap penerima (termasuk yang belum mengaktifkan push).
  await L.logNotifMany(recipients.map(function (u) {
    return { uid: u.uid, msg: { title: fill(title, u), body: fill(text, u), kind: 'broadcast' } };
  }));
  const messages = [];
  const owners = [];
  const noDevice = [];
  recipients.forEach(function (u, i) {
    const s = snaps[i];
    const tokens = s && s.exists ? (s.data().tokens || []).filter(Boolean) : [];
    if (!tokens.length) { noDevice.push(u.name); return; }
    const t = fill(title, u);
    const b = fill(text, u);
    tokens.forEach(function (token) {
      owners.push({ token: token, ref: s.ref });
      messages.push({
        token: token,
        data: { title: t, body: b, link: link, kind: 'broadcast', leadId: '' },
        webpush: {
          notification: {
            title: t, body: b,
            icon: link + 'icons/icon-192.png', badge: link + 'icons/icon-192.png',
            tag: tag, renotify: true, requireInteraction: true
          },
          fcmOptions: { link: link }
        }
      });
    });
  });

  let sent = 0;
  let failed = 0;
  const cleanups = [];
  for (let i = 0; i < messages.length; i += 500) {
    const result = await L.admin.messaging().sendEach(messages.slice(i, i + 500));
    sent += result.successCount;
    failed += result.failureCount;
    result.responses.forEach(function (r, j) {
      if (!r.success && r.error && INVALID_TOKEN_CODES.indexOf(r.error.code) !== -1) {
        const o = owners[i + j];
        cleanups.push(o.ref.update({ tokens: L.FieldValue.arrayRemove(o.token) }));
      }
    });
  }
  await Promise.all(cleanups).catch(function () {});

  await db.collection('broadcasts').add({
    title: title, body: text, target: target, targetLabel: TARGET_LABELS[target],
    senderName: caller.profile.name || '', senderUid: caller.uid,
    recipients: recipients.map(function (u) { return u.name; }), recipientCount: recipients.length,
    noDevice: noDevice, sent: sent, failed: failed, devices: messages.length,
    createdAt: L.FieldValue.serverTimestamp()
  }).catch(function () {});

  return res.json({
    recipients: recipients.length, sent: sent, failed: failed, devices: messages.length,
    removed: cleanups.length, noDevice: noDevice
  });
};

// ============================================================
// GET /api/cron?key=<CRON_SECRET>  — dipanggil cron-job.org SETIAP 1 MENIT.
//
// Tugas:
//  1. Lead menunggu diterima yang lewat 5 menit -> dialihkan ke marketing berikutnya
//     di rotasi + push "Lead dialihkan ke kamu". Kalau semua sudah dilewati, ditandai
//     acceptExhausted dan CS + SPV diberi tahu lewat push (sekali per lead).
//  2. Lead yang tinggal <= 90 detik -> push "Sisa 1 menit" ke pemegangnya (sekali).
//     Jendelanya 90 detik (bukan 60) supaya tidak terlewat kalau cron telat beberapa detik.
//  3. Cadangan: lead baru yang push "lead masuk"-nya belum terkirim -> dikirim.
//  4. Setiap hari jam 09:00 WIB -> push ringkasan follow-up hari ini ke tiap marketing.
//  5. Setiap hari jam 08:00 WIB -> pengingat janji kunjungan hari ini ke SPV/Manager & marketing-nya.
//
// Hemat kuota Firestore: data akun (koleksi users) hanya dibaca kalau ada lead yang
// menunggu diterima, atau saat pengingat harian benar-benar dikirim. Kalau tidak ada
// apa-apa, satu panggilan cron hanya memakai 1 kali baca.
//
// Environment Variable di Vercel:
//   CRON_SECRET = kata sandi bebas (acak & panjang), sama dengan ?key= di cron-job.org
//   DAILY_REMINDER_HOUR (opsional) = jam pengingat harian WIB, default 9
//   VISIT_REMINDER_HOUR (opsional) = jam pengingat kunjungan WIB, default 8
// ============================================================
const L = require('./_lib');

const WARN_WINDOW_MS = 90 * 1000;

// Lead sudah dilewatkan ke semua marketing: beri tahu CS & SPV/Manager (sekali per lead).
async function notifyExhausted(ref, lead, users, link, out) {
  if ((lead.pushKeys || []).indexOf('exhausted') !== -1) return;
  if (!(await L.claimPushKey(ref, 'exhausted'))) return;
  const staffUids = users.filter(function (u) { return u.role === 'CS' || u.role === 'Admin'; })
    .map(function (u) { return u.uid; });
  await L.sendToUids(staffUids, {
    kind: 'lead-exhausted', leadId: lead.id, link: link, sticky: true, tag: 'exhausted-' + lead.id,
    title: 'Lead belum diterima siapa pun',
    body: (lead.buyerName || '-') + ' (' + (lead.project || '-') + ') sudah dilewatkan ke semua marketing. ' +
      'Sekarang dipegang ' + (lead.assignedTo || '-') + '. Buka CRM untuk menindaklanjuti.'
  });
  out.escalated++;
}

async function reassignOrWarn(doc, pool, users, link, now, out) {
  const ref = doc.ref;
  const lead = Object.assign({ id: doc.id }, doc.data());
  const deadline = L.toMillis(lead.acceptDeadline);
  if (!deadline) return;

  // 3. Cadangan push "lead masuk" (kalau aplikasi CS gagal memanggil /api/notify).
  if (!lead.reassignCount && (lead.pushKeys || []).indexOf('created') === -1 && deadline > now) {
    if (await L.claimPushKey(ref, 'created')) {
      await L.sendToUids(L.uidsByName(users, lead.assignedTo, 'Marketing'), L.msgLeadCreated(lead, link));
      out.created++;
    }
  }

  // 2. Peringatan sisa 1 menit.
  const warnKey = 'warn-' + (lead.reassignCount || 0);
  if (deadline > now && deadline - now <= WARN_WINDOW_MS && (lead.pushKeys || []).indexOf(warnKey) === -1) {
    if (await L.claimPushKey(ref, warnKey)) {
      await L.sendToUids(L.uidsByName(users, lead.assignedTo, 'Marketing'), L.msgLeadWarn(lead, link));
      out.warned++;
    }
    return;
  }

  // Sudah melewati semua marketing (ditandai server atau panel CS): pastikan CS & SPV tahu.
  if (lead.acceptExhausted) {
    await notifyExhausted(ref, lead, users, link, out);
    return;
  }

  // 1. Pengalihan. Kandidat diambil dari antrean giliran (settings/adRotation.queue):
  //    yang terlewat didahulukan untuk lead berikutnya, giliran penerima dianggap terpakai.
  if (deadline > now) return;
  const rotRef = L.db().collection('settings').doc('adRotation');
  let moved = null;
  await L.db().runTransaction(async function (tx) {
    moved = null;
    const s = await tx.get(ref);
    const rotSnap = await tx.get(rotRef);
    if (!s.exists) return;
    const d = s.data();
    if (d.pendingAccept !== true || d.acceptExhausted || L.toMillis(d.acceptDeadline) > Date.now()) return;
    const rot = rotSnap.exists ? rotSnap.data() : {};
    const queue = L.normalizeRotationQueue(rot.queue, pool, rot.counter || 0);
    const next = L.nextInQueue(queue, d);
    if (next === null) return;
    if (!next) { tx.update(ref, { acceptExhausted: true }); moved = { exhausted: true }; return; }
    const newDeadline = L.Timestamp.fromMillis(Date.now() + L.ACCEPT_WINDOW_MS);
    tx.set(rotRef, { queue: L.applyReassignToQueue(queue, d.assignedTo, next), updatedAt: L.FieldValue.serverTimestamp() }, { merge: true });
    tx.update(ref, {
      assignedTo: next,
      passedFrom: L.FieldValue.arrayUnion(d.assignedTo),
      acceptDeadline: newDeadline,
      acceptExhausted: false,
      reassignCount: L.FieldValue.increment(1),
      lastReassignAt: L.FieldValue.serverTimestamp(),
      reassignedBy: 'server'
    });
    moved = { to: next, count: (d.reassignCount || 0) + 1, deadline: newDeadline };
  });
  if (moved && moved.to) {
    out.reassigned++;
    const after = Object.assign({}, lead, { assignedTo: moved.to, acceptDeadline: moved.deadline, reassignCount: moved.count });
    if (await L.claimPushKey(ref, 'assign-' + moved.count)) {
      await L.sendToUids(L.uidsByName(users, moved.to, 'Marketing'), L.msgLeadAssigned(after, link));
    }
  } else if (moved && moved.exhausted) {
    out.exhausted++;
    await notifyExhausted(ref, lead, users, link, out);
  }
}

// 4. Ringkasan follow-up harian (sekali sehari, dicatat di settings/pushDaily).
//    loadUsers dipanggil hanya setelah dipastikan hari ini belum dikirim.
async function dailyReminder(loadUsers, link, now, out) {
  const hour = Number(process.env.DAILY_REMINDER_HOUR || 9);
  const t = L.wibParts(now);
  if (t.hour !== hour) return;
  const flagRef = L.db().collection('settings').doc('pushDaily');
  const go = await L.db().runTransaction(async function (tx) {
    const s = await tx.get(flagRef);
    if (s.exists && s.data().lastDate === t.dateKey) return false;
    tx.set(flagRef, { lastDate: t.dateKey, sentAt: L.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!go) return;

  const users = await loadUsers();
  // Hanya lead aktif (belum Closed/Lost) yang dibaca, supaya pemakaian kuota tidak ikut
  // membesar seiring bertambahnya lead lama yang sudah selesai.
  const leads = (await L.db().collection('leads').where('status', 'not-in', L.CLOSED_STATUSES).get())
    .docs.map(function (d) { return d.data(); });
  const todayKey = t.dateKey;
  const counts = {};
  leads.forEach(function (l) {
    if (!l.assignedTo || l.pendingAccept === true || L.CLOSED_STATUSES.indexOf(l.status) !== -1) return;
    // 'New' = belum pernah di-update marketing; status lain (termasuk 'Awal Chat') mengikuti jadwal.
    let due = l.status === 'New';
    if (!due) {
      const ms = L.toMillis(l.nextFollowUpDate || l.lastUpdated || l.createdAt);
      due = !!ms && L.wibParts(ms).dateKey <= todayKey;
    }
    if (due) counts[l.assignedTo] = (counts[l.assignedTo] || 0) + 1;
  });

  const marketing = users.filter(function (u) { return u.role === 'Marketing'; });
  for (const u of marketing) {
    const n = counts[u.name] || 0;
    if (!n) continue;
    await L.sendToUids([u.uid], {
      kind: 'daily', link: link, tag: 'daily-' + todayKey,
      title: 'Selamat pagi, ' + u.name + '!',
      body: 'Hari ini ada ' + n + ' lead yang wajib di-follow up. Yuk dicek di CRM.'
    });
    out.daily++;
  }
}

// 5. Pengingat janji kunjungan hari ini (sekali sehari jam 08:00 WIB, dicatat di settings/pushVisit):
//    ke SPV/Manager (role Admin) berupa ringkasan, dan ke marketing pemilik lead.
async function visitReminder(loadUsers, link, now, out) {
  const hour = Number(process.env.VISIT_REMINDER_HOUR || 8);
  const t = L.wibParts(now);
  if (t.hour !== hour) return;
  const flagRef = L.db().collection('settings').doc('pushVisit');
  const go = await L.db().runTransaction(async function (tx) {
    const s = await tx.get(flagRef);
    if (s.exists && s.data().lastDate === t.dateKey) return false;
    tx.set(flagRef, { lastDate: t.dateKey, sentAt: L.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!go) return;

  const visits = (await L.db().collection('leads').where('visitDate', '==', t.dateKey).get())
    .docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
    .filter(function (l) { return L.CLOSED_STATUSES.indexOf(l.status) === -1; })
    .sort(function (a, b) { return String(a.visitTime || '99').localeCompare(String(b.visitTime || '99')); });
  if (!visits.length) return;

  const users = await loadUsers();
  function line(l, withMarketing) {
    return (withMarketing ? (l.assignedTo || '-') + ': ' : '') + (l.buyerName || '-') + ' (' + (l.project || '-') + ')' +
      (l.visitTime ? ' jam ' + l.visitTime : '');
  }
  const summary = visits.slice(0, 4).map(function (l) { return line(l, true); }).join('; ') +
    (visits.length > 4 ? '; dan ' + (visits.length - 4) + ' lainnya' : '') + '.';
  const adminUids = users.filter(function (u) { return u.role === 'Admin'; }).map(function (u) { return u.uid; });
  await L.sendToUids(adminUids, {
    kind: 'visit', link: link, tag: 'visit-day-' + t.dateKey, sticky: true,
    title: 'Hari ini ada ' + visits.length + ' kunjungan buyer',
    body: summary
  });

  const byMarketing = {};
  visits.forEach(function (l) { (byMarketing[l.assignedTo] = byMarketing[l.assignedTo] || []).push(l); });
  for (const name of Object.keys(byMarketing)) {
    const list = byMarketing[name];
    await L.sendToUids(L.uidsByName(users, name, 'Marketing'), {
      kind: 'visit', link: link, tag: 'visit-day-' + t.dateKey, sticky: true,
      title: 'Hari ini ada kunjungan buyer!',
      body: list.map(function (l) { return line(l, false); }).join('; ') + '. Siapkan unit & materinya ya.'
    });
  }
  out.visits = visits.length;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET belum diisi di Vercel.' });
  const key = String((req.query && req.query.key) || '') ||
    String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (key !== secret) return res.status(401).json({ error: 'Kunci salah.' });
  try { L.initAdmin(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message }); }

  const now = Date.now();
  const link = L.baseUrl(req);
  const out = { pending: 0, created: 0, warned: 0, reassigned: 0, exhausted: 0, escalated: 0, daily: 0, visits: 0, errors: [] };

  // Data akun dibaca sekali saja per panggilan, dan hanya kalau memang dibutuhkan.
  let usersPromise = null;
  function loadUsers() {
    if (!usersPromise) usersPromise = L.activeUsers();
    return usersPromise;
  }

  const pending = await L.db().collection('leads').where('pendingAccept', '==', true).get();
  out.pending = pending.size;
  if (pending.size) {
    const users = await loadUsers();
    const pool = L.rotationPool(users);
    for (const doc of pending.docs) {
      try { await reassignOrWarn(doc, pool, users, link, now, out); }
      catch (e) { out.errors.push(doc.id + ': ' + e.message); }
    }
  }

  try { await dailyReminder(loadUsers, link, now, out); }
  catch (e) { out.errors.push('daily: ' + e.message); }

  try { await visitReminder(loadUsers, link, now, out); }
  catch (e) { out.errors.push('visit: ' + e.message); }

  return res.json(out);
};

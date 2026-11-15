// ============================================================
// GET /api/cron?key=<CRON_SECRET>  — dipanggil cron-job.org SETIAP 1 MENIT.
//
// Tugas:
//  1. Lead menunggu diterima yang lewat 5 menit -> dialihkan ke marketing berikutnya
//     di rotasi + push "Lead dialihkan ke kamu". Kalau semua sudah dilewati, ditandai
//     acceptExhausted (tanpa push).
//  2. Lead yang tinggal <= 1 menit -> push "Sisa 1 menit" ke pemegangnya (sekali).
//  3. Cadangan: lead baru yang push "lead masuk"-nya belum terkirim -> dikirim.
//  4. Setiap hari jam 09:00 WIB -> push ringkasan follow-up hari ini ke tiap marketing.
//
// Environment Variable di Vercel:
//   CRON_SECRET = kata sandi bebas (acak & panjang), sama dengan ?key= di cron-job.org
//   DAILY_REMINDER_HOUR (opsional) = jam pengingat harian WIB, default 9
// ============================================================
const L = require('./_lib');

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
  if (deadline > now && deadline - now <= 60 * 1000 && (lead.pushKeys || []).indexOf(warnKey) === -1) {
    if (await L.claimPushKey(ref, warnKey)) {
      await L.sendToUids(L.uidsByName(users, lead.assignedTo, 'Marketing'), L.msgLeadWarn(lead, link));
      out.warned++;
    }
    return;
  }

  // 1. Pengalihan.
  if (lead.acceptExhausted || deadline > now) return;
  let moved = null;
  await L.db().runTransaction(async function (tx) {
    moved = null;
    const s = await tx.get(ref);
    if (!s.exists) return;
    const d = s.data();
    if (d.pendingAccept !== true || d.acceptExhausted || L.toMillis(d.acceptDeadline) > Date.now()) return;
    const next = L.nextCandidate(pool, d);
    if (next === null) return;
    if (!next) { tx.update(ref, { acceptExhausted: true }); moved = { exhausted: true }; return; }
    const newDeadline = L.Timestamp.fromMillis(Date.now() + L.ACCEPT_WINDOW_MS);
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
  }
}

// 4. Ringkasan follow-up harian (sekali sehari, dicatat di settings/pushDaily).
async function dailyReminder(users, link, now, out) {
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

  const leads = (await L.db().collection('leads').get()).docs.map(function (d) { return d.data(); });
  const todayKey = t.dateKey;
  const counts = {};
  leads.forEach(function (l) {
    if (!l.assignedTo || l.pendingAccept === true || L.CLOSED_STATUSES.indexOf(l.status) !== -1) return;
    let due = l.status === 'New' || l.status === 'Awal Chat';
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

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET belum diisi di Vercel.' });
  const key = String((req.query && req.query.key) || '') ||
    String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (key !== secret) return res.status(401).json({ error: 'Kunci salah.' });
  try { L.initAdmin(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message }); }

  const now = Date.now();
  const link = L.baseUrl(req);
  const out = { pending: 0, created: 0, warned: 0, reassigned: 0, exhausted: 0, daily: 0, errors: [] };
  const users = await L.activeUsers();
  const pool = L.rotationPool(users);

  const pending = await L.db().collection('leads').where('pendingAccept', '==', true).get();
  out.pending = pending.size;
  for (const doc of pending.docs) {
    try { await reassignOrWarn(doc, pool, users, link, now, out); }
    catch (e) { out.errors.push(doc.id + ': ' + e.message); }
  }

  try { await dailyReminder(users, link, now, out); }
  catch (e) { out.errors.push('daily: ' + e.message); }

  return res.json(out);
};

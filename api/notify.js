// ============================================================
// POST /api/notify  — dipanggil aplikasi setelah sebuah kejadian, server lalu mengirim push.
//   Header : Authorization: Bearer <Firebase ID token>
//   Body   : { event: 'lead-created' | 'lead-reassigned' | 'lead-accepted', leadId }
// Server selalu membaca ulang data lead dari Firestore (isi pesan tidak diambil dari
// pengirim) dan mencatat pushKeys di lead supaya notif yang sama tidak terkirim dua kali.
// ============================================================
const L = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });
  try { L.initAdmin(); } catch (e) { return res.status(500).json({ error: 'Server belum dikonfigurasi: ' + e.message }); }

  const caller = await L.authUser(req);
  if (!caller) return res.status(401).json({ error: 'Belum login / sesi tidak valid.' });

  const body = L.readBody(req);
  const event = String(body.event || '');
  const leadId = String(body.leadId || '');
  if (!leadId) return res.status(400).json({ error: 'leadId kosong.' });

  const ref = L.db().collection('leads').doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Lead tidak ditemukan.' });
  const lead = Object.assign({ id: leadId }, snap.data());
  const link = L.baseUrl(req);
  const users = await L.activeUsers();
  const role = caller.profile.role;

  if (event === 'lead-created' || event === 'lead-reassigned') {
    if (!L.isStaffRole(role)) return res.status(403).json({ error: 'Tidak diizinkan.' });
    if (lead.pendingAccept !== true) return res.json({ skipped: 'sudah diterima' });
    const key = event === 'lead-created' && !lead.reassignCount ? 'created' : 'assign-' + (lead.reassignCount || 0);
    if (!(await L.claimPushKey(ref, key))) return res.json({ skipped: 'sudah dikirim' });
    const msg = key === 'created' ? L.msgLeadCreated(lead, link) : L.msgLeadAssigned(lead, link);
    const r = await L.sendToUids(L.uidsByName(users, lead.assignedTo, 'Marketing'), msg);
    return res.json(r);
  }

  if (event === 'lead-accepted') {
    if (role !== 'Marketing' || lead.acceptedBy !== caller.profile.name || lead.pendingAccept === true) {
      return res.status(403).json({ error: 'Tidak diizinkan.' });
    }
    if (!(await L.claimPushKey(ref, 'accepted'))) return res.json({ skipped: 'sudah dikirim' });
    const mins = Math.max(0, Math.round((L.toMillis(lead.acceptedAt) - L.toMillis(lead.createdAt)) / 60000));
    const csUids = users.filter(function (u) { return u.role === 'CS'; }).map(function (u) { return u.uid; });
    const r = await L.sendToUids(csUids, {
      kind: 'lead-accepted', leadId: leadId, link: link, tag: 'accepted-' + leadId,
      title: 'Lead diterima ' + lead.acceptedBy,
      body: (lead.buyerName || '-') + ' (' + (lead.project || '-') + ') diterima ' + (mins < 1 ? 'kurang dari 1' : mins) + ' menit setelah masuk' +
        (lead.acceptedLate ? ' (terlambat).' : '.')
    });
    return res.json(r);
  }

  return res.status(400).json({ error: 'Event tidak dikenal.' });
};

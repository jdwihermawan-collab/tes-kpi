// ============================================================
// POST /api/notify  — dipanggil aplikasi setelah sebuah kejadian, server lalu mengirim push.
//   Header : Authorization: Bearer <Firebase ID token>
//   Body   : { event: 'lead-created' | 'lead-reassigned' | 'lead-accepted' |
//                     'visit-scheduled' | 'visit-cancelled', leadId }
//            { event: 'closing-submitted' | 'closing-verified', leadId, stage: 'itj' | 'sppr' }  (KPI)
//            { event: 'report-invalid', uid, reportId }                                     (KPI)
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
  const role0 = caller.profile.role;

  // KPI: laporan Live/Canvasing ditandai tidak valid oleh SPV/Super Admin -> beri tahu marketing-nya.
  if (event === 'report-invalid') {
    if (role0 !== 'Admin' && role0 !== 'SuperAdmin') return res.status(403).json({ error: 'Tidak diizinkan.' });
    const uid = String(body.uid || '');
    const reportId = String(body.reportId || '');
    if (!uid || !reportId) return res.status(400).json({ error: 'Data laporan kosong.' });
    const repRef = L.db().collection('kpiReports').doc(uid).collection('kpiItems').doc(reportId);
    const rs = await repRef.get();
    if (!rs.exists) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    const rep = rs.data();
    if (!rep.invalid) return res.json({ skipped: 'laporan valid' });
    const stamp = L.toMillis(rep.invalidAt);
    if (rep.invalidNotified === stamp) return res.json({ skipped: 'sudah dikirim' });
    await repRef.update({ invalidNotified: stamp });
    const d = String(rep.dateKey || '');
    const r = await L.sendToUids([uid], {
      kind: 'kpi-report-invalid', link: L.baseUrl(req), tag: 'kpi-invalid-' + reportId,
      title: 'Laporan ' + (rep.type || '') + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7) + ' tidak valid',
      body: (rep.invalidReason ? 'Alasan: ' + rep.invalidReason + '. ' : '') + 'Ditandai oleh ' + (rep.invalidBy || 'SPV') +
        '. Laporan ini tidak dihitung di KPI.'
    });
    return res.json(r);
  }

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

  // Janji kunjungan dibuat/diubah atau dibatalkan marketing -> push ke SPV/Manager (role Admin).
  if (event === 'visit-scheduled' || event === 'visit-cancelled') {
    if (role !== 'Marketing' || lead.assignedTo !== caller.profile.name) {
      return res.status(403).json({ error: 'Tidak diizinkan.' });
    }
    const scheduled = event === 'visit-scheduled';
    if (scheduled && !lead.visitDate) return res.json({ skipped: 'tidak ada janji kunjungan' });
    if (!scheduled && (lead.visitDate || !lead.visitCancelled)) return res.json({ skipped: 'tidak ada pembatalan' });
    const stamp = L.toMillis(scheduled ? lead.visitSetAt : lead.visitCancelledAt);
    if (!(await L.claimPushKey(ref, (scheduled ? 'visit-' : 'visitcancel-') + stamp))) return res.json({ skipped: 'sudah dikirim' });
    const who = caller.profile.name;
    const adminUids = users.filter(function (u) { return u.role === 'Admin'; }).map(function (u) { return u.uid; });
    const r = await L.sendToUids(adminUids, scheduled ? {
      kind: 'visit', leadId: leadId, link: link, tag: 'visit-' + leadId,
      title: 'Janji kunjungan dari ' + who,
      body: (lead.buyerName || '-') + ' (' + (lead.project || '-') + ') akan berkunjung ' +
        L.formatVisit(lead.visitDate, lead.visitTime) + '.'
    } : {
      kind: 'visit', leadId: leadId, link: link, tag: 'visit-' + leadId,
      title: 'Kunjungan dibatalkan',
      body: 'Kunjungan ' + (lead.buyerName || '-') + ' (' + (lead.project || '-') + ') ' + lead.visitCancelled +
        ' dibatalkan oleh ' + who + '.'
    });
    return res.json(r);
  }

  // KPI: marketing mengubah status ke Closing ITJ / SPPR -> SPV/Manager diminta memverifikasi.
  if (event === 'closing-submitted') {
    const stage = body.stage === 'sppr' ? 'sppr' : body.stage === 'itj' ? 'itj' : '';
    if (role !== 'Marketing' || lead.assignedTo !== caller.profile.name || !stage) return res.status(403).json({ error: 'Tidak diizinkan.' });
    const info = (lead.closingInfo || {})[stage];
    if (!info) return res.json({ skipped: 'tidak ada data closing' });
    if (!(await L.claimPushKey(ref, 'closing-' + stage + '-' + L.toMillis(info.at)))) return res.json({ skipped: 'sudah dikirim' });
    const label = stage === 'itj' ? 'Closing ITJ' : 'Closing SPPR';
    const nominal = String(info.nominal || '').replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const adminUids = users.filter(function (u) { return u.role === 'Admin'; }).map(function (u) { return u.uid; });
    const r = await L.sendToUids(adminUids, {
      kind: 'kpi-closing', leadId: leadId, link: link, tag: 'closing-' + leadId, sticky: true,
      title: label + ' dari ' + caller.profile.name + ' perlu diverifikasi',
      body: (lead.buyerName || '-') + ' \u00b7 ' + (info.project || lead.project || '-') + ' unit ' + (info.unit || '-') +
        (nominal ? ' \u00b7 Rp ' + nominal : '') + '. Buka menu KPI untuk menyetujui.'
    });
    return res.json(r);
  }

  // KPI: SPV/Super Admin menyetujui / menolak closing -> beri tahu marketing pemilik lead.
  if (event === 'closing-verified') {
    const stage = body.stage === 'sppr' ? 'sppr' : body.stage === 'itj' ? 'itj' : '';
    if ((role !== 'Admin' && role !== 'SuperAdmin') || !stage) return res.status(403).json({ error: 'Tidak diizinkan.' });
    const v = (lead.kpiVerify || {})[stage];
    if (!v || (v.status !== 'approved' && v.status !== 'rejected')) return res.json({ skipped: 'belum diputuskan' });
    if (!(await L.claimPushKey(ref, 'verify-' + stage + '-' + v.status + '-' + L.toMillis(v.at)))) return res.json({ skipped: 'sudah dikirim' });
    const label = stage === 'itj' ? 'Closing ITJ' : 'Closing SPPR';
    const ok = v.status === 'approved';
    const r = await L.sendToUids(L.uidsByName(users, lead.assignedTo, 'Marketing'), {
      kind: 'kpi-verify', leadId: leadId, link: link, tag: 'verify-' + leadId + '-' + stage,
      title: label + (ok ? ' disetujui' : ' ditolak'),
      body: (lead.buyerName || '-') + ' (' + (lead.project || '-') + ') ' + (ok
        ? 'sudah diverifikasi ' + (v.by || 'SPV') + ' dan masuk skor KPI kamu.'
        : 'ditolak oleh ' + (v.by || 'SPV') + ', jadi tidak dihitung di KPI. Hubungi SPV untuk detailnya.')
    });
    return res.json(r);
  }

  return res.status(400).json({ error: 'Event tidak dikenal.' });
};

// ============================================================
// Fungsi bersama untuk semua endpoint di folder api/.
// (File yang namanya diawali "_" tidak dijadikan endpoint oleh Vercel.)
// ============================================================
const admin = require('firebase-admin');

const ACCEPT_WINDOW_MS = 5 * 60 * 1000;
const CLOSED_STATUSES = ['Closing SPPR', 'Closed (Deal)', 'Lost (Batal)'];
const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
];

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum diisi di Vercel.');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

function db() { return admin.firestore(); }
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

function baseUrl(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '') + '/';
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return proto + '://' + req.headers.host + '/';
}

function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime() || 0;
}

// Jam:menit di zona WIB (Asia/Jakarta, UTC+7, tanpa DST).
function wibParts(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  return {
    dateKey: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    clock: String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
  };
}

// Verifikasi Firebase ID token dari header Authorization, kembalikan { uid, profile } atau null.
async function authUser(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1]); } catch (e) { return null; }
  const snap = await db().collection('users').doc(decoded.uid).get();
  if (!snap.exists) return null;
  const profile = snap.data();
  if (profile.active === false) return null;
  return { uid: decoded.uid, profile: profile };
}

function isStaffRole(role) { return role === 'CS' || role === 'Admin' || role === 'SuperAdmin'; }

async function activeUsers() {
  const snap = await db().collection('users').get();
  return snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); })
    .filter(function (u) { return u.active !== false && u.name; });
}

// Urutan rotasi sama dengan aplikasi: marketing aktif, urut rotationOrder lalu nama.
function rotationPool(users) {
  const mk = users.filter(function (u) { return u.role === 'Marketing'; }).sort(function (a, b) {
    const oa = Number.isFinite(a.rotationOrder) ? a.rotationOrder : 9999;
    const ob = Number.isFinite(b.rotationOrder) ? b.rotationOrder : 9999;
    return oa - ob || String(a.name).localeCompare(String(b.name));
  });
  const inRot = mk.filter(function (u) { return u.inRotation !== false; }).map(function (u) { return u.name; });
  return inRot.length ? inRot : mk.map(function (u) { return u.name; });
}

// (Lama) kandidat berikutnya menurut urutan rotasi tetap. Diganti antrean di bawah.
function nextCandidate(pool, lead) {
  if (!pool.length) return null;
  const tried = new Set((lead.passedFrom || []).concat([lead.assignedTo]));
  const start = pool.indexOf(lead.assignedTo);
  for (let i = 1; i <= pool.length; i++) {
    const name = pool[(start + i + pool.length) % pool.length];
    if (!tried.has(name)) return name;
  }
  return '';
}

// ---------- Antrean giliran rotasi (settings/adRotation.queue) ----------
// Aturannya sama persis dengan index.html:
//  - Lead iklan baru -> marketing terdepan, lalu ia pindah ke belakang antrean.
//  - Lead CS (Umum/Iklan) dialihkan dari X ke Y -> X ke depan (didahulukan untuk lead
//    berikutnya), Y ke belakang (gilirannya dianggap terpakai).
//  - Kandidat pengalihan = urutan antrean, melewati yang sudah pernah dilewati lead tsb.
function normalizeRotationQueue(stored, list, counter) {
  if (!list.length) return [];
  if (Array.isArray(stored) && stored.length) {
    const q = [];
    stored.forEach(function (n) { if (list.indexOf(n) !== -1 && q.indexOf(n) === -1) q.push(n); });
    list.forEach(function (n) { if (q.indexOf(n) === -1) q.push(n); });
    return q;
  }
  const start = ((Number(counter) || 0) % list.length + list.length) % list.length;
  return list.slice(start).concat(list.slice(0, start));
}

function applyReassignToQueue(queue, from, to) {
  const q = queue.filter(function (n) { return n !== from && n !== to; });
  if (queue.indexOf(from) !== -1) q.unshift(from);
  if (queue.indexOf(to) !== -1) q.push(to);
  return q;
}

// null = belum ada marketing sama sekali, '' = semua sudah dilewati.
function nextInQueue(queue, lead) {
  if (!queue || !queue.length) return null;
  const tried = new Set((lead.passedFrom || []).concat([lead.assignedTo]));
  for (let i = 0; i < queue.length; i++) {
    if (!tried.has(queue[i])) return queue[i];
  }
  return '';
}

// ---------- Janji kunjungan: visitDate 'yyyy-mm-dd' (WIB) + visitTime 'HH:MM' opsional ----------
const VISIT_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function formatVisit(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return '-';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return VISIT_DAY_NAMES[d.getUTCDay()] + ', ' + m[3] + '/' + m[2] + '/' + m[1] + (timeStr ? ' jam ' + timeStr : '');
}

function uidsByName(users, name, role) {
  return users.filter(function (u) { return u.name === name && (!role || u.role === role); }).map(function (u) { return u.uid; });
}

// Kirim push ke semua perangkat milik daftar uid. data.kind dipakai aplikasi untuk
// menghindari notif ganda saat aplikasi sedang terbuka.
async function sendToUids(uids, msg) {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (!unique.length) return { sent: 0, failed: 0, devices: 0, removed: 0 };
  const refs = unique.map(function (u) { return db().collection('pushTokens').doc(u); });
  const snaps = await db().getAll.apply(db(), refs);
  const owners = [];
  snaps.forEach(function (s) {
    if (!s.exists) return;
    (s.data().tokens || []).forEach(function (t) { if (t) owners.push({ token: t, ref: s.ref }); });
  });
  if (!owners.length) return { sent: 0, failed: 0, devices: 0, removed: 0 };

  const link = msg.link;
  const result = await admin.messaging().sendEachForMulticast({
    tokens: owners.map(function (o) { return o.token; }),
    data: { title: msg.title, body: msg.body, link: link, kind: msg.kind || 'info', leadId: msg.leadId || '' },
    webpush: {
      notification: {
        title: msg.title,
        body: msg.body,
        icon: link + 'icons/icon-192.png',
        badge: link + 'icons/icon-192.png',
        tag: msg.tag || ('crm-' + Date.now()),
        renotify: true,
        requireInteraction: !!msg.sticky
      },
      fcmOptions: { link: link }
    }
  });

  const cleanups = [];
  result.responses.forEach(function (r, i) {
    if (!r.success && r.error && INVALID_TOKEN_CODES.indexOf(r.error.code) !== -1) {
      cleanups.push(owners[i].ref.update({ tokens: FieldValue.arrayRemove(owners[i].token) }));
    }
  });
  await Promise.all(cleanups).catch(function () {});
  return { sent: result.successCount, failed: result.failureCount, devices: owners.length, removed: cleanups.length };
}

// Tandai sebuah notif sudah dikirim untuk lead ini (atomik). true = boleh kirim, false = sudah pernah.
async function claimPushKey(leadRef, key) {
  return db().runTransaction(async function (tx) {
    const snap = await tx.get(leadRef);
    if (!snap.exists) return false;
    const keys = snap.data().pushKeys || [];
    if (keys.indexOf(key) !== -1) return false;
    tx.update(leadRef, { pushKeys: FieldValue.arrayUnion(key) });
    return true;
  });
}

// ---------- Isi pesan ----------
function msgLeadCreated(lead, link) {
  return {
    kind: 'lead-pending', leadId: lead.id, link: link, sticky: true, tag: 'lead-' + lead.id,
    title: 'Lead baru masuk! Tekan Terima',
    body: (lead.project || '-') + ' • ' + (lead.adSource || '-') + '. Terima sebelum jam ' + wibParts(toMillis(lead.acceptDeadline)).clock + ' WIB.'
  };
}

function msgLeadAssigned(lead, link) {
  return {
    kind: 'lead-pending', leadId: lead.id, link: link, sticky: true, tag: 'lead-' + lead.id,
    title: 'Lead dialihkan ke kamu! Tekan Terima',
    body: (lead.project || '-') + ' • ' + (lead.adSource || '-') + '. Terima sebelum jam ' + wibParts(toMillis(lead.acceptDeadline)).clock + ' WIB.'
  };
}

function msgLeadWarn(lead, link) {
  return {
    kind: 'lead-warn', leadId: lead.id, link: link, sticky: true, tag: 'lead-' + lead.id,
    title: 'Sisa 1 menit! Segera tekan Terima',
    body: (lead.project || '-') + ': lead akan dialihkan ke marketing lain kalau belum diterima.'
  };
}

module.exports = {
  admin, initAdmin, db, FieldValue, Timestamp, readBody, baseUrl, toMillis, wibParts, authUser,
  isStaffRole, activeUsers, rotationPool, nextCandidate, uidsByName, sendToUids, claimPushKey,
  msgLeadCreated, msgLeadAssigned, msgLeadWarn, ACCEPT_WINDOW_MS, CLOSED_STATUSES,
  normalizeRotationQueue, applyReassignToQueue, nextInQueue, formatVisit
};

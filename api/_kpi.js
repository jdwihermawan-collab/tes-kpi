// ============================================================
// Perhitungan KPI di server (dipakai cron untuk pengingat KPI tanggal 20).
// Aturannya SAMA dengan perhitungan di aplikasi (index.html, bagian "KPI MARKETING"):
//  - online   : laporan Live TikTok / Canvasing yang tidak ditandai tidak valid, 1 per tanggal
//  - dbBaru   : lead Input Mandiri yang masuk bulan ini
//  - followUp : Update Status bulan ini, maks. 1 per lead per hari
//  - survey   : lead yang pertama kali mencapai Site Visit (atau tahap closing) bulan ini
//  - walkIn   : lead bersumber Walk-in yang masuk bulan ini
//  - itj/sppr : lead yang pertama kali mencapai tahap itu bulan ini DAN sudah disetujui SPV
// Skor per indikator = min(capaian / target, 1) x bobot. Semua tanggal memakai WIB.
// ============================================================
const L = require('./_lib');

const KPI_DEFAULTS = [
  { key: 'online', label: 'Online/Offline', target: 26, weight: 10 },
  { key: 'dbBaru', label: 'Database Baru', target: 78, weight: 10 },
  { key: 'followUp', label: 'Follow Up User', target: 250, weight: 10 },
  { key: 'survey', label: 'User Survey', target: 4, weight: 15 },
  { key: 'walkIn', label: 'User WI', target: 2, weight: 5 },
  { key: 'itj', label: 'Closing ITJ', target: 1, weight: 15 },
  { key: 'sppr', label: 'Closing SPPR', target: 1, weight: 35 }
];
const SURVEY_STATUSES = ['Site Visit', 'Closing ITJ', 'Closing SPPR', 'Closed (Deal)'];
const ITJ_STATUSES = ['Closing ITJ', 'Closing SPPR', 'Closed (Deal)'];
const SPPR_STATUSES = ['Closing SPPR', 'Closed (Deal)'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WIB_MS = 7 * 3600 * 1000;

function kpiItems(cfg) {
  const saved = (cfg && cfg.items) || {};
  return KPI_DEFAULTS.map(function (d) {
    const s = saved[d.key] || {};
    const t = Number(s.target);
    const w = Number(s.weight);
    return Object.assign({}, d, {
      target: Number.isFinite(t) && t > 0 ? t : d.target,
      weight: s.weight != null && s.weight !== '' && Number.isFinite(w) && w >= 0 ? w : d.weight
    });
  });
}

// ym = 'yyyy-mm' (WIB). start/end dalam milidetik UTC.
function monthRange(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1;
  return {
    start: Date.UTC(y, m, 1) - WIB_MS,
    end: Date.UTC(y, m + 1, 1) - WIB_MS,
    firstKey: ym + '-01',
    lastKey: ym + '-31',
    daysInMonth: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    label: MONTH_NAMES[m] + ' ' + y
  };
}

function verifyStatus(lead, key) {
  const v = lead && lead.kpiVerify && lead.kpiVerify[key];
  return v && v.status ? v.status : 'pending';
}

function countLeads(leads, range) {
  const c = { dbBaru: 0, followUp: 0, survey: 0, walkIn: 0, itj: 0, sppr: 0 };
  const inRange = function (ms) { return !!ms && ms >= range.start && ms < range.end; };
  leads.forEach(function (l) {
    if (l.pendingAccept === true) return;
    const created = L.toMillis(l.createdAt);
    if (inRange(created)) {
      if (l.isSelfInput === true) c.dbBaru++;
      if (/walk.?in/i.test(String(l.adSource || ''))) c.walkIn++;
    }
    let firstSurvey = 0, firstItj = 0, firstSppr = 0;
    const fuDays = new Set();
    (Array.isArray(l.notes) ? l.notes : []).forEach(function (n) {
      if (!n || !n.date) return;
      const ms = L.toMillis(n.date);
      if (!ms) return;
      if (inRange(ms)) fuDays.add(L.wibParts(ms).dateKey);
      if (SURVEY_STATUSES.indexOf(n.status) !== -1 && (!firstSurvey || ms < firstSurvey)) firstSurvey = ms;
      if (ITJ_STATUSES.indexOf(n.status) !== -1 && (!firstItj || ms < firstItj)) firstItj = ms;
      if (SPPR_STATUSES.indexOf(n.status) !== -1 && (!firstSppr || ms < firstSppr)) firstSppr = ms;
    });
    c.followUp += fuDays.size;
    if (inRange(firstSurvey)) c.survey++;
    if (inRange(firstItj) && verifyStatus(l, 'itj') === 'approved') c.itj++;
    if (inRange(firstSppr) && verifyStatus(l, 'sppr') === 'approved') c.sppr++;
  });
  return c;
}

function score(counts, items) {
  let total = 0;
  const parts = items.map(function (it) {
    const actual = Number(counts[it.key]) || 0;
    const ratio = it.target > 0 ? Math.min(actual / it.target, 1) : 0;
    const pts = ratio * it.weight;
    total += pts;
    return { item: it, actual: actual, ratio: ratio, pts: pts, missing: it.weight - pts };
  });
  return { parts: parts, total: total };
}

// KPI semua marketing untuk satu bulan. Pemakaian baca: 1 (pengaturan) + lead yang berubah
// sejak awal bulan + 1 query laporan per marketing. Dipanggil cron sekali sebulan.
async function monthKpi(ym, marketingUsers) {
  const range = monthRange(ym);
  const cfgSnap = await L.db().collection('settings').doc('kpi').get();
  const items = kpiItems(cfgSnap.exists ? cfgSnap.data() : null);
  const leads = (await L.db().collection('leads').where('lastUpdated', '>=', L.Timestamp.fromMillis(range.start)).get())
    .docs.map(function (d) { return d.data(); });
  const rows = [];
  for (const u of marketingUsers) {
    const reps = (await L.db().collection('kpiReports').doc(u.uid).collection('kpiItems')
      .where('dateKey', '>=', range.firstKey).where('dateKey', '<=', range.lastKey).get())
      .docs.map(function (d) { return d.data(); });
    const counts = countLeads(leads.filter(function (l) { return l.assignedTo === u.name; }), range);
    counts.online = new Set(reps.filter(function (r) { return !r.invalid; }).map(function (r) { return r.dateKey; })).size;
    rows.push({ user: u, counts: counts, score: score(counts, items) });
  }
  return { range: range, items: items, rows: rows };
}

function fmt1(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

module.exports = { KPI_DEFAULTS, kpiItems, monthRange, countLeads, score, monthKpi, fmt1, MONTH_NAMES };

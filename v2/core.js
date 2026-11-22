// ============================================================
// v2/core.js — DIBUAT OTOMATIS oleh scripts/build-v2-core.py dari index.html.
// JANGAN diedit manual: ubah index.html lalu jalankan ulang skripnya.
// Berisi pengaturan aplikasi + fungsi logika yang dipakai bersama tampilan lama & /v2/.
// ============================================================
  window.APP_CONFIG = {
    // ---------- IDENTITAS ----------
    companyName: 'Podorukun Group',            // dipakai di kop & footer laporan PDF
    appName: 'TES KPI - Lead Tracker', // judul aplikasi (tab browser, header, login)
    groupName: 'Podorukun Group',             // sebutan di pesan WA: "... hari ini di <groupName>"
    emailDomain: 'crm.prn',                   // akun login pakai ID: ID "angga" = angga@crm.prn (alamat buatan, bukan email asli)
    crmUrl: 'https://tes-kpi-8lbc.vercel.app',                             // link aplikasi ini (dikirim di pesan WA ke marketing); kosongkan bila belum ada

    // ---------- WARNA ----------
    // brand      : warna utama (tombol, fokus, aksen)
    // brandDark  : versi gelap (header, judul)
    // brandLight : versi terang (gradasi tombol, avatar)
    // brandSoft  : latar sangat muda (badge, baris terpilih)
    // brandOnDark: teks kecil di atas header gelap
    // ink/muted/paper/line: teks utama, teks abu-abu, latar halaman, garis
    colors: {
      // Biru dongker dari logo Podorukun Group (#2A3E94)
      brand: '#2a3e94',
      brandDark: '#1c2a66',
      brandLight: '#3a52b8',
      brandSoft: '#eaedf8',
      brandOnDark: '#c3cbec',
      ink: '#161b2e',
      muted: '#5b6275',
      paper: '#f5f6f9',
      line: '#e1e4ec'
    },

    // ---------- PROYEK ----------
    // Daftar awal saja. Setelah aplikasi dipakai, daftar proyek dikelola Super Admin
    // lewat menu "Kelola Akun & Proyek" (tersimpan di database, tidak perlu ubah file).
    defaultProjects: [
      'Atlantis Icon',
      'Atlantis Hills',
      'Permata Tunggulwulung',
      'Aya Sophia Residence',
      'Atlantis Green City'
    ],

    // ---------- FIREBASE ----------
    // Salin dari Firebase Console > Project settings > Your apps > SDK setup (Config).
    firebase: {
      // Firebase project KHUSUS TES KPI (terpisah dari crm-prn-d93a4 supaya data tidak tercampur).
      apiKey: 'AIzaSyClhownnwsQqmHxdcAtNF8Q0WmB6xYWVD8',
      authDomain: 'tes-kpi-0f618c.firebaseapp.com',
      projectId: 'tes-kpi-0f618c',
      storageBucket: 'tes-kpi-0f618c.firebasestorage.app',
      messagingSenderId: '693028465008',
      appId: '1:693028465008:web:dad132ed1016dc98bcc7b5',
      // Push notification: Firebase Console > Project settings > Cloud Messaging >
      // Web Push certificates > "Generate key pair", lalu salin "Key pair" ke sini (boleh publik).
      vapidKey: 'BPSRNVNbs53ym0cFM-IEclIg-jNiMb99UL0btcvHRn1XG81T8UfbDmJXHheWFYbGXRz9Qzv1zlbOg7TgCr2wnGA'
    }
  };
    const APP = window.APP_CONFIG;

    const PDF_BRAND_GREEN = hexToRgbArray(APP.colors.brandDark, [11, 80, 57]);        // sama dengan --brand-dark
    const PDF_BRAND_GREEN_SOFT = hexToRgbArray(APP.colors.brandSoft, [233, 245, 239]); // sama dengan --brand-soft
    const PDF_BRAND_ON_DARK = hexToRgbArray(APP.colors.brandOnDark, [210, 232, 222]); // teks kecil di pita kop
    const PDF_TEXT_DARK = [35, 48, 42];
    const PDF_TEXT_MUTED = [120, 132, 126];
    const PDF_HOT_ACCENT = [163, 53, 44]; // sama dengan --red, dipakai untuk badge Hot Prospek
    const CLOSED_STATUSES = ['Closing SPPR', 'Closed (Deal)', 'Lost (Batal)'];
    const VISIT_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const KPI_DEFAULTS = [
      { key: 'online', label: 'Online/Offline', unit: 'kali', target: 26, weight: 10, hint: 'Laporan Live TikTok (link wajib) atau Canvasing (izin & lapor grup). Maks. 1 hitungan per hari; yang ditandai tidak valid oleh SPV tidak dihitung.' },
      { key: 'dbBaru', label: 'Database Baru', unit: 'database', target: 78, weight: 10, hint: 'Lead Input Mandiri yang masuk bulan ini (3 per hari x 26 hari).' },
      { key: 'followUp', label: 'Follow Up User', unit: 'kali', target: 250, weight: 10, hint: 'Update Status lead bulan ini. Maksimal 1 hitungan per lead per hari.' },
      { key: 'survey', label: 'User Survey', unit: 'user', target: 4, weight: 15, hint: 'Lead yang pertama kali masuk status Site Visit bulan ini.' },
      { key: 'walkIn', label: 'User WI', unit: 'user', target: 2, weight: 5, hint: 'Lead dengan sumber Walk-in / Datang Langsung yang masuk bulan ini.' },
      { key: 'itj', label: 'Closing ITJ', unit: 'user', target: 1, weight: 15, hint: 'Lead yang pertama kali masuk status Closing ITJ bulan ini dan sudah disetujui SPV.' },
      { key: 'sppr', label: 'Closing SPPR', unit: 'user', target: 1, weight: 35, hint: 'Lead yang pertama kali masuk status Closing SPPR bulan ini dan sudah disetujui SPV.' }
    ];
    const KPI_SURVEY_STATUSES = ['Site Visit', 'Closing ITJ', 'Closing SPPR', 'Closed (Deal)'];
    const KPI_ITJ_STATUSES = ['Closing ITJ', 'Closing SPPR', 'Closed (Deal)'];
    const KPI_SPPR_STATUSES = ['Closing SPPR', 'Closed (Deal)'];
    const KPI_REPORT_TYPES = [
      { value: 'Live TikTok', label: 'Live TikTok (Online)' },
      { value: 'Canvasing', label: 'Canvasing (Offline)' }
    ];
    const KPI_MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const KPI_TREND_MONTHS = 6;
    const KPI_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const KPI_SNAP_KEYS = ['dbBaru', 'followUp', 'survey', 'walkIn'];
    const KPI_CACHE_MS = 10 * 60 * 1000;
    const notificationLog = []; // riwayat notifikasi in-memory (maks 20 terbaru)
    let notifIdCounter = 0;
    const notifState = {
      csAdmin: { knownIds: new Set(), knownAttentionIds: new Set(), initial: true },
      marketing: { knownIds: new Set(), knownAttentionIds: new Set(), initial: true }
    };
    const NOTIF_HISTORY_SHOW = 5;
    const NOTIF_LOCAL_KEEP = 10;
    const NOTIF_SERVER_REFRESH_MS = 15 * 60 * 1000;
    let serverNotifs = null;
    let serverNotifsAt = 0;
    let serverNotifsLoading = false;
    let renderedNotifs = [];
    const LEADS_WINDOW_DAYS = 90;
    const ACTIVE_LEAD_STATUSES = ['New', 'Awal Chat', 'Follow-Up 1', 'Follow-Up 2', 'Follow-Up 3', 'Site Visit', 'Closing ITJ', 'Lain-lain'];
    let leadsSnapshotFromCache = false;   // snapshot lead terakhir masih dari cache offline (belum dari server)
    let leadsLeanUnavailable = false;
    const PUSH_TOKEN_STORE_KEY = 'crmPushToken';
    let pushSwRegistration = null;
    let pushMessaging = null;
    let pushOnMessageBound = false;
    const ACCEPT_WINDOW_MS = 5 * 60 * 1000;
    let acceptAudioCtx = null;
    let kpiReportsCache = {};   // 'yyyy-mm|uid' -> laporan sebulan penuh (sudah dibaca di sesi ini)
    let kpiConfig = null;        // isi dokumen settings/kpi (null = pakai default)
    const WA_INDEX_RECHECK_MS = 3 * 24 * 3600 * 1000;
    let xlsxLoading = null;

    function hexToRgbArray(hex, fallback) {
      let h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      const n = parseInt(h, 16);
      return (h.length === 6 && !isNaN(n)) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : fallback;
    }

    function escapeHtml(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toJsDate(ts) {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      if (ts instanceof Date) return ts;
      return new Date(ts);
    }

    function formatDateID(date) {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return dd + '/' + mm + '/' + yyyy;
    }

    function daysDiffDateOnly(a, b) {
      const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      const dbb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.round((da - dbb) / (1000 * 60 * 60 * 24));
    }

    function defaultNextFollowUp() {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d;
    }

    function toDateInputValue(date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return yyyy + '-' + mm + '-' + dd;
    }

    function fromDateInputValue(value) {
      if (!value) return defaultNextFollowUp();
      const parts = value.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    function computeSla(lead) {
      if (CLOSED_STATUSES.indexOf(lead.status) !== -1) return 'green';
      // Lead 'New' (baru dari CS, belum pernah di-chat marketing) selalu ditandai merah
      // supaya langsung terlihat mencolok sampai marketing mengubah status ke 'Awal Chat'.
      if (lead.status === 'New') return 'red';
      const follow = toJsDate(lead.nextFollowUpDate || lead.lastUpdated || lead.createdAt);
      const diff = daysDiffDateOnly(follow, new Date());
      if (diff > 1) return 'green';   // masih > 1 hari lagi
      if (diff >= 0) return 'amber';  // jadwal hari ini atau besok
      return 'red';                   // sudah lewat jadwal follow-up
    }

    function leadDataType(lead) {
      if (lead && lead.isSelfInput === true) {
        return { key: 'sendiri', label: 'Input Manual', hint: 'Diinput manual oleh marketing lewat tombol + Lead Baru' };
      }
      if (lead && lead.isAdLead === true) {
        return { key: 'iklan', label: 'Input CS · Iklan', hint: 'Diinput CS lewat tab Input Lead Iklan (rotasi)' };
      }
      return { key: 'umum', label: 'Input CS · Umum', hint: 'Diinput CS lewat tab Input Lead Umum' };
    }

    function formatVisit(dateStr, timeStr) {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
      const d = fromDateInputValue(dateStr);
      return VISIT_DAY_NAMES[d.getDay()] + ', ' + formatDateID(d) + (timeStr ? ' · ' + timeStr : '');
    }

    function upcomingVisitLabel(lead) {
      if (!lead || !lead.visitDate || CLOSED_STATUSES.indexOf(lead.status) !== -1) return '';
      const diff = daysDiffDateOnly(fromDateInputValue(lead.visitDate), new Date());
      if (diff < 0) return '';
      const when = diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : formatVisit(lead.visitDate, '');
      return 'Kunjungan ' + when + (lead.visitTime ? ' · ' + lead.visitTime : '');
    }

    function waLink(number) {
      let digits = String(number || '').replace(/\D/g, '');
      if (digits.startsWith('0')) digits = '62' + digits.slice(1);
      else if (!digits.startsWith('62')) digits = '62' + digits;
      return 'https://wa.me/' + digits;
    }

    function toWaDigits(number) {
      let digits = String(number || '').replace(/\D/g, '');
      if (digits.startsWith('0')) digits = '62' + digits.slice(1);
      else if (!digits.startsWith('62')) digits = '62' + digits;
      return digits;
    }

    function validateWaNumber(raw) {
      const digits = toWaDigits(raw);
      if (!/^628\d{8,11}$/.test(digits)) {
        return 'Nomor WhatsApp tidak valid. Gunakan format 08xx... atau +62 8xx... (10-13 digit, tanpa huruf).';
      }
      return '';
    }

    function latestNoteDate(lead) {
      const notes = Array.isArray(lead.notes) ? lead.notes : [];
      let latest = null;
      notes.forEach(function (n) {
        if (!n || !n.date) return;
        const t = toJsDate(n.date);
        if (!latest || t > latest) latest = t;
      });
      return latest;
    }

    function waIndexEntry(lead) {
      const last = latestNoteDate(lead);
      return {
        assignedTo: lead.assignedTo || '',
        status: lead.status || '',
        project: lead.project || '',
        lastFollowUpMs: last ? last.getTime() : null,
        createdAtMs: lead.createdAt ? toJsDate(lead.createdAt).getTime() : null
      };
    }

    function waIndexPut(leadId, lead) {
      const d = toWaDigits(lead.waNumber);
      if (!lead.waNumber || !d) return;
      const leads = {};
      leads[leadId] = waIndexEntry(lead);
      db.collection('waIndex').doc(d).set({ leads: leads }, { merge: true })
        .catch(function (err) { console.error('Gagal memperbarui waIndex:', err); });
    }

    function waIndexRemove(leadId, waNumber) {
      const d = toWaDigits(waNumber);
      if (!waNumber || !d) return;
      const leads = {};
      leads[leadId] = FieldValue.delete();
      db.collection('waIndex').doc(d).set({ leads: leads }, { merge: true })
        .catch(function (err) { console.error('Gagal menghapus entri waIndex:', err); });
    }

    function checkDuplicateAcrossTeam(raw) {
      const d = toWaDigits(raw);
      const local = (marketingLeadsData || []).concat(marketingPendingLeads || []).filter(function (l) { return toWaDigits(l.waNumber) === d; });
      return db.collection('waIndex').doc(d).get().then(function (snap) {
        const map = {};
        const indexed = (snap.exists && snap.data().leads) || {};
        Object.keys(indexed).forEach(function (id) {
          map[id] = Object.assign({ id: id, fromIndex: true }, indexed[id]);
        });
        local.forEach(function (l) { map[l.id] = l; });
        return Object.keys(map).map(function (k) { return map[k]; });
      }).catch(function (err) {
        console.error('Gagal mengecek nomor ke seluruh tim:', err);
        return local;
      });
    }

    function lastFollowUpText(lead) {
      const latest = lead.fromIndex
        ? (lead.lastFollowUpMs ? new Date(lead.lastFollowUpMs) : null)
        : latestNoteDate(lead);
      if (!latest) {
        const created = lead.fromIndex ? (lead.createdAtMs ? new Date(lead.createdAtMs) : null) : toJsDate(lead.createdAt);
        return 'belum pernah di-follow up' + (created ? ' (masuk ' + formatDateID(created) + ')' : '');
      }
      return formatDateID(latest) + ' (' + timeAgoID(latest) + ')';
    }

    function buildDuplicateWarning(matches) {
      const shown = matches.slice(0, 3);
      const lines = shown.map(function (l) {
        const owner = (currentUser && l.assignedTo === currentUser.name) ? 'kamu sendiri' : 'marketing ' + (l.assignedTo || '-');
        const head = l.buyerName ? 'Atas nama "' + l.buyerName + '" – dipegang ' : 'Dipegang ';
        return '• ' + head + owner +
          '\n   Status: ' + (l.status || '-') + ' · Proyek: ' + (l.project || '-') +
          '\n   Terakhir di-follow up: ' + lastFollowUpText(l);
      });
      return 'Nomor ini sudah terdaftar:\n\n' + lines.join('\n\n') +
        (matches.length > shown.length ? '\n\n(+' + (matches.length - shown.length) + ' lead lain)' : '') +
        '\n\nYakin ingin menyimpan sebagai lead baru?';
    }

    function timeAgoID(date) {
      const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMin < 1) return 'baru saja';
      if (diffMin < 60) return diffMin + ' menit lalu';
      const dayDiff = daysDiffDateOnly(new Date(), date);
      if (dayDiff <= 0) return Math.floor(diffMin / 60) + ' jam lalu';
      if (dayDiff === 1) return 'kemarin ' + formatTimeID(date);
      return dayDiff + ' hari lalu';
    }

    function formatTimeID(date) {
      return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }

    function isCsAdminRole(role) {
      return role === 'CS' || role === 'Admin' || role === 'SuperAdmin';
    }

    function isActiveUser(u) { return u && u.active !== false; }

    function activeMarketingUsers() {
      return usersData
        .filter(function (u) { return u.role === 'Marketing' && isActiveUser(u) && u.name; })
        .sort(function (a, b) {
          const oa = Number.isFinite(a.rotationOrder) ? a.rotationOrder : 9999;
          const ob = Number.isFinite(b.rotationOrder) ? b.rotationOrder : 9999;
          return oa - ob || a.name.localeCompare(b.name);
        });
    }

    function activeMarketingUsers() {
      return usersData
        .filter(function (u) { return u.role === 'Marketing' && isActiveUser(u) && u.name; })
        .sort(function (a, b) {
          const oa = Number.isFinite(a.rotationOrder) ? a.rotationOrder : 9999;
          const ob = Number.isFinite(b.rotationOrder) ? b.rotationOrder : 9999;
          return oa - ob || a.name.localeCompare(b.name);
        });
    }

    function idToEmail(id) {
      const v = String(id || '').trim().toLowerCase();
      if (!v) return '';
      return v.indexOf('@') !== -1 ? v : v + '@' + APP.emailDomain;
    }

    function isValidLoginId(id) {
      const v = String(id || '');
      return v.indexOf('@') !== -1 ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : /^[a-z0-9._-]{3,30}$/.test(v);
    }

    function isPendingAccept(l) { return !!l && l.pendingAccept === true; }

    function acceptDeadlineMs(l) {
      return l && l.acceptDeadline ? toJsDate(l.acceptDeadline).getTime() : 0;
    }

    function acceptDeadlineMs(l) {
      return l && l.acceptDeadline ? toJsDate(l.acceptDeadline).getTime() : 0;
    }

    function formatCountdown(ms) {
      const t = Math.max(0, Math.ceil(ms / 1000));
      return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    }

    function formatClock(ms) {
      const d = new Date(ms);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

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

    function nextAcceptCandidate(d, queue) {
      if (!queue || !queue.length) return null;
      const tried = new Set((d.passedFrom || []).concat([d.assignedTo]));
      for (let i = 0; i < queue.length; i++) {
        if (!tried.has(queue[i])) return queue[i];
      }
      return '';
    }

    function playAcceptAlert() {
      try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = acceptAudioCtx || (acceptAudioCtx = new Ctx());
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
        [0, 0.3].forEach(function (t) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.2, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(ctx.currentTime + t);
          o.stop(ctx.currentTime + t + 0.25);
        });
      } catch (e) {}
    }

    function leadsWindowStart() {
      return firebase.firestore.Timestamp.fromMillis(Date.now() - LEADS_WINDOW_DAYS * 24 * 3600 * 1000);
    }

    function hematLeadQueries(base, activeQuery) {
      const recent = leadsLeanUnavailable
        ? base.where('createdAt', '>=', leadsWindowStart())
        : base.where('status', 'in', CLOSED_STATUSES).where('createdAt', '>=', leadsWindowStart());
      return { aktif: activeQuery(base), baru: recent };
    }

    function leadCreatedMs(l) {
      return l && l.createdAt ? toJsDate(l.createdAt).getTime() : Date.now();
    }

    function listenLeadQueries(queries, onData, onError) {
      const keys = Object.keys(queries);
      const latest = new Map();       // id -> data lead terbaru
      const members = {};             // nama query -> Set id yang cocok dengan query itu
      const ready = {};
      let initialSent = false;
      let changedSince = new Set();
      let stopped = false;
      const fromCache = {};            // nama query -> snapshot terakhir masih dari cache offline?
      const unsubs = keys.map(function (key) {
        members[key] = new Set();
        return queries[key].onSnapshot({ includeMetadataChanges: true }, function (snapshot) {
          if (stopped) return;
          fromCache[key] = !!(snapshot.metadata && snapshot.metadata.fromCache);
          snapshot.docChanges().forEach(function (ch) {
            const id = ch.doc.id;
            if (ch.type === 'removed') {
              members[key].delete(id);
              if (!keys.some(function (k) { return members[k].has(id); })) latest.delete(id);
            } else {
              members[key].add(id);
              latest.set(id, Object.assign({ id: id }, ch.doc.data()));
            }
            changedSince.add(id);
          });
          ready[key] = true;
          if (!keys.every(function (k) { return ready[k]; })) return;
          const isInitial = !initialSent;
          initialSent = true;
          const changed = isInitial ? [] : Array.from(changedSince);
          changedSince = new Set();
          leadsSnapshotFromCache = keys.some(function (k) { return fromCache[k]; });
          onData(Array.from(latest.values()), changed, isInitial);
        }, function (err) {
          if (stopped) return;
          stopped = true;
          unsubs.forEach(function (u) { try { u(); } catch (e) {} });
          if (onError) onError(err);
        });
      });
      return function stop() {
        stopped = true;
        unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      };
    }

    function needsAttentionNow(lead) {
      if (CLOSED_STATUSES.indexOf(lead.status) !== -1) return false;
      // Lead berstatus 'New' (baru masuk dari CS, belum pernah di-chat marketing)
      // selalu dianggap butuh perhatian, sampai statusnya diubah ke 'Awal Chat' atau tahap berikutnya.
      // 'Awal Chat' sudah di-update marketing, jadi mengikuti jadwal follow-up seperti status lain.
      if (lead.status === 'New') return true;
      const follow = toJsDate(lead.nextFollowUpDate || lead.lastUpdated || lead.createdAt);
      return daysDiffDateOnly(follow, new Date()) <= 0;
    }

    function resetNotifState(scope) {
      notifState[scope] = { knownIds: new Set(), knownAttentionIds: new Set(), initial: true };
    }

    function processRealtimeNotifications(scope, leads) {
      const state = notifState[scope];
      const currentIds = new Set(leads.map(function (l) { return l.id; }));
      const currentAttention = new Set(leads.filter(needsAttentionNow).map(function (l) { return l.id; }));

      // Data pertama (termasuk data dari cache offline) hanya dijadikan patokan; notifikasi baru
      // dihitung setelah data dari server masuk, supaya lead yang masuk selama aplikasi tertutup
      // tidak memunculkan banjir pop-up saat aplikasi dibuka.
      if (state.initial || leadsSnapshotFromCache) {
        state.knownIds = currentIds;
        state.knownAttentionIds = currentAttention;
        state.initial = leadsSnapshotFromCache;
        return;
      }

      const justNotifiedIds = [];

      leads.forEach(function (lead) {
        // Lead yang masuk ke daftar karena baru saja ditekan "Terima" sudah diberi tahu lewat kartu hitung mundur.
        if (!state.knownIds.has(lead.id) && scope === 'marketing' && lead.acceptedBy) {
          justNotifiedIds.push(lead.id);
          return;
        }
        if (!state.knownIds.has(lead.id)) {
          const title = scope === 'marketing' ? 'Lead baru untuk kamu' : 'Lead baru masuk';
          const msg = lead.buyerName + ' \u2013 ' + lead.project;
          addNotification(scope, 'new', title, msg, lead.id);
          justNotifiedIds.push(lead.id);
        }
      });

      const newDue = leads.filter(function (lead) {
        return currentAttention.has(lead.id) && !state.knownAttentionIds.has(lead.id) && justNotifiedIds.indexOf(lead.id) === -1;
      });

      if (newDue.length === 1) {
        addNotification(scope, 'followup', 'Jadwal follow-up jatuh tempo', newDue[0].buyerName + ' \u2013 ' + newDue[0].project, newDue[0].id);
      } else if (newDue.length > 1) {
        addNotification(scope, 'followup', 'Follow-up jatuh tempo', newDue.length + ' lead perlu ditindaklanjuti hari ini', null);
      }

      state.knownIds = currentIds;
      state.knownAttentionIds = currentAttention;
    }

    function logMarketingActivity(action, leadName, leadId, detail) {
      if (!currentUser || currentUser.role !== 'Marketing') return;   // aksi CS/Admin tidak dicatat
      const ref = db.collection('marketingActivity').doc(currentUser.uid);
      const batch = db.batch();
      batch.set(ref, {
        name: currentUser.name,
        lastUpdateAt: FieldValue.serverTimestamp(),
        lastAction: action,
        lastLeadName: leadName || ''
      }, { merge: true });
      batch.set(ref.collection('logs').doc(), {
        action: action,
        leadName: leadName || '',
        leadId: leadId || '',
        detail: detail || '',
        createdAt: FieldValue.serverTimestamp()
      });
      batch.commit().catch(function (err) {
        console.error('Gagal mencatat aktivitas marketing:', err);
      });
    }

    function logMarketingLogin() {
      if (!currentUser || currentUser.role !== 'Marketing') return;
      db.collection('marketingActivity').doc(currentUser.uid).set({
        name: currentUser.name,
        lastLoginAt: FieldValue.serverTimestamp()
      }, { merge: true }).catch(function (err) {
        console.error('Gagal mencatat login marketing:', err);
      });
    }

    function callNotify(event, leadId, extra) {
      if (!auth.currentUser || (!leadId && !extra)) return;
      auth.currentUser.getIdToken().then(function (idToken) {
        return fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
          body: JSON.stringify(Object.assign({ event: event, leadId: leadId || '' }, extra || {}))
        });
      }).then(function (r) {
        if (!r.ok) console.warn('Push ' + event + ' gagal: HTTP ' + r.status);
      }).catch(function (err) { console.warn('Push ' + event + ' gagal:', err); });
    }

    function closingKeyForStatus(status) {
      return status === 'Closing ITJ' ? 'itj' : status === 'Closing SPPR' ? 'sppr' : '';
    }

    function formatRupiahDigits(value) {
      const digits = String(value == null ? '' : value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
    }

    function formatRupiahText(value) {
      const f = formatRupiahDigits(value);
      return f ? 'Rp ' + f : '';
    }

    function notifStoreKey() { return currentUser ? 'crmNotifLog:' + currentUser.uid : ''; }

    function saveLocalNotifs() {
      const key = notifStoreKey();
      if (!key) return;
      try {
        localStorage.setItem(key, JSON.stringify(notificationLog.slice(0, NOTIF_LOCAL_KEEP).map(function (n) {
          return { id: n.id, type: n.type, title: n.title, message: n.message, leadId: n.leadId || '', time: n.time.getTime() };
        })));
      } catch (e) { /* penyimpanan browser penuh / diblokir: riwayat hanya di memori */ }
    }

    function saveLocalNotifs() {
      const key = notifStoreKey();
      if (!key) return;
      try {
        localStorage.setItem(key, JSON.stringify(notificationLog.slice(0, NOTIF_LOCAL_KEEP).map(function (n) {
          return { id: n.id, type: n.type, title: n.title, message: n.message, leadId: n.leadId || '', time: n.time.getTime() };
        })));
      } catch (e) { /* penyimpanan browser penuh / diblokir: riwayat hanya di memori */ }
    }

    function loadLocalNotifs() {
      notificationLog.length = 0;
      serverNotifs = null;
      serverNotifsAt = 0;
      const key = notifStoreKey();
      if (key) {
        try {
          JSON.parse(localStorage.getItem(key) || '[]').forEach(function (n) {
            notificationLog.push({ id: 'l' + n.id + '_' + n.time, type: n.type, title: n.title, message: n.message, leadId: n.leadId || null, time: new Date(n.time) });
          });
        } catch (e) {}
      }
      renderNotifDropdown('cs');
      renderNotifDropdown('marketing');
    }

    function clearNotifHistoryState() {
      notificationLog.length = 0;
      serverNotifs = null;
      serverNotifsAt = 0;
      renderNotifDropdown('cs');
      renderNotifDropdown('marketing');
    }

    function recordNotif(type, title, message, leadId) {
      notifIdCounter += 1;
      notificationLog.unshift({ id: notifIdCounter, type: type, title: title, message: message, leadId: leadId, time: new Date() });
      if (notificationLog.length > 20) notificationLog.length = 20;
      saveLocalNotifs();
      renderNotifDropdown('cs');
      renderNotifDropdown('marketing');
    }

    function refreshServerNotifs(force) {
      if (!currentUser || serverNotifsLoading) return;
      if (!force && serverNotifs && Date.now() - serverNotifsAt < NOTIF_SERVER_REFRESH_MS) return;
      serverNotifsLoading = true;
      renderNotifDropdown('cs');
      renderNotifDropdown('marketing');
      db.collection('notifLogs').doc(currentUser.uid).get().then(function (snap) {
        const items = snap.exists && Array.isArray(snap.data().items) ? snap.data().items : [];
        serverNotifs = items.map(function (it) {
          const kind = String(it.kind || '');
          return {
            id: 's' + it.t, title: it.title || 'Notifikasi', message: it.body || '', leadId: it.leadId || null, time: new Date(Number(it.t) || 0),
            type: (kind.indexOf('lead') === 0 || kind === 'broadcast') ? 'new' : 'followup'
          };
        });
        serverNotifsAt = Date.now();
      }).catch(function (err) {
        console.error('Gagal memuat riwayat notifikasi:', err);
      }).finally(function () {
        serverNotifsLoading = false;
        renderNotifDropdown('cs');
        renderNotifDropdown('marketing');
      });
    }

    function mergedNotifHistory() {
      const local = notificationLog.slice();
      const fromServer = (serverNotifs || []).filter(function (s) {
        return !local.some(function (l) {
          const near = Math.abs(l.time - s.time) < 10 * 60 * 1000;
          return near && ((s.leadId && l.leadId === s.leadId) || (l.title === s.title && l.message === s.message));
        });
      });
      return local.concat(fromServer).sort(function (a, b) { return b.time - a.time; }).slice(0, NOTIF_HISTORY_SHOW);
    }

    function formatNotifTime(d) {
      const jam = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      const dd = daysDiffDateOnly(new Date(), d);
      return dd <= 0 ? jam : dd === 1 ? 'Kemarin ' + jam : formatDateID(d) + ' ' + jam;
    }

    function isIosDevice() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandaloneApp() {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    }

    function pushBrowserSupported() {
      return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window &&
        !!(window.firebase && firebase.messaging);
    }

    function pushUnsupportedReason() {
      if (isIosDevice() && !isStandaloneApp()) {
        return 'Di iPhone/iPad, buka CRM lewat Safari, tekan tombol Share lalu "Add to Home Screen" (Tambah ke Layar Utama), lalu buka CRM dari ikon itu.';
      }
      if (!pushBrowserSupported()) return 'Browser ini belum mendukung push notification. Gunakan Chrome terbaru.';
      if (!APP.firebase || !APP.firebase.vapidKey) return 'Push belum dikonfigurasi (vapidKey di APP_CONFIG masih kosong).';
      return '';
    }

    function getPushSwRegistration() {
      if (pushSwRegistration) return Promise.resolve(pushSwRegistration);
      return navigator.serviceWorker.register('/firebase-messaging-sw.js').then(function (reg) {
        pushSwRegistration = reg;
        return reg;
      });
    }

    function unregisterPushTokenForLogout() {
      let token = null;
      try { token = localStorage.getItem(PUSH_TOKEN_STORE_KEY); localStorage.removeItem(PUSH_TOKEN_STORE_KEY); } catch (e) {}
      if (!token || !currentUser) return Promise.resolve();
      const p = db.collection('pushTokens').doc(currentUser.uid)
        .update({ tokens: FieldValue.arrayRemove(token) }).catch(function () {});
      // Jangan sampai logout tertahan lama kalau jaringan lambat.
      return Promise.race([p, new Promise(function (r) { setTimeout(r, 2500); })]);
    }

    function kpiIsMarketing() { return !!currentUser && currentUser.role === 'Marketing'; }
    function kpiCanView() { return !!currentUser && (currentUser.role === 'Marketing' || currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin'); }

    function kpiItems() {
      const saved = (kpiConfig && kpiConfig.items) || {};
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

    function kpiCanView() { return !!currentUser && (currentUser.role === 'Marketing' || currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin'); }

    function kpiItems() {
      const saved = (kpiConfig && kpiConfig.items) || {};
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

    function kpiItems() {
      const saved = (kpiConfig && kpiConfig.items) || {};
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

    function kpiDateKey(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function kpiCurrentMonth() { return kpiDateKey(new Date()).slice(0, 7); }
    function kpiMonthLabel(ym) {
      const p = String(ym).split('-');
      return (KPI_MONTH_NAMES[Number(p[1]) - 1] || '') + ' ' + p[0];
    }

    function kpiMonthLabel(ym) {
      const p = String(ym).split('-');
      return (KPI_MONTH_NAMES[Number(p[1]) - 1] || '') + ' ' + p[0];
    }

    function kpiMonthRange(ym) {
      const p = String(ym).split('-');
      const y = Number(p[0]);
      const m = Number(p[1]) - 1;
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), firstKey: ym + '-01', lastKey: ym + '-31' };
    }

    function kpiMonthOptions() {
      const out = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        out.push(kpiDateKey(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));
      }
      return out;
    }

    function kpiFmt(n) {
      const r = Math.round(n * 10) / 10;
      return String(r).replace('.', ',');
    }

    function kpiVerifyStatus(lead, key) {
      const v = lead && lead.kpiVerify && lead.kpiVerify[key];
      return v && v.status ? v.status : 'pending';
    }

    function kpiCountLeads(leads, range, closings) {
      const c = { dbBaru: 0, followUp: 0, survey: 0, walkIn: 0, itj: 0, sppr: 0, itjPending: 0, spprPending: 0 };
      const inRange = function (d) { return !!d && d >= range.start && d < range.end; };
      leads.forEach(function (l) {
        if (l.pendingAccept === true) return;   // belum diterima marketing: belum dihitung
        const created = l.createdAt ? toJsDate(l.createdAt) : null;
        if (inRange(created)) {
          if (l.isSelfInput === true) c.dbBaru++;
          if (/walk.?in/i.test(String(l.adSource || ''))) c.walkIn++;
        }
        let firstSurvey = null, firstItj = null, firstSppr = null;
        const fuDays = new Set();   // follow up: maksimal 1 hitungan per lead per hari
        (Array.isArray(l.notes) ? l.notes : []).forEach(function (n) {
          if (!n || !n.date) return;
          const d = toJsDate(n.date);
          if (isNaN(d.getTime())) return;
          if (inRange(d)) fuDays.add(kpiDateKey(d));
          if (KPI_SURVEY_STATUSES.indexOf(n.status) !== -1 && (!firstSurvey || d < firstSurvey)) firstSurvey = d;
          if (KPI_ITJ_STATUSES.indexOf(n.status) !== -1 && (!firstItj || d < firstItj)) firstItj = d;
          if (KPI_SPPR_STATUSES.indexOf(n.status) !== -1 && (!firstSppr || d < firstSppr)) firstSppr = d;
        });
        c.followUp += fuDays.size;
        if (inRange(firstSurvey)) c.survey++;
        // Closing ITJ & SPPR baru dihitung setelah disetujui SPV/Manager atau Super Admin.
        [['itj', firstItj], ['sppr', firstSppr]].forEach(function (x) {
          if (!inRange(x[1])) return;
          const st = kpiVerifyStatus(l, x[0]);
          if (st === 'approved') c[x[0]]++;
          else if (st === 'pending') c[x[0] + 'Pending']++;
          if (closings) closings.push({ lead: l, key: x[0], date: x[1], status: st });
        });
      });
      return c;
    }

    function kpiOnlineCount(reports) {
      return new Set((reports || []).filter(function (r) { return !r.invalid; }).map(function (r) { return r.dateKey; })).size;
    }

    function kpiCanVerify() { return !!currentUser && (currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin'); }

    // Data unit/nominal closing; lead yang langsung lompat ke SPPR memakai data SPPR untuk ITJ-nya.
    function kpiClosingInfo(lead, key) {
      const ci = (lead && lead.closingInfo) || {};
      return ci[key] || ci[key === 'itj' ? 'sppr' : 'itj'] || {};
    }

    function kpiClosingInfo(lead, key) {
      const ci = (lead && lead.closingInfo) || {};
      return ci[key] || ci[key === 'itj' ? 'sppr' : 'itj'] || {};
    }

    function kpiStageLabel(key) { return key === 'itj' ? 'Closing ITJ' : 'Closing SPPR'; }

    function kpiVerifyBadge(status) {
      if (status === 'approved') return '<span class="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5" style="background:#d6efe3;color:#1f6b48;">Disetujui</span>';
      if (status === 'rejected') return '<span class="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5" style="background:#f6dcd9;color:#a3352c;">Ditolak</span>';
      return '<span class="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5" style="background:#f8e6cf;color:#8a5212;">Menunggu verifikasi</span>';
    }

    function kpiScore(counts, items) {
      let total = 0;
      const parts = items.map(function (it) {
        const actual = Number(counts[it.key]) || 0;
        const ratio = it.target > 0 ? Math.min(actual / it.target, 1) : 0;
        const pts = ratio * it.weight;
        total += pts;
        return { item: it, actual: actual, ratio: ratio, pts: pts };
      });
      return { parts: parts, total: total };
    }

    function kpiReportsRef(uid) {
      return db.collection('kpiReports').doc(uid).collection('kpiItems');
    }

    function kpiOwnLeadsSince(since) {
      const base = db.collection('leads').where('assignedTo', '==', currentUser.name);
      return base.where('lastUpdated', '>=', since).get().catch(function (err) {
        console.warn('Index KPI (assignedTo + lastUpdated) belum tersedia, memakai query lengkap:', err && err.message);
        return base.get();
      });
    }

    function kpiHistoryRef(uid) { return db.collection('kpiHistory').doc(uid); }

    function kpiTrendMonthList() {
      const now = new Date();
      const out = [];
      for (let i = KPI_TREND_MONTHS - 1; i >= 0; i--) out.push(kpiDateKey(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));
      return out;
    }

    function kpiTrendMonthList() {
      const now = new Date();
      const out = [];
      for (let i = KPI_TREND_MONTHS - 1; i >= 0; i--) out.push(kpiDateKey(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7));
      return out;
    }

    function kpiMonthShort(ym) { return KPI_MONTH_SHORT[Number(ym.slice(5, 7)) - 1] || ym; }

    function ensureKpiTrend(uid) {
      if (!uid) return;
      const c = kpiTrendCache[uid];
      if (c && (c.loading || Date.now() - c.at < KPI_CACHE_MS)) { renderKpiTrend(uid); return; }
      kpiTrendCache[uid] = { loading: true, months: {}, at: 0 };
      renderKpiTrend(uid);
      kpiHistoryRef(uid).get().then(function (s) {
        kpiTrendCache[uid] = { months: s.exists ? (s.data().months || {}) : {}, at: Date.now() };
      }).catch(function (err) {
        console.error('Gagal memuat tren KPI:', err);
        kpiTrendCache[uid] = { months: {}, at: Date.now(), error: err.message || String(err) };
      }).finally(function () { renderKpiTrend(uid); });
    }

    function loadXlsxLib() {
      if (window.XLSX) return Promise.resolve(window.XLSX);
      if (xlsxLoading) return xlsxLoading;
      xlsxLoading = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = function () { resolve(window.XLSX); };
        s.onerror = function () { xlsxLoading = null; reject(new Error('Gagal memuat pustaka Excel. Cek koneksi internet.')); };
        document.head.appendChild(s);
      });
      return xlsxLoading;
    }

    function kpiSnapDocId(ym, uid) { return ym + '_' + uid; }
    function kpiDayAfter(dateKey) {
      const p = String(dateKey).split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + 1);
    }

    function kpiDayAfter(dateKey) {
      const p = String(dateKey).split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + 1);
    }

    function kpiSnapTargetAsOf(ym) {
      const cur = kpiCurrentMonth();
      if (ym > cur) return null;
      if (ym < cur) return kpiDateKey(new Date(kpiMonthRange(ym).end.getTime() - 86400000));
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const k = kpiDateKey(y);
      return k.slice(0, 7) === ym ? k : null;
    }

    function kpiSortReports(list) {
      return list.slice().sort(function (a, b) {
        return a.dateKey === b.dateKey ? toJsDate(b.createdAt) - toJsDate(a.createdAt) : (a.dateKey < b.dateKey ? 1 : -1);
      });
    }

    function kpiBuildRow(person, snap, leads, reports, reportsFull, range) {
      const byId = {};
      leads.forEach(function (l) { byId[l.id] = l; });
      let counts, closings = [];
      if (snap) {
        const deltaStart = kpiDayAfter(snap.asOf);
        const deltaClosings = [];
        counts = deltaStart < range.end
          ? kpiCountLeads(leads, { start: deltaStart, end: range.end }, deltaClosings)
          : { dbBaru: 0, followUp: 0, survey: 0, walkIn: 0 };
        KPI_SNAP_KEYS.forEach(function (k) { counts[k] = (counts[k] || 0) + (Number((snap.counts || {})[k]) || 0); });
        (snap.closings || []).forEach(function (c) {
          const l = byId[c.leadId];
          if (l) closings.push({ lead: l, key: c.stage, date: new Date(Number(c.date)), status: kpiVerifyStatus(l, c.stage) });
        });
        closings = closings.concat(deltaClosings);
        ['itj', 'sppr'].forEach(function (k) {
          counts[k] = closings.filter(function (c) { return c.key === k && c.status === 'approved'; }).length;
          counts[k + 'Pending'] = closings.filter(function (c) { return c.key === k && c.status === 'pending'; }).length;
        });
        counts.online = reportsFull ? kpiOnlineCount(reports)
          : new Set((snap.onlineDays || []).concat((reports || []).filter(function (r) { return !r.invalid && r.dateKey > snap.asOf; })
              .map(function (r) { return r.dateKey; }))).size;
      } else {
        counts = kpiCountLeads(leads, range, closings);
        counts.online = kpiOnlineCount(reports || []);
      }
      closings.sort(function (a, b) { return b.date - a.date; });
      return { uid: person.uid, name: person.name, counts: counts, reports: reportsFull ? kpiSortReports(reports || []) : null, closings: closings };
    }

    function kpiMakeSnap(person, leads, reports, ym, asOf) {
      const closings = [];
      const c = kpiCountLeads(leads, { start: kpiMonthRange(ym).start, end: kpiDayAfter(asOf) }, closings);
      const counts = {};
      KPI_SNAP_KEYS.forEach(function (k) { counts[k] = c[k] || 0; });
      return {
        uid: person.uid, ym: ym, name: person.name, asOf: asOf, counts: counts,
        onlineDays: Array.from(new Set((reports || []).filter(function (r) { return !r.invalid && r.dateKey <= asOf; }).map(function (r) { return r.dateKey; }))),
        closings: closings.map(function (x) { return { leadId: x.lead.id, stage: x.key, date: x.date.getTime() }; })
      };
    }

    function kpiSaveSnaps(ym, snaps) {
      if (!kpiCanVerify() || !snaps.length) return;
      const batch = db.batch();
      snaps.forEach(function (s) {
        batch.set(db.collection('kpiDaily').doc(kpiSnapDocId(ym, s.uid)),
          Object.assign({}, s, { computedAt: FieldValue.serverTimestamp(), computedBy: currentUser.name || '' }));
      });
      batch.commit().catch(function (err) { console.warn('Gagal menyimpan rekap KPI harian:', err); });
    }

    function kpiQueryReports(uid, fromKeyExclusive, range) {
      let q = kpiReportsRef(uid).where('dateKey', '<=', range.lastKey);
      q = fromKeyExclusive ? q.where('dateKey', '>', fromKeyExclusive) : q.where('dateKey', '>=', range.firstKey);
      return q.get()
        .then(function (snap) { return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })); }); })
        .catch(function (err) { console.error('Gagal memuat laporan KPI:', err); return []; });
    }

    function kpiFetchLeadsByIds(ids) {
      return Promise.all(ids.map(function (id) {
        return db.collection('leads').doc(id).get().then(function (d) { return d.exists ? Object.assign({ id: d.id }, d.data()) : null; })
          .catch(function () { return null; });
      })).then(function (list) { return list.filter(Boolean); });
    }

    function kpiLoadFull(month, range, people, isMk) {
      const leadsP = isMk ? kpiOwnLeadsSince(range.start) : db.collection('leads').where('lastUpdated', '>=', range.start).get();
      const reportsP = Promise.all(people.map(function (p) { return kpiQueryReports(p.uid, null, range); }));
      return Promise.all([leadsP, reportsP]).then(function (res) {
        const leads = res[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        const leadsById = {};
        leads.forEach(function (l) { leadsById[l.id] = l; });
        const asOf = kpiSnapTargetAsOf(month);
        const snaps = [];
        const rows = people.map(function (p, i) {
          const mine = leads.filter(function (l) { return l.assignedTo === p.name; });
          kpiReportsCache[month + '|' + p.uid] = res[1][i];
          if (asOf) snaps.push(kpiMakeSnap(p, mine, res[1][i], month, asOf));
          return kpiBuildRow(p, null, mine, res[1][i], true, range);
        });
        if (asOf && !isMk) kpiSaveSnaps(month, snaps);
        return { month: month, rows: rows, leadsById: leadsById, loadedAt: Date.now(), mode: 'lengkap' };
      });
    }

    function kpiLoadFromSnaps(month, range, people, snaps, isMk) {
      const asOf = snaps[people[0].uid].asOf;
      const deltaStart = kpiDayAfter(asOf);
      const hasDelta = deltaStart < range.end;
      const leadsP = !hasDelta ? Promise.resolve({ docs: [] })
        : (isMk ? kpiOwnLeadsSince(deltaStart) : db.collection('leads').where('lastUpdated', '>=', deltaStart).get());
      const reportsP = Promise.all(people.map(function (p) {
        const full = kpiReportsCache[month + '|' + p.uid];
        if (full) return Promise.resolve({ full: true, list: full });
        return hasDelta ? kpiQueryReports(p.uid, asOf, range).then(function (l) { return { full: false, list: l }; })
          : Promise.resolve({ full: false, list: [] });
      }));
      return Promise.all([leadsP, reportsP]).then(function (res) {
        const delta = res[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        const leadsById = {};
        delta.forEach(function (l) { leadsById[l.id] = l; });
        const need = [];
        people.forEach(function (p) {
          (snaps[p.uid].closings || []).forEach(function (c) { if (!leadsById[c.leadId] && need.indexOf(c.leadId) === -1) need.push(c.leadId); });
        });
        return kpiFetchLeadsByIds(need).then(function (closingLeads) {
          closingLeads.forEach(function (l) { leadsById[l.id] = l; });
          const rows = people.map(function (p, i) {
            const snap = snaps[p.uid];
            const ids = (snap.closings || []).map(function (c) { return c.leadId; });
            const mine = delta.filter(function (l) { return l.assignedTo === p.name; });
            ids.forEach(function (id) { if (leadsById[id] && mine.indexOf(leadsById[id]) === -1) mine.push(leadsById[id]); });
            return kpiBuildRow(p, snap, mine, res[1][i].list, res[1][i].full, range);
          });
          return { month: month, rows: rows, leadsById: leadsById, loadedAt: Date.now(), mode: 'rekap', asOf: asOf };
        });
      });
    }

    function kpiFetchRowReports(row, silent) {
      if (!kpiData) return Promise.resolve();
      if (row.reports) return Promise.resolve();
      if (row.reportsPromise) return row.reportsPromise;
      const month = kpiData.month;
      row.reportsPromise = kpiQueryReports(row.uid, null, kpiMonthRange(month)).then(function (list) {
        kpiReportsCache[month + '|' + row.uid] = list;
        row.reports = kpiSortReports(list);
        row.counts.online = kpiOnlineCount(list);
      }).finally(function () {
        row.reportsPromise = null;
        if (!silent && kpiModalOpen) renderKpi();
      });
      return row.reportsPromise;
    }

    function kpiEnsureAllReports() {
      if (!kpiData) return Promise.resolve();
      return Promise.all(kpiData.rows.map(function (r) { return kpiFetchRowReports(r, true); }));
    }

    function kpiBuildPdf(opt, who) {
      const items = kpiItems();
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 36;
      const srcRows = kpiData.rows.filter(function (r) { return !who || r.name === who; });
      const rows = srcRows.map(function (r) { return { r: r, score: kpiScore(r.counts, items) }; })
        .sort(function (a, b) { return b.score.total - a.score.total || a.r.name.localeCompare(b.r.name); });

      doc.setFillColor.apply(doc, PDF_BRAND_GREEN);
      doc.rect(0, 0, pageWidth, 86, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text(String(APP.companyName || '').toUpperCase(), marginX, 34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text('Laporan KPI Marketing – ' + kpiMonthLabel(kpiData.month) + (who ? ' – ' + who : ''), marginX, 52);
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, PDF_BRAND_ON_DARK);
      doc.text('Skor per indikator = capaian / target x bobot (maks. 100). Closing dihitung setelah disetujui supervisor.', marginX, 68);
      doc.setTextColor(255, 255, 255);
      doc.text('Dicetak: ' + formatDateID(new Date()), pageWidth - marginX, 34, { align: 'right' });
      doc.text(who ? 'Marketing: ' + who : 'Jumlah marketing: ' + rows.length, pageWidth - marginX, 50, { align: 'right' });

      const tableStyle = {
        margin: { left: marginX, right: marginX, bottom: 40 },
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 6, textColor: PDF_TEXT_DARK, lineColor: [228, 232, 227], lineWidth: 0.5, valign: 'middle' },
        headStyles: { fillColor: PDF_BRAND_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
        alternateRowStyles: { fillColor: PDF_BRAND_GREEN_SOFT }
      };
      let first = true;
      const section = function (title, tableOpts) {
        let y = 110;
        if (!first) {
          y = doc.lastAutoTable.finalY + 28;
          if (y > pageHeight - 110) { doc.addPage(); y = 50; }
        }
        first = false;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor.apply(doc, PDF_TEXT_DARK);
        doc.text(title, marginX, y);
        doc.autoTable(Object.assign({}, tableStyle, tableOpts, { startY: y + 8 }));
      };

      if (opt.rekap) {
        const colStyles = { 0: { halign: 'center', cellWidth: 26 }, 1: { fontStyle: 'bold' } };
        for (let c = 2; c <= items.length + 2; c++) colStyles[c] = { halign: 'center' };
        colStyles[items.length + 2] = { halign: 'center', fontStyle: 'bold' };
        section('Rekap KPI', {
          head: [['No', 'Nama Marketing'].concat(items.map(function (it) { return it.label + '\n(target ' + it.target + ', ' + it.weight + '%)'; }), ['Total Skor'])],
          body: rows.map(function (x, i) {
            return [i + 1, x.r.name].concat(x.score.parts.map(function (p) { return p.actual + ' / ' + p.item.target; }), [kpiFmt(x.score.total)]);
          }),
          columnStyles: colStyles
        });
      }

      if (opt.closing) {
        const closing = [];
        srcRows.forEach(function (r) {
          r.closings.forEach(function (cl) {
            const info = kpiClosingInfo(cl.lead, cl.key);
            const v = cl.lead.kpiVerify && cl.lead.kpiVerify[cl.key];
            closing.push([r.name, cl.lead.buyerName || '-', info.project || cl.lead.project || '-', kpiStageLabel(cl.key), formatDateID(cl.date),
              info.unit || '-', formatRupiahText(info.nominal) || '-',
              cl.status === 'approved' ? 'Disetujui' : cl.status === 'rejected' ? 'Ditolak' : 'Menunggu', (v && v.by) || '-']);
          });
        });
        section('Closing ITJ / SPPR', {
          head: [['Marketing', 'Buyer', 'Proyek', 'Tahap', 'Tanggal', 'Unit', 'Nominal', 'Verifikasi', 'Diputuskan oleh']],
          body: closing.length ? closing : [[{ content: 'Belum ada closing di bulan ini.', colSpan: 9, styles: { halign: 'center', textColor: PDF_TEXT_MUTED } }]],
          columnStyles: { 6: { halign: 'right' } },
          didParseCell: function (data) {
            if (data.section !== 'body' || data.column.index !== 7) return;
            if (data.cell.raw === 'Disetujui') { data.cell.styles.textColor = [31, 107, 72]; data.cell.styles.fontStyle = 'bold'; }
            if (data.cell.raw === 'Ditolak') { data.cell.styles.textColor = PDF_HOT_ACCENT; data.cell.styles.fontStyle = 'bold'; }
            if (data.cell.raw === 'Menunggu') { data.cell.styles.textColor = [138, 82, 18]; }
          }
        });
      }

      if (opt.laporan) {
        const laporan = [];
        srcRows.forEach(function (r) {
          (r.reports || []).forEach(function (rep) {
            const p = String(rep.dateKey || '').split('-');
            const detail = rep.type === 'Live TikTok' ? (rep.link || '-')
              : ['Lokasi: ' + (rep.place || '-'), 'Izin: ' + (rep.permitFrom || '-'), 'Lapor: ' + (rep.reportGroup || '-') + (rep.reportTime ? ' jam ' + rep.reportTime : '')].join('\n');
            laporan.push([r.name, p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : rep.dateKey, rep.type || '-', detail, rep.note || '-',
              rep.invalid ? 'Tidak valid' + (rep.invalidReason ? ': ' + rep.invalidReason : '') : 'Dihitung']);
          });
        });
        section('Laporan Online / Offline', {
          head: [['Marketing', 'Tanggal', 'Jenis', 'Bukti / Detail', 'Keterangan', 'Status']],
          body: laporan.length ? laporan : [[{ content: 'Belum ada laporan di bulan ini.', colSpan: 6, styles: { halign: 'center', textColor: PDF_TEXT_MUTED } }]],
          columnStyles: { 1: { cellWidth: 62 }, 2: { cellWidth: 70 }, 3: { cellWidth: 260 } },
          didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5 && String(data.cell.raw).indexOf('Tidak valid') === 0) {
              data.cell.styles.textColor = PDF_HOT_ACCENT;
            }
          }
        });
      }

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, PDF_TEXT_MUTED);
        doc.text(APP.companyName + ' – ' + APP.appName + ' – KPI Marketing', marginX, pageHeight - 18);
        doc.text('Halaman ' + i + ' dari ' + totalPages, pageWidth - marginX, pageHeight - 18, { align: 'right' });
      }
      const safeWho = who ? '-' + who.replace(/[^A-Za-z0-9]+/g, '_') : '';
      doc.save('KPI-Marketing-' + kpiData.month + safeWho + '.pdf');
    }

    function exportKpiExcelNow() {
      if (!kpiData || kpiIsMarketing()) return;
      const btn = document.getElementById('kpiExportXlsBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan...'; }
      loadXlsxLib().then(function (XLSX) {
        const items = kpiItems();
        const rows = kpiData.rows.map(function (r) { return { r: r, score: kpiScore(r.counts, items) }; })
          .sort(function (a, b) { return b.score.total - a.score.total || a.r.name.localeCompare(b.r.name); });
        const rekap = [['Peringkat', 'Nama Marketing'].concat(
          items.map(function (it) { return it.label + ' (target ' + it.target + ')'; }),
          items.map(function (it) { return 'Poin ' + it.label + ' (bobot ' + it.weight + ')'; }),
          ['Total Skor', 'Closing menunggu verifikasi'])];
        rows.forEach(function (x, i) {
          rekap.push([i + 1, x.r.name].concat(
            x.score.parts.map(function (p) { return p.actual; }),
            x.score.parts.map(function (p) { return Math.round(p.pts * 100) / 100; }),
            [Math.round(x.score.total * 100) / 100, (x.r.counts.itjPending || 0) + (x.r.counts.spprPending || 0)]));
        });
        const laporan = [['Nama Marketing', 'Tanggal', 'Jenis', 'Link TikTok', 'Lokasi', 'Izin dari', 'Lapor di grup', 'Jam lapor', 'Keterangan', 'Status', 'Alasan tidak valid']];
        const closing = [['Nama Marketing', 'Buyer', 'Proyek', 'Tahap', 'Tanggal', 'Unit', 'Nominal (Rp)', 'Verifikasi', 'Diputuskan oleh']];
        kpiData.rows.forEach(function (r) {
          (r.reports || []).forEach(function (rep) {
            laporan.push([r.name, rep.dateKey, rep.type || '', rep.link || '', rep.place || '', rep.permitFrom || '', rep.reportGroup || '', rep.reportTime || '', rep.note || '',
              rep.invalid ? 'Tidak valid' : 'Dihitung', rep.invalidReason || '']);
          });
          r.closings.forEach(function (cl) {
            const info = kpiClosingInfo(cl.lead, cl.key);
            const v = cl.lead.kpiVerify && cl.lead.kpiVerify[cl.key];
            closing.push([r.name, cl.lead.buyerName || '', info.project || cl.lead.project || '', kpiStageLabel(cl.key), formatDateID(cl.date), info.unit || '', formatRupiahDigits(info.nominal) ? Number(String(info.nominal).replace(/\D/g, '')) : '',
              cl.status === 'approved' ? 'Disetujui' : cl.status === 'rejected' ? 'Ditolak' : 'Menunggu', (v && v.by) || '']);
          });
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rekap), 'Rekap KPI');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(laporan), 'Laporan Online-Offline');
        const closingSheet = XLSX.utils.aoa_to_sheet(closing);
        for (let i = 1; i < closing.length; i++) {   // kolom Nominal (G): tampil dengan pemisah ribuan
          const cell = closingSheet[XLSX.utils.encode_cell({ r: i, c: 6 })];
          if (cell && cell.t === 'n') cell.z = '#,##0';
        }
        XLSX.utils.book_append_sheet(wb, closingSheet, 'Closing ITJ-SPPR');
        XLSX.writeFile(wb, 'KPI-Marketing-' + kpiData.month + '.xlsx');
      }).catch(function (err) {
        alert(err.message || String(err));
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Excel'; }
      });
    }

    function slugifyFilename(text) {
      return String(text || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'lead';
    }

    function buildLeadsPdfDoc(list, subtitleLines) {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Pustaka PDF belum termuat, pastikan koneksi internet aktif lalu coba lagi.');
        return null;
      }
      const jsPDF = window.jspdf.jsPDF;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 36;

      // --- Kop laporan: pita hijau tua khas aplikasi + nama perusahaan ---
      doc.setFillColor.apply(doc, PDF_BRAND_GREEN);
      doc.rect(0, 0, pageWidth, 86, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text(String(APP.companyName || '').toUpperCase(), marginX, 34);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text('Laporan Data Lead \u2013 ' + APP.appName, marginX, 52);

      doc.setFontSize(9);
      doc.setTextColor.apply(doc, PDF_BRAND_ON_DARK);
      doc.text(subtitleLines.join('   |   '), marginX, 68);

      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('Dicetak: ' + formatDateID(new Date()), pageWidth - marginX, 34, { align: 'right' });
      doc.text('Total Lead: ' + list.length, pageWidth - marginX, 50, { align: 'right' });

      // --- Tabel data ---
      const head = [['Tanggal Masuk', 'Nama Buyer', 'No. WhatsApp', 'Sumber Iklan', 'Proyek', 'Marketing', 'Status', 'Hot Prospek']];
      const body = list.map(function (l) {
        return [
          formatDateID(toJsDate(l.createdAt)),
          l.buyerName || '-',
          l.waNumber || '-',
          l.adSource || '-',
          l.project || '-',
          l.assignedTo || '-',
          l.status || '-',
          l.isHot ? 'Ya' : 'Tidak'
        ];
      });

      doc.autoTable({
        head: head,
        body: body,
        startY: 106,
        margin: { left: marginX, right: marginX, bottom: 40 },
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 7,
          textColor: PDF_TEXT_DARK,
          lineColor: [228, 232, 227],
          lineWidth: 0.5,
          valign: 'middle'
        },
        headStyles: {
          fillColor: PDF_BRAND_GREEN,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9.5,
          halign: 'left'
        },
        alternateRowStyles: { fillColor: PDF_BRAND_GREEN_SOFT },
        columnStyles: {
          0: { cellWidth: 68 },
          2: { cellWidth: 78 },
          6: { cellWidth: 78 },
          7: { cellWidth: 62, halign: 'center' }
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 7 && data.cell.raw === 'Ya') {
            data.cell.styles.textColor = PDF_HOT_ACCENT;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      // --- Footer: nama perusahaan kecil + nomor halaman, di setiap halaman ---
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, PDF_TEXT_MUTED);
        doc.text(APP.companyName + ' \u2013 ' + APP.appName, marginX, pageHeight - 18);
        doc.text('Halaman ' + i + ' dari ' + totalPages, pageWidth - marginX, pageHeight - 18, { align: 'right' });
      }

      return doc;
    }


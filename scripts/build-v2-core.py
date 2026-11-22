#!/usr/bin/env python3
"""
Membuat v2/core.js dari index.html (tampilan lama).

Tampilan baru (/v2/) memakai LOGIKA YANG SAMA PERSIS dengan tampilan lama: pengaturan aplikasi
(APP_CONFIG), aturan KPI, rekap harian hemat-read, Terima lead, cek nomor ganda, riwayat lonceng, dsb.
Daripada menulis ulang, fungsi-fungsi itu disalin otomatis dari index.html oleh skrip ini.

Jalankan ulang setiap kali logika di index.html berubah:
    python3 scripts/build-v2-core.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'v2', 'core.js')

# Konstanta / variabel tingkat atas yang ikut disalin (nama setelah const/let).
DECLS = [
    'PDF_BRAND_GREEN', 'PDF_BRAND_GREEN_SOFT', 'PDF_BRAND_ON_DARK', 'PDF_TEXT_DARK', 'PDF_TEXT_MUTED', 'PDF_HOT_ACCENT',
    'CLOSED_STATUSES', 'VISIT_DAY_NAMES',
    'KPI_DEFAULTS', 'KPI_SURVEY_STATUSES', 'KPI_ITJ_STATUSES', 'KPI_SPPR_STATUSES', 'KPI_REPORT_TYPES', 'KPI_MONTH_NAMES',
    'KPI_TREND_MONTHS', 'KPI_MONTH_SHORT', 'KPI_SNAP_KEYS', 'KPI_CACHE_MS',
    'notificationLog', 'notifIdCounter', 'notifState', 'NOTIF_HISTORY_SHOW', 'NOTIF_LOCAL_KEEP', 'NOTIF_SERVER_REFRESH_MS',
    'serverNotifs', 'serverNotifsAt', 'serverNotifsLoading', 'renderedNotifs',
    'LEADS_WINDOW_DAYS', 'ACTIVE_LEAD_STATUSES', 'leadsSnapshotFromCache', 'leadsLeanUnavailable',
    'PUSH_TOKEN_STORE_KEY', 'pushSwRegistration', 'pushMessaging', 'pushOnMessageBound',
    'ACCEPT_WINDOW_MS', 'acceptAudioCtx', 'kpiReportsCache', 'kpiConfig', 'WA_INDEX_RECHECK_MS', 'xlsxLoading',
]

# Fungsi logika (tanpa ketergantungan ke elemen tampilan lama).
FUNCS = [
    # umum
    'hexToRgbArray', 'escapeHtml', 'toJsDate', 'formatDateID', 'daysDiffDateOnly', 'defaultNextFollowUp',
    'toDateInputValue', 'fromDateInputValue', 'computeSla', 'leadDataType', 'formatVisit', 'upcomingVisitLabel',
    'waLink', 'toWaDigits', 'validateWaNumber', 'latestNoteDate', 'waIndexEntry', 'waIndexPut', 'waIndexRemove',
    'checkDuplicateAcrossTeam', 'lastFollowUpText', 'buildDuplicateWarning', 'timeAgoID', 'formatTimeID',
    'isCsAdminRole', 'isActiveUser', 'activeMarketingUsers', 'idToEmail', 'isValidLoginId',
    # lead & terima lead
    'isPendingAccept', 'acceptDeadlineMs', 'formatCountdown', 'formatClock', 'normalizeRotationQueue',
    'applyReassignToQueue', 'nextAcceptCandidate', 'playAcceptAlert',
    'leadsWindowStart', 'hematLeadQueries', 'leadCreatedMs', 'listenLeadQueries',
    'needsAttentionNow', 'resetNotifState', 'processRealtimeNotifications',
    'logMarketingActivity', 'logMarketingLogin', 'callNotify', 'closingKeyForStatus',
    'formatRupiahDigits', 'formatRupiahText',
    # riwayat lonceng
    'notifStoreKey', 'saveLocalNotifs', 'loadLocalNotifs', 'clearNotifHistoryState', 'recordNotif',
    'refreshServerNotifs', 'mergedNotifHistory', 'formatNotifTime',
    # push
    'isIosDevice', 'isStandaloneApp', 'pushBrowserSupported', 'pushUnsupportedReason', 'getPushSwRegistration',
    'unregisterPushTokenForLogout',
    # KPI
    'kpiIsMarketing', 'kpiCanView', 'kpiItems', 'kpiDateKey', 'kpiCurrentMonth', 'kpiMonthLabel', 'kpiMonthRange',
    'kpiMonthOptions', 'kpiFmt', 'kpiVerifyStatus', 'kpiCountLeads', 'kpiOnlineCount', 'kpiCanVerify',
    'kpiClosingInfo', 'kpiStageLabel', 'kpiScore', 'kpiReportsRef', 'kpiOwnLeadsSince', 'kpiHistoryRef',
    'kpiTrendMonthList', 'kpiMonthShort', 'loadXlsxLib',
    'kpiSnapDocId', 'kpiDayAfter', 'kpiSnapTargetAsOf', 'kpiSortReports', 'kpiBuildRow', 'kpiMakeSnap',
    'kpiSaveSnaps', 'kpiQueryReports', 'kpiFetchLeadsByIds', 'kpiLoadFull', 'kpiLoadFromSnaps',
    'kpiFetchRowReports', 'kpiEnsureAllReports', 'kpiBuildPdf', 'exportKpiExcelNow',
]


def extract_app_config(src):
    m = re.search(r'\n  window\.APP_CONFIG = \{.*?\n  \};\n', src, re.S)
    if not m:
        sys.exit('APP_CONFIG tidak ditemukan')
    return m.group(0).strip('\n')


def extract_decl(src, name):
    m = re.search(r'\n    (?:const|let) ' + re.escape(name) + r'\b', src)
    if not m:
        sys.exit('Deklarasi tidak ditemukan: ' + name)
    start = m.start() + 1
    depth = 0
    i = start
    while i < len(src):
        c = src[i]
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ';' and depth == 0:
            end = src.index('\n', i) if '\n' in src[i:] else len(src)
            return src[start:end]
        elif c in '\'"':   # lewati string
            q = c
            i += 1
            while i < len(src) and src[i] != q:
                if src[i] == '\\':
                    i += 1
                i += 1
        i += 1
    sys.exit('Akhir deklarasi tidak ditemukan: ' + name)


def extract_func(src, name):
    m = re.search(r'\n    function ' + re.escape(name) + r'\(', src)
    if not m:
        sys.exit('Fungsi tidak ditemukan: ' + name)
    start = m.start() + 1
    end = src.index('\n    }\n', start) + len('\n    }')
    return src[start:end]


def main():
    src = open(SRC, encoding='utf-8').read().replace('\r\n', '\n')
    parts = [
        '// ============================================================',
        '// v2/core.js — DIBUAT OTOMATIS oleh scripts/build-v2-core.py dari index.html.',
        '// JANGAN diedit manual: ubah index.html lalu jalankan ulang skripnya.',
        '// Berisi pengaturan aplikasi + fungsi logika yang dipakai bersama tampilan lama & /v2/.',
        '// ============================================================',
        extract_app_config(src),
        '    const APP = window.APP_CONFIG;',
        '',
    ]
    for n in DECLS:
        parts.append(extract_decl(src, n))
    parts.append('')
    for n in FUNCS:
        parts.append(extract_func(src, n))
        parts.append('')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
    print('OK:', OUT, '(%d deklarasi, %d fungsi)' % (len(DECLS), len(FUNCS)))


if __name__ == '__main__':
    main()

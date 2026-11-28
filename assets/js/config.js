const API_URL = 'https://script.google.com/macros/s/AKfycbwcIFyT92dwKwzSuXu1TXA2OUa-MHO_GFkL8vOaL5XWGDWUIGVw0YQOvZpEaaRYrrQ/exec';
const MAIN_SHEET_ID = '11TA2pPlxqajVwkPEigNMPNfsV-12CExxmySk1OMw_v8';

// Apps Script intermittently fails (timeouts, quota, concurrent-execution limits) and returns an
// HTML error page without CORS headers, which the browser reports as a CORS error. Retry those.
async function fetchWithRetry(url, options, retries = 3, delayMs = 1000) {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt >= retries) throw error;
            console.warn(`Fetch failed (attempt ${attempt + 1}), retrying...`, error);
            await new Promise(resolve => setTimeout(resolve, delayMs * 2 ** attempt));
        }
    }
}


// Results of SELECTs, shared by every app page and browser tab until the page is refreshed, so moving
// between pages does not fetch the same worksheet again. IndexedDB, not localStorage: whole worksheets
// can exceed localStorage's ~5 MB. A reload, or a fresh password unlock, starts from empty.
const DataCache = (() => {
    const STORE = 'results';
    const db = new Promise((resolve, reject) => {
        const request = indexedDB.open('mb-data-cache', 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    function run(mode, action) {
        return db.then(database => new Promise((resolve, reject) => {
            const request = action(database.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }

    const isReload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    const wasLocked = document.documentElement.classList.contains('mb-locked');
    const cleared = (isReload || wasLocked ? run('readwrite', store => store.clear()) : Promise.resolve())
        .catch(error => console.warn('Data cache unavailable', error));

    // The operation minus its echo-only `id`, so pages using different ids still share results.
    function key({ id, ...operation }) {
        return JSON.stringify(operation);
    }

    // Every failure is swallowed: the cache only ever saves calls, it never breaks a page.
    // `set` copies the result now, before the page gets to change its rows.
    return {
        get: operation => cleared.then(() => run('readonly', store => store.get(key(operation)))).catch(() => undefined),
        set: (operation, result) => { result = structuredClone(result); return run('readwrite', store => store.put(result, key(operation))).catch(() => undefined); }
    };
})();

// ---------- Column check ----------
// A renamed or removed column doesn't fail a page: `Number(row.x) || 0` reads it as 0 and the numbers are
// quietly wrong. So every SELECT result is checked here, two ways:
// 1. EXPECTED_COLUMNS: the columns pages rely on, per worksheet. One missing shows an error on the page.
//    Add a column here when a page starts depending on it; drop it when none does. Columns that are only
//    shown when present (notes, optional amounts) are left out on purpose, so they never raise a false alarm.
// 2. Every worksheet (listed or not): its column names are remembered in this browser, and any column added
//    or removed since the last load is reported once, then becomes the new baseline.
// Columns are the keys of the returned rows, so an empty worksheet is skipped.
const EXPECTED_COLUMNS = {
    'db2.deliveries': ['name', 'timestamp', 'orderId', 'deliveredPc', 'deliveredKg', 'rate', 'deliverAmount',
        'paidCash', 'paidOnline', 'discount', 'autoAdjust', 'adjustments', 'prevAmount', 'khataBalance', 'totalBalance'],
    'deliveries.2023': ['name', 'timestamp', 'deliveredPc', 'deliveredKg', 'rate', 'deliverAmount',
        'paidCash', 'paidOnline', 'discount', 'prevAmount', 'khataBalance', 'totalBalance'],
    'cumilativeCalculations': ['date', 'kg', 'deliveredKg', 'deliveredPc', 'profit', 'sold_amount', 'shortage',
        'prev_due_balance', 'new_due_balance', 'car_expense', 'labour_expense', 'extra_expenses'],
    'db2.loads': ['deliverySession', 'transactionType', 'sender', 'via', 'receiver', 'senderAmount', 'viaSellAmount'],
    'temp.load': ['deliverySession', 'transactionType', 'sender', 'via', 'receiver', 'senderAmount', 'viaSellAmount'],
    'cal.occasions': ['occassionName', 'daysPrepend', 'daysAppend'],
    'apiData': ['initialReading', 'currentReading', 'targetUnits', 'EstimatedBill']
    // `revenue` is not listed: app/profits/monthly.js matches its headers loosely and reports a missing one itself.
};
const SEEN_COLUMNS_KEY = 'mb-columns';
// What the check found for each worksheet loaded on this page, keyed "spreadsheetId/worksheet":
// { worksheet, columns, expected, missing, added, removed, firstSeen }. Read by app/checks/.
const columnReports = {};

function checkColumns(operation, rows) {
    if (operation.type !== 'SELECT' || !rows?.length) return;
    const key = `${operation.spreadsheetId}/${operation.worksheet}`;
    if (columnReports[key]) return;

    const name = operation.worksheet;
    const present = new Set();
    rows.forEach(row => Object.keys(row).forEach(column => present.add(column)));
    const columns = [...present].sort();
    const expected = EXPECTED_COLUMNS[name] || null;
    const missing = (expected || []).filter(column => !present.has(column));

    let before = null;
    try {
        const seen = JSON.parse(localStorage.getItem(SEEN_COLUMNS_KEY) || '{}');
        before = seen[key] || null;
        seen[key] = columns;
        localStorage.setItem(SEEN_COLUMNS_KEY, JSON.stringify(seen));
    } catch { /* storage unavailable: only the expected-column check runs */ }
    const added = before ? columns.filter(column => !before.includes(column)) : [];
    const removed = before ? before.filter(column => !present.has(column) && !missing.includes(column)) : [];
    columnReports[key] = { worksheet: name, columns, expected, missing, added, removed, firstSeen: !before };

    // app/checks/ shows these itself, so it turns the page notices off.
    const notify = (type, message) => {
        (type === 'error' ? console.error : console.warn)(message);
        if (window.Mb?.notice && document.body?.dataset.columnNotices !== 'off') Mb.notice(type, message, `${type}:${key}`);
    };
    if (missing.length) {
        notify('error', `The "${name}" worksheet no longer has the column${missing.length > 1 ? 's' : ''} ` +
            `${missing.join(', ')}. Figures that use ${missing.length > 1 ? 'them' : 'it'} may be wrong until the page is updated.`);
    }
    if (added.length || removed.length) {
        notify('info', `The "${name}" worksheet's columns changed since this browser last loaded it.` +
            (added.length ? ` Added: ${added.join(', ')}.` : '') +
            (removed.length ? ` Removed: ${removed.join(', ')}.` : ''));
    }
}

// Send a batch of operations to the GridBase engine; resolves to one { operationId, rowCount, rows }
// per operation. A string body goes as text/plain, which avoids a CORS preflight; the engine parses it as JSON.
// SELECTs already answered since the last refresh come from DataCache; only the rest are sent.
async function callSheetsApi(operations) {
    if (window.Mb) await Mb.ready; // app pages: wait for the password gate in common.js
    const cached = await Promise.all(operations.map(op => op.type === 'SELECT' ? DataCache.get(op) : undefined));
    const missing = operations.filter((op, i) => !cached[i]);

    let fetched = [];
    if (missing.length) {
        const response = await fetchWithRetry(API_URL, {
            method: 'POST',
            body: JSON.stringify({ operations: missing })
        });
        if (!response.success) throw new Error(response.error || JSON.stringify(response.errors));
        fetched = response.results;
        missing.forEach((op, i) => { if (op.type === 'SELECT') DataCache.set(op, fetched[i]); });
    }

    let next = 0;
    const results = operations.map((op, i) => cached[i] ? { ...cached[i], operationId: op.id } : fetched[next++]);
    results.forEach((result, i) => {
        try { checkColumns(operations[i], result?.rows); } catch (error) { console.warn('Column check failed', error); }
    });
    return results;
}

// Dues always mean totalBalance. cumilativeCalculations' prev_due_balance and new_due_balance add up every
// customer's khataBalance, so this adds each customer's totalBalance − khataBalance (their latest on that date).
// Otherwise money moved between otherBalances and khataBalance looks like dues rising or falling.
// Changes the rows and returns them; rejects if the deliveries can't be read, rather than show khata dues.
async function useTotalBalanceDues(dayRows) {
    const select = (spreadsheetId, worksheet) =>
        callSheetsApi([{ type: "SELECT", spreadsheetId, worksheet, id: "mbros-github-site" }]).then(data => data[0].rows);
    const [archive, current] = await Promise.all([
        select("1-uKyCderO-4Zq-YRb8HEzPgbSZPJ_vdzWs2P3BqE2kw", "deliveries.2023"),   // 2023–2025
        select(MAIN_SHEET_ID, "db2.deliveries")                                      // from 2026
    ]);
    const number = value => Number(String(value ?? '').replace(/,/g, '')) || 0;
    // Newer rows hold YYYY-MM-DD; older ones a UTC timestamp of IST midnight.
    const dayOf = value => (typeof value === 'string' && value.length === 10) ? value : Mb.toISTDate(value);

    // The total difference across customers, as { day, extra } each time it changes.
    const rows = [...archive, ...current].filter(row => row.name && row.timestamp)
        .map((row, index) => ({ row, index, day: dayOf(row.timestamp) }))
        .sort((a, b) => a.day.localeCompare(b.day) || a.index - b.index);
    const byCustomer = new Map();
    const changes = [];
    let extra = 0;
    rows.forEach(({ row, day }) => {
        const now = number(row.totalBalance) - number(row.khataBalance);
        extra += now - (byCustomer.get(row.name) || 0);
        byCustomer.set(row.name, now);
        const last = changes[changes.length - 1];
        if (last?.day === day) last.extra = extra;
        else if (!last || last.extra !== extra) changes.push({ day, extra });
    });
    const extraBefore = day => changes.filter(change => change.day < day).pop()?.extra || 0;
    const extraOn = day => changes.filter(change => change.day <= day).pop()?.extra || 0;
    const isDue = value => value !== '' && value !== null && value !== undefined && value !== '#N/A';

    dayRows.forEach(row => {
        if (!row.date) return;
        const day = dayOf(row.date);
        if (isDue(row.prev_due_balance)) row.prev_due_balance = number(row.prev_due_balance) + extraBefore(day);
        if (isDue(row.new_due_balance)) row.new_due_balance = number(row.new_due_balance) + extraOn(day);
    });
    return dayRows;
}

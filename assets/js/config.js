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
    return operations.map((op, i) => cached[i] ? { ...cached[i], operationId: op.id } : fetched[next++]);
}

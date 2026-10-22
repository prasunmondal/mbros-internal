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


// Send a batch of operations to the GridBase engine; resolves to one { operationId, rowCount, rows }
// per operation. A string body goes as text/plain, which avoids a CORS preflight; the engine parses it as JSON.
async function callSheetsApi(operations) {
    const response = await fetchWithRetry(API_URL, {
        method: 'POST',
        body: JSON.stringify({ operations })
    });
    if (!response.success) throw new Error(response.error || JSON.stringify(response.errors));
    return response.results;
}

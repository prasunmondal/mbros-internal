const API_URL = 'https://script.google.com/macros/s/AKfycby0rORN4PWBqs2XR2JFTlMHBA2kphA7A8LLrAQ40yF8aiXveEa1cqUJA-glH36VdRZ0Pg/exec';

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

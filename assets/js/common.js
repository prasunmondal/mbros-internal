// Shared helpers for the internal app: header/navigation and formatting.
// Everything lives under one global, `Mb`, so it never clashes with a page's own function names.
(function () {
    // Site root, worked out from this script's own URL (assets/js/common.js), so links work
    // under any base path (custom domain or a GitHub Pages project path).
    const ROOT = new URL('../../', document.currentScript.src);

    // Single source for the app navigation and the overview page's tool cards.
    const TOOLS = [
        { id: 'profits', path: 'app/profits/', title: 'Business Dashboard', group: 'Analytics',
          description: 'Profit, expenses, due balance and year-over-year trends.' },
        { id: 'deliveries', path: 'app/deliveries/', title: 'Past Deliveries', group: 'Reports',
          description: 'Delivered KG per customer across date groups and years.' },
        { id: 'statement', path: 'app/statement/', title: 'Customer Statement', group: 'Reports',
          description: 'Statement for one or more customers over a date range, with a running balance.' },
        { id: 'customer-performance', path: 'app/customer-performance/', title: 'Customer Performance', group: 'Reports',
          description: 'Order frequency, average order size and KG trends per customer.' },
        { id: 'daily', path: 'app/daily/', title: 'Day Summary', group: 'Reports',
          description: 'One day: loading, sales, dues, expenses, profit, staff and customer deliveries.' },
        { id: 'customer-profit', path: 'app/customer-profit/', title: 'Customer Profit', group: 'Reports',
          description: 'Profit and debt movement for a customer over a date range.' }
    ];

    // Password gate for every app page. A deterrent only: this is a static site, so the hash is
    // public and the engine URL still answers without it (see context/known-issues.md).
    // ACCESS_HASH is the SHA-256 hex of the password; changing it signs every device out.
    const ACCESS_HASH = '362a945ed1f1d7d21e574f65bea48928db2e198815fc1bb8c6fb965eb0acf293';
    const ACCESS_KEY = 'mb-access';
    const SESSION_MS = 0.5 * 60 * 60 * 1000; // an unlock lasts 0.5 hours, then the password is asked again

    // Unlock time (ms) if this browser holds a current, unexpired unlock; otherwise null.
    function storedUnlockTime() {
        try {
            const { hash, at } = JSON.parse(localStorage.getItem(ACCESS_KEY));
            return hash === ACCESS_HASH && Date.now() - at < SESSION_MS ? at : null;
        } catch {
            return null;
        }
    }

    // Lock an open page when its session runs out.
    function scheduleExpiry(at) {
        setTimeout(lock, Math.max(0, at + SESSION_MS - Date.now()));
    }

    let unlock;
    // Resolves once the password is accepted; callSheetsApi waits on it, so nothing loads while locked.
    const ready = new Promise(resolve => { unlock = resolve; });
    const unlockedAt = storedUnlockTime();
    if (unlockedAt !== null) {
        unlock();
        scheduleExpiry(unlockedAt);
    } else {
        document.documentElement.classList.add('mb-locked');
    }

    async function sha256(text) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function renderLock() {
        if (!document.documentElement.classList.contains('mb-locked')) return;
        document.body.insertAdjacentHTML('beforeend', `
            <div class="lock-screen">
                <form class="card lock-card">
                    <span class="brand-mark">MB</span>
                    <h1>Mondal Brothers Internal</h1>
                    <div class="field">
                        <label for="mbPassword">Password</label>
                        <input class="input" id="mbPassword" type="password" autocomplete="current-password" required autofocus>
                    </div>
                    <div class="status status-error" hidden></div>
                    <button class="btn btn-primary btn-block" type="submit">Unlock</button>
                </form>
            </div>`);

        const screen = document.body.lastElementChild;
        const input = screen.querySelector('input');
        const status = screen.querySelector('.status');
        screen.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            let hash;
            try {
                hash = await sha256(input.value);
            } catch {
                setStatus(status, 'error', 'This browser cannot check the password here. Open the site over https.');
                return;
            }
            if (hash !== ACCESS_HASH) {
                setStatus(status, 'error', 'Wrong password.');
                input.select();
                return;
            }
            const at = Date.now();
            try { localStorage.setItem(ACCESS_KEY, JSON.stringify({ hash, at })); } catch { /* unlocked for this page view only */ }
            screen.remove();
            document.documentElement.classList.remove('mb-locked');
            unlock();
            scheduleExpiry(at);
        });
    }

    function lock() {
        try { localStorage.removeItem(ACCESS_KEY); } catch { /* nothing stored */ }
        location.reload();
    }

    function url(path) {
        return new URL(path, ROOT).href;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    // Shift a UTC timestamp to IST (UTC+5:30) and return it as YYYY-MM-DD.
    function toISTDate(timestamp) {
        const date = new Date(timestamp);
        return new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    function todayIST() {
        return toISTDate(Date.now());
    }

    function formatNumber(value, decimals = 2) {
        const number = Number(value) || 0;
        return number.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatINR(value, decimals = 2) {
        const number = Number(value) || 0;
        return (number < 0 ? '−₹' : '₹') + formatNumber(Math.abs(number), decimals);
    }

    // Show a loading / error / empty message in a `.status` element; type null hides it.
    function setStatus(element, type, message) {
        if (!type) {
            element.hidden = true;
            return;
        }
        element.hidden = false;
        element.className = `status status-${type}`;
        element.innerHTML = (type === 'info' ? '<span class="spinner" aria-hidden="true"></span>' : '')
            + `<span>${escapeHtml(message)}</span>`;
    }

    // Insert the app header (brand + nav) and footer. The current page is <body data-page="...">.
    function renderShell() {
        const current = document.body.dataset.page;
        const links = [{ id: 'overview', path: 'app/', title: 'Overview' }, ...TOOLS]
            .map(t => `<a href="${url(t.path)}"${t.id === current ? ' aria-current="page"' : ''}>${escapeHtml(t.title)}</a>`)
            .join('');

        document.body.insertAdjacentHTML('afterbegin', `
            <header class="app-header">
                <div class="app-header-inner">
                    <a class="brand" href="${url('app/')}">
                        <span class="brand-mark">MB</span>
                        <span>Mondal Brothers <span class="brand-sub">Internal</span></span>
                    </a>
                    <nav class="app-nav" aria-label="Tools">${links}</nav>
                </div>
            </header>`);

        document.body.insertAdjacentHTML('beforeend', `
            <footer class="app-footer">
                <div class="container">
                    Mondal Brothers internal tools · <a href="${url('')}">Public site</a> · <a href="${url('pay/')}">Payment page</a> · <a href="#" data-lock>Lock</a>
                </div>
            </footer>`);

        document.querySelector('[data-lock]').addEventListener('click', event => {
            event.preventDefault();
            lock();
        });
        document.querySelector('.app-nav [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    function start() {
        renderShell();
        renderLock();
    }

    window.Mb = { TOOLS, ready, url, escapeHtml, toISTDate, todayIST, formatNumber, formatINR, setStatus };

    // Loaded in <head>, so `Mb` exists before page scripts run; the shell goes in once the body is parsed.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();

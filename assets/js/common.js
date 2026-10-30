// Shared helpers for the internal app: header/navigation and formatting.
// Everything lives under one global, `Mb`, so it never clashes with a page's own function names.
(function () {
    // Site root, worked out from this script's own URL (assets/js/common.js), so links work
    // under any base path (custom domain or a GitHub Pages project path).
    const ROOT = new URL('../../', document.currentScript.src);

    // Single source for the app navigation and the overview page's tool cards.
    const TOOLS = [
        { id: 'balance', path: 'app/balance/', title: 'Balances', group: 'Reports',
          description: 'Customer khata balances as of a chosen date.' },
        { id: 'statement', path: 'app/statement/', title: 'Statement', group: 'Reports',
          description: 'Statement for one or more customers over a date range, with a running balance.' },
        { id: 'deliveries', path: 'app/deliveries/', title: 'Deliveries', group: 'Reports',
          description: 'Delivered KG per customer across date groups and years.' },
        { id: 'customer-profit', path: 'app/customer-profit/', title: 'Customer profit', group: 'Reports',
          description: 'Profit and debt movement for a customer over a date range.' },
        { id: 'customer-performance', path: 'app/customer-performance/', title: 'Customer performance', group: 'Reports',
          description: 'Order frequency, average order size and KG trends per customer.' },
        { id: 'profits', path: 'app/profits/', title: 'Business dashboard', group: 'Analytics',
          description: 'Profit, expenses, due balance and year-over-year trends.' },
        { id: 'daily', path: 'app/daily/', title: 'Daily summary', group: 'Analytics',
          description: 'Day-by-day sales, profit and expense charts.' },
        { id: 'meters', path: 'app/meters/', title: 'Meter readings', group: 'Tools',
          description: 'Meter reading difference and units left to target.' },
        { id: 'calculator', path: 'app/calculator/', title: 'Commission calculator', group: 'Tools',
          description: 'Split a discount into the customer share and commission.' }
    ];

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
                    Mondal Brothers internal tools · <a href="${url('')}">Public site</a> · <a href="${url('pay/')}">Payment page</a>
                </div>
            </footer>`);

        document.querySelector('.app-nav [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    window.Mb = { TOOLS, url, escapeHtml, toISTDate, todayIST, formatNumber, formatINR, setStatus };

    // Loaded in <head>, so `Mb` exists before page scripts run; the shell goes in once the body is parsed.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderShell);
    else renderShell();
})();

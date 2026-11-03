// Business dashboard, Monthly report tab: one month of cumilativeCalculations rows, compared with the
// month before and the same month last year. profits.js fetches the rows and hands them over with
// MonthlyReport.setRows(); this file only reads them. Chart helpers (chartTheme, getChartConfig) are
// the globals in profits.js.
const MonthlyReport = (() => {
    const num = value => Number(value) || 0;
    const has = value => value !== '' && value !== null && value !== undefined && value !== '#N/A';
    // Newer rows hold YYYY-MM-DD; older ones a UTC timestamp of IST midnight (same as app/daily/).
    const dayOf = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : Mb.toISTDate(value);

    const inr = value => Mb.formatINR(value, 0);
    const kg = value => Mb.formatNumber(value, 3) + ' kg';

    let byMonth = new Map();   // 'YYYY-MM' -> rows sorted by date
    let months = [];           // sorted months that have rows
    let current = null;        // month on screen
    let chart = null;
    let failed = false;

    const status = () => document.getElementById('monthStatus');
    const isActive = () => document.body.dataset.view === 'monthly';

    // ---------- Month arithmetic ----------

    function shiftMonth(month, delta) {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + delta, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
    const monthName = (month, style = 'long') => {
        const [y, m] = month.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: style, year: 'numeric', timeZone: 'UTC' });
    };

    // ---------- Figures ----------

    // A row's expenses: total_expenses when recorded, else car + labour + extra (as the Overview charts add them).
    const rowExpenses = row => has(row.total_expenses) ? num(row.total_expenses)
        : num(row.car_expense) + num(row.labour_expense) + num(row.extra_expenses);

    function summarize(rows) {
        if (!rows || !rows.length) return null;
        const sum = key => rows.reduce((total, row) => total + num(row[key]), 0);
        const profit = sum('profit');
        const kgLoaded = sum('kg');
        const withDue = rows.filter(row => has(row.new_due_balance));
        const dueStart = withDue.length ? num(withDue[0].prev_due_balance) : null;
        const dueEnd = withDue.length ? num(withDue[withDue.length - 1].new_due_balance) : null;
        const dueChange = withDue.length ? dueEnd - dueStart : 0;
        return {
            profit,
            kg: kgLoaded,
            deliveredKg: sum('deliveredKg'),
            sold: sum('sold_amount'),
            paid: sum('paid_amount'),
            discounts: sum('discounts'),
            expenses: rows.reduce((total, row) => total + rowExpenses(row), 0),
            trips: rows.length,
            days: new Set(rows.map(row => row._day)).size,
            km: sum('km'),
            profitPerKg: kgLoaded ? profit / kgLoaded : null,
            dueStart, dueEnd, dueChange,
            actualMoney: profit - dueChange,
            lastDay: rows[rows.length - 1]._day,
            expenseParts: {
                car: sum('car_expense'), labour: sum('labour_expense'), extra: sum('extra_expenses'),
                police: sum('police'), other: sum('other_expense_amount'), transport: sum('transport_expenses')
            },
            transportIncome: sum('transport_income')
        };
    }

    // ---------- Rendering ----------

    // Percent change, or null when there is nothing to compare with.
    const change = (now, before) => (now === null || before === null || before === undefined || !before) ? null : (now - before) / Math.abs(before);

    function changeLine(label, now, before, goodWhenUp) {
        const span = document.createElement('span');
        span.className = 'kpi-change';
        const pct = change(now, before);
        if (pct === null) {
            span.textContent = `${label}: –`;
            return span;
        }
        const up = pct > 0;
        span.textContent = `${up ? '▲' : pct < 0 ? '▼' : ''} ${Mb.formatNumber(Math.abs(pct) * 100, 1)}% ${label}`.trim();
        if (pct) span.classList.add(up === goodWhenUp ? 'good' : 'bad');
        return span;
    }

    function renderKpis(now, prev, lastYear, month) {
        const prevLabel = 'vs ' + monthName(shiftMonth(month, -1), 'short');
        const yearLabel = 'vs ' + monthName(shiftMonth(month, -12), 'short');
        const kpis = [
            { label: 'Profit', key: 'profit', format: inr, good: true, accent: 'accent-green' },
            { label: 'Actual money received', key: 'actualMoney', format: inr, good: true, accent: 'accent-purple',
              hint: 'Profit minus the rise in customer dues' },
            { label: 'Sales', key: 'sold', format: inr, good: true, accent: 'accent-blue' },
            { label: 'Paid by customers', key: 'paid', format: inr, good: true, accent: 'accent-blue' },
            { label: 'Expenses', key: 'expenses', format: inr, good: false, accent: 'accent-red' },
            { label: 'KG loaded', key: 'kg', format: kg, good: true, accent: 'accent-amber' },
            { label: 'Profit per KG', key: 'profitPerKg', format: value => value === null ? '–' : '₹' + Mb.formatNumber(value, 2), good: true, accent: 'accent-green' },
            { label: 'Trips', key: 'trips', format: value => Mb.formatNumber(value, 0), good: true, accent: 'accent-amber' },
            { label: 'Due at month end', key: 'dueEnd', format: value => value === null ? '–' : inr(value), good: false, accent: 'accent-red',
              extra: now.dueStart === null ? '' : `${now.dueChange >= 0 ? 'Up' : 'Down'} ${inr(Math.abs(now.dueChange))} this month` }
        ];
        const container = document.getElementById('monthKpis');
        container.replaceChildren(...kpis.map(kpi => {
            const card = document.createElement('div');
            card.className = `kpi-card ${kpi.accent}`;
            if (kpi.hint) card.title = kpi.hint;
            const label = Object.assign(document.createElement('div'), { className: 'kpi-label', textContent: kpi.label });
            const value = Object.assign(document.createElement('div'), { className: 'kpi-value', textContent: kpi.format(now[kpi.key]) });
            const changes = document.createElement('div');
            changes.className = 'kpi-changes';
            if (kpi.extra) changes.append(Object.assign(document.createElement('span'), { className: 'kpi-change', textContent: kpi.extra }));
            changes.append(
                changeLine(prevLabel, now[kpi.key], prev?.[kpi.key] ?? null, kpi.good),
                changeLine(yearLabel, now[kpi.key], lastYear?.[kpi.key] ?? null, kpi.good));
            card.append(label, value, changes);
            return card;
        }));
    }

    function renderChart(month, rows, lastYearRows) {
        destroyChartInstance();
        const canvas = document.getElementById('monthDailyChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const days = daysIn(month);
        const labels = Array.from({ length: days }, (_, i) => String(i + 1));
        const perDay = (list, key) => {
            const values = Array(days).fill(null);
            (list || []).forEach(row => {
                const i = Number(row._day.slice(8, 10)) - 1;
                values[i] = (values[i] ?? 0) + num(row[key]);
            });
            return values;
        };
        const theme = chartTheme();
        const base = getChartConfig();
        const lastYearName = monthName(shiftMonth(month, -12), 'short');

        chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: 'Profit', data: perDay(rows, 'profit'), backgroundColor: '#2563eb', borderRadius: 3, yAxisID: 'y', order: 2 },
                    { type: 'line', label: `Profit, ${lastYearName}`, data: perDay(lastYearRows, 'profit'), borderColor: theme.dark ? '#9ca3af' : '#6b7280',
                      borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, spanGaps: true, tension: 0.3, yAxisID: 'y', order: 1 },
                    { type: 'line', label: 'KG loaded', data: perDay(rows, 'kg'), borderColor: '#f59e0b', backgroundColor: '#f59e0b',
                      borderWidth: 2, pointRadius: 2, spanGaps: true, tension: 0.3, yAxisID: 'kg', order: 0 }
                ]
            },
            options: {
                ...base,
                plugins: {
                    ...base.plugins,
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => items.length ? `${items[0].label} ${monthName(month, 'short')}` : '',
                            label: ctx => ctx.parsed.y === null ? null
                                : `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'kg' ? kg(ctx.parsed.y) : inr(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: base.scales.x,
                    y: { ...base.scales.y, title: { display: true, text: 'Profit (₹)', color: theme.ticks } },
                    kg: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: theme.ticks },
                          title: { display: true, text: 'KG', color: theme.ticks } }
                }
            }
        });
    }

    function destroyChartInstance() {
        if (chart) { chart.destroy(); chart = null; }
    }

    function renderExpenses(now, prev) {
        const parts = [
            ['Car', 'car'], ['Labour', 'labour'], ['Extra', 'extra'], ['Police', 'police'],
            ['Other', 'other'], ['Transport', 'transport']
        ].filter(([, key]) => now.expenseParts[key] || prev?.expenseParts[key]);
        const body = document.getElementById('monthExpenses').tBodies[0];
        body.replaceChildren();
        const addRow = (label, value, before, share, className) => {
            const tr = body.insertRow();
            if (className) tr.className = className;
            [label, inr(value), share, before === null ? '–' : inr(before)].forEach((text, i) => {
                const td = tr.insertCell();
                td.textContent = text;
                if (i) td.className = 'num';
            });
        };
        const partsTotal = parts.reduce((total, [, key]) => total + now.expenseParts[key], 0);
        parts.forEach(([label, key]) => addRow(label, now.expenseParts[key], prev ? prev.expenseParts[key] : null,
            partsTotal ? Mb.formatNumber(now.expenseParts[key] / partsTotal * 100, 1) + '%' : ''));
        addRow('Total expenses', now.expenses, prev ? prev.expenses : null, '', 'total-row');
        if (now.transportIncome || prev?.transportIncome) addRow('Transport income', now.transportIncome, prev ? prev.transportIncome : null, '');
        document.getElementById('monthExpensesPrev').textContent = monthName(shiftMonth(current, -1), 'short');
    }

    function renderDays(rows) {
        const body = document.getElementById('monthDays').tBodies[0];
        body.replaceChildren();
        const byDay = new Map();
        rows.forEach(row => {
            if (!byDay.has(row._day)) byDay.set(row._day, []);
            byDay.get(row._day).push(row);
        });
        const totals = { kg: 0, sold: 0, paid: 0, expenses: 0, profit: 0 };
        byDay.forEach((dayRows, day) => {
            const sum = key => dayRows.reduce((total, row) => total + num(row[key]), 0);
            const values = { kg: sum('kg'), sold: sum('sold_amount'), paid: sum('paid_amount'),
                expenses: dayRows.reduce((total, row) => total + rowExpenses(row), 0), profit: sum('profit') };
            Object.keys(totals).forEach(key => totals[key] += values[key]);
            const last = dayRows[dayRows.length - 1];
            const tr = body.insertRow();
            const dateCell = tr.insertCell();
            const link = document.createElement('a');
            link.href = `../daily/?date=${day}`;
            link.textContent = new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
            link.title = 'Open the day summary';
            dateCell.append(link);
            [Mb.formatNumber(values.kg, 3), Mb.formatNumber(values.sold, 0), Mb.formatNumber(values.paid, 0),
                Mb.formatNumber(values.expenses, 0), Mb.formatNumber(values.profit, 0),
                has(last.new_due_balance) ? Mb.formatNumber(last.new_due_balance, 0) : ''
            ].forEach((text, i) => {
                const td = tr.insertCell();
                td.className = 'num' + (i === 4 && values.profit < 0 ? ' negative' : '');
                td.textContent = text;
            });
        });
        const tr = body.insertRow();
        tr.className = 'total-row';
        [`Total (${byDay.size} days)`, Mb.formatNumber(totals.kg, 3), Mb.formatNumber(totals.sold, 0), Mb.formatNumber(totals.paid, 0),
            Mb.formatNumber(totals.expenses, 0), Mb.formatNumber(totals.profit, 0), ''
        ].forEach((text, i) => {
            const td = tr.insertCell();
            td.textContent = text;
            if (i) td.className = 'num';
        });
    }

    function render(month) {
        if (!months.length) return;
        current = month;
        const input = document.getElementById('monthInput');
        input.value = month;
        document.getElementById('prevMonth').disabled = !months.some(m => m < month);
        document.getElementById('nextMonth').disabled = !months.some(m => m > month);
        syncUrl();

        const rows = byMonth.get(month);
        const report = document.getElementById('monthReport');
        const title = document.getElementById('monthTitle');
        title.textContent = monthName(month);
        if (!rows) {
            destroyChartInstance();
            report.hidden = true;
            Mb.setStatus(status(), 'empty', `Nothing recorded in ${monthName(month)}.`);
            return;
        }
        Mb.setStatus(status(), null);
        report.hidden = false;

        const now = summarize(rows);
        const prev = summarize(byMonth.get(shiftMonth(month, -1)));
        const lastYear = summarize(byMonth.get(shiftMonth(month, -12)));
        const inProgress = month === Mb.todayIST().slice(0, 7);
        document.getElementById('monthNote').textContent = inProgress
            ? `Month in progress: figures up to ${new Date(now.lastDay + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, so comparisons with full months run low.`
            : `${now.days} trading days, ${Mb.formatNumber(now.km, 0)} km driven.`;

        renderKpis(now, prev, lastYear, month);
        renderExpenses(now, prev);
        renderDays(rows);
        renderChart(month, rows, byMonth.get(shiftMonth(month, -12)));
    }

    function syncUrl() {
        const params = new URLSearchParams(location.search);
        if (isActive()) {
            params.set('view', 'monthly');
            if (current) params.set('month', current);
        } else {
            params.delete('view');
            params.delete('month');
        }
        const query = params.toString();
        history.replaceState(null, '', query ? `?${query}` : location.pathname);
    }

    function step(direction) {
        const target = direction < 0 ? months.filter(m => m < current).pop() : months.find(m => m > current);
        if (target) render(target);
    }

    // ---------- Public ----------

    function setRows(rows) {
        byMonth = new Map();
        rows.forEach(row => {
            if (!row.date) return;
            const day = dayOf(row.date);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
            row._day = day;
            const month = day.slice(0, 7);
            if (!byMonth.has(month)) byMonth.set(month, []);
            byMonth.get(month).push(row);
        });
        byMonth.forEach(list => list.sort((a, b) => a._day.localeCompare(b._day)));
        months = [...byMonth.keys()].sort();
        if (!months.length) {
            Mb.setStatus(status(), 'empty', 'No daily figures found.');
            return;
        }
        ['monthInput', 'latestMonth'].forEach(id => document.getElementById(id).disabled = false);
        const input = document.getElementById('monthInput');
        input.min = months[0];
        input.max = months[months.length - 1];
        const requested = new URLSearchParams(location.search).get('month');
        current = /^\d{4}-\d{2}$/.test(requested || '') ? requested : months[months.length - 1];
        if (isActive()) render(current);
    }

    function fail() {
        failed = true;
        Mb.setStatus(status(), 'error', 'Could not load the daily figures. Please reload the page.');
    }

    // The chart is drawn only while its tab is visible, so it gets the right size.
    function show() {
        syncUrl();
        if (failed) return;
        if (!months.length) {
            Mb.setStatus(status(), 'info', 'Loading daily figures…');
            return;
        }
        render(current);
    }

    function setView(view) {
        document.body.dataset.view = view;
        document.querySelectorAll('.view-switch button').forEach(button =>
            button.setAttribute('aria-selected', String(button.dataset.view === view)));
        if (view === 'monthly') show();
        else syncUrl();
    }

    document.querySelectorAll('.view-switch button').forEach(button =>
        button.addEventListener('click', () => setView(button.dataset.view)));
    document.getElementById('monthInput').addEventListener('change', event => {
        if (/^\d{4}-\d{2}$/.test(event.target.value)) render(event.target.value);
    });
    document.getElementById('prevMonth').addEventListener('click', () => step(-1));
    document.getElementById('nextMonth').addEventListener('click', () => step(1));
    document.getElementById('latestMonth').addEventListener('click', () => render(months[months.length - 1]));
    document.addEventListener('mb:themechange', () => { if (isActive() && current && byMonth.has(current)) render(current); });

    if (new URLSearchParams(location.search).get('view') === 'monthly') setView('monthly');

    return { setRows, fail };
})();

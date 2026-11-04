// Business dashboard, Revenue tab (`?view=monthly`, was "Monthly report"): one month of cumilativeCalculations rows, compared with the
// month before and the same month last year. The month's From/To dates start at its 1st and last day
// and can be moved, e.g. to close the month on the 1st or 2nd of the next one after a busy month end.
// The Period picker switches to weeks: the days between two entries of the `revenue` worksheet (the
// day after one entry up to the next one, so not always 7 days), compared with the week before and the
// same dates a year back. Days after the last entry form an open week.
// profits.js fetches the rows and hands them over with MonthlyReport.setRows(); this file only reads
// them. Chart helpers (chartTheme, getChartConfig) are the globals in profits.js.
const MonthlyReport = (() => {
    const num = value => Number(value) || 0;
    const has = value => value !== '' && value !== null && value !== undefined && value !== '#N/A';
    const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    const MONTH_RE = /^\d{4}-\d{2}$/;
    // Newer rows hold YYYY-MM-DD; older ones a UTC timestamp of IST midnight (same as app/daily/).
    const dayOf = value => (typeof value === 'string' && DAY_RE.test(value)) ? value : Mb.toISTDate(value);

    const inr = value => Mb.formatINR(value, 0);
    const kg = value => Mb.formatNumber(value, 3) + ' kg';

    let allRows = [];          // every row with a valid date, sorted by date
    let months = [];           // sorted months that have rows
    let weeks = [];            // sorted weeks, each named by its first day
    let weekSpan = new Map();  // week first day -> { first, last, open }
    let mode = 'month';        // 'month' or 'week'
    let current = null;        // period on screen: YYYY-MM for a month, its first day (YYYY-MM-DD) for a week.
                               // Before the revenue sheet has loaded, a week is only a day to look for.
    let rangeFromLink = false; // From/To came from the link, so keep them when the weeks arrive
    let from = null;           // range on screen, YYYY-MM-DD inclusive
    let to = null;
    let chart = null;
    let failed = false;


    // Balances tab: customer rows from db2.deliveries, plus the 2023–2025 archive for ranges before 2026.
    const ARCHIVE_SHEET_ID = "1-uKyCderO-4Zq-YRb8HEzPgbSZPJ_vdzWs2P3BqE2kw";  // 2023–2025 deliveries
    const CURRENT_START = '2026-01-01';   // first day in db2.deliveries; earlier days live in the archive
    let currentRows = null, archiveRows = [];
    let currentLoad = null, archiveLoad = null, archiveLoaded = false;
    let rowsByCustomer = new Map();   // name -> delivery rows in date order
    let revenueRows = null, revenueLoad = null, revenueColumns = null;   // `revenue` worksheet: money snapshots by date

    // `revenue` columns by header name (compared ignoring case and punctuation). Sheet headers:
    // date, cashBalance, bankBalance, debt, onlineBalance, customerDue, inhouseBalance, networth.
    // Balance (inhouseBalance) and networth are worked out when a row leaves them blank;
    // market due falls back to the customers' khata balances.
    const REVENUE_FIELDS = {
        date: ['date'],
        cash: ['cashbalance'],
        bank: ['bankbalance'],
        directDebt: ['debt'],
        online: ['onlinebalance'],
        marketDue: ['customerdue'],
        balance: ['inhousebalance'],
        networth: ['networth']
    };
    const normKey = key => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

    const $ = id => document.getElementById(id);
    const status = () => $('monthStatus');
    const isActive = () => document.body.dataset.view === 'monthly';
    const sub = () => document.body.dataset.sub;

    // ---------- Date arithmetic (days as YYYY-MM-DD, worked in UTC so no time zone shifts) ----------

    const pad = n => String(n).padStart(2, '0');
    const parseDay = day => new Date(day + 'T00:00:00Z');
    const isoDay = date => date.toISOString().slice(0, 10);
    const addDays = (day, n) => { const d = parseDay(day); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
    const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

    function shiftMonth(month, delta) {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + delta, 1));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    }
    const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
    const monthStart = month => `${month}-01`;
    const monthEnd = month => `${month}-${pad(daysIn(month))}`;

    // Move a day by whole months; the last day of a month stays the last day (31 Oct -> 30 Sep).
    function shiftDay(day, months) {
        const month = day.slice(0, 7);
        const target = shiftMonth(month, months);
        const d = Number(day.slice(8, 10));
        return `${target}-${pad(d === daysIn(month) ? daysIn(target) : Math.min(d, daysIn(target)))}`;
    }

    const monthName = (month, style = 'long') =>
        parseDay(monthStart(month)).toLocaleDateString('en-IN', { month: style, year: 'numeric', timeZone: 'UTC' });
    const dayLabel = (day, options = { day: 'numeric', month: 'short' }) =>
        parseDay(day).toLocaleDateString('en-IN', { ...options, timeZone: 'UTC' });
    const rangeLabel = (a, b) => `${dayLabel(a)} – ${dayLabel(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const weekFirst = week => weekSpan.get(week)?.first ?? week;
    const weekLast = week => weekSpan.get(week)?.last ?? addDays(week, 6);
    const weekLabel = week => rangeLabel(weekFirst(week), weekLast(week));

    const periods = () => mode === 'week' ? weeks : months;
    const periodStart = period => mode === 'week' ? weekFirst(period) : monthStart(period);
    const periodEnd = period => mode === 'week' ? weekLast(period) : monthEnd(period);
    // Days inside the week or month on screen (others are shaded as outside it).
    const inPeriod = day => mode === 'week' ? day >= weekFirst(current) && day <= weekLast(current) : day.slice(0, 7) === current;
    // The week a day falls in, else the latest week.
    const weekFor = day => weeks.filter(w => w <= day && weekLast(w) >= day).pop()
        || (weeks.length ? (day < weeks[0] ? weeks[0] : weeks[weeks.length - 1]) : null);

    // Weeks from the revenue entry dates: (one entry, the next entry], plus the days with figures after the last entry.
    function buildWeeks() {
        weekSpan = new Map();
        const ends = [...new Set((revenueRows || []).map(row => row.day))];
        ends.slice(1).forEach((end, i) => weekSpan.set(addDays(ends[i], 1), { first: addDays(ends[i], 1), last: end }));
        const lastEnd = ends[ends.length - 1];
        const lastDay = allRows.length ? allRows[allRows.length - 1]._day : null;
        if (lastEnd && lastDay && lastDay > lastEnd) weekSpan.set(addDays(lastEnd, 1), { first: addDays(lastEnd, 1), last: lastDay, open: true });
        weeks = [...weekSpan.keys()];
    }
    const isWholePeriod = () => from === periodStart(current) && to === periodEnd(current);

    const rowsIn = (a, b) => allRows.filter(row => row._day >= a && row._day <= b);

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
            sold: sum('sold_amount'),
            paid: sum('paid_amount'),
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

    function changeLine(label, title, now, before, goodWhenUp) {
        const span = document.createElement('span');
        span.className = 'kpi-change';
        span.title = title;
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

    function renderKpis(now, prev, lastYear, compare) {
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
            { label: 'Due at close', key: 'dueEnd', format: value => value === null ? '–' : inr(value), good: false, accent: 'accent-red',
              hint: `Customer dues after the last day in the range (${dayLabel(now.lastDay)})`,
              extra: now.dueStart === null ? '' : `${now.dueChange >= 0 ? 'Up' : 'Down'} ${inr(Math.abs(now.dueChange))} in the range` }
        ];
        $('monthKpis').replaceChildren(...kpis.map(kpi => {
            const card = document.createElement('div');
            card.className = `kpi-card ${kpi.accent}`;
            if (kpi.hint) card.title = kpi.hint;
            const label = Object.assign(document.createElement('div'), { className: 'kpi-label', textContent: kpi.label });
            const value = Object.assign(document.createElement('div'), { className: 'kpi-value', textContent: kpi.format(now[kpi.key]) });
            const changes = document.createElement('div');
            changes.className = 'kpi-changes';
            if (kpi.extra) changes.append(Object.assign(document.createElement('span'), { className: 'kpi-change', textContent: kpi.extra }));
            changes.append(
                changeLine(compare.prev.label, compare.prev.title, now[kpi.key], prev?.[kpi.key] ?? null, kpi.good),
                changeLine(compare.year.label, compare.year.title, now[kpi.key], lastYear?.[kpi.key] ?? null, kpi.good));
            card.append(label, value, changes);
            return card;
        }));
    }

    function renderChart(rows, lastYearRows, lastYearFrom, compare) {
        destroyChartInstance();
        const canvas = $('monthDailyChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const length = daysBetween(from, to) + 1;
        const days = Array.from({ length }, (_, i) => addDays(from, i));
        // "1", "2", … for the month itself ("Mon 27" for a week); days outside it carry their month ("1 Nov").
        const labels = days.map(day => !inPeriod(day) ? dayLabel(day)
            : mode === 'week' ? dayLabel(day, { weekday: 'short', day: 'numeric' }) : String(Number(day.slice(8, 10))));
        const perDay = (list, start, key) => {
            const values = Array(length).fill(null);
            (list || []).forEach(row => {
                const i = daysBetween(start, row._day);
                if (i >= 0 && i < length) values[i] = (values[i] ?? 0) + num(row[key]);
            });
            return values;
        };
        const theme = chartTheme();
        const base = getChartConfig();

        chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: 'Profit', data: perDay(rows, from, 'profit'), backgroundColor: '#2563eb', borderRadius: 3, yAxisID: 'y', order: 2 },
                    { type: 'line', label: `Profit, ${compare.year.short}`, data: perDay(lastYearRows, lastYearFrom, 'profit'), borderColor: theme.dark ? '#9ca3af' : '#6b7280',
                      borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, spanGaps: true, tension: 0.3, yAxisID: 'y', order: 1 },
                    { type: 'line', label: 'KG loaded', data: perDay(rows, from, 'kg'), borderColor: '#f59e0b', backgroundColor: '#f59e0b',
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
                            title: items => items.length ? dayLabel(days[items[0].dataIndex], { weekday: 'short', day: 'numeric', month: 'short' }) : '',
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

    function renderExpenses(now, prev, compare) {
        const parts = [
            ['Car', 'car'], ['Labour', 'labour'], ['Extra', 'extra'], ['Police', 'police'],
            ['Other', 'other'], ['Transport', 'transport']
        ].filter(([, key]) => now.expenseParts[key] || prev?.expenseParts[key]);
        const body = $('monthExpenses').tBodies[0];
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
        $('monthExpensesNow').textContent = mode === 'week' ? 'This week' : 'This month';
        const head = $('monthExpensesPrev');
        head.textContent = compare.prev.short;
        head.title = compare.prev.title;
    }

    function renderDays(rows) {
        const body = $('monthDays').tBodies[0];
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
            if (!inPeriod(day)) tr.className = 'outside-month';
            const dateCell = tr.insertCell();
            const link = document.createElement('a');
            link.href = `../daily/?date=${day}`;
            link.textContent = dayLabel(day, { weekday: 'short', day: 'numeric', month: 'short' });
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

    // ---------- From / To calendars ----------
    // Month mode: every date can be picked. Week mode: only days that have figures or a revenue entry
    // (marked), plus the dates already in From/To; flatpickr (pinned on jsDelivr) greys out the rest.
    // If the CDN fails, Week mode's plain date inputs are limited to the first and last day with figures.

    let recordDays = new Set();
    const pickers = {};
    const localDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    // In Week mode, days with a `revenue` entry (the week boundaries) are marked in the calendars (and can be picked).
    const isRevenueDay = day => mode === 'week' && !!revenueRows && revenueRows.some(row => row.day === day);
    const redrawPickers = () => { if (allRows.length) setupPickers(); };   // also resets the fallback inputs' limits
    const showDay = (id, day) => pickers[id] ? pickers[id].setDate(day, false) : ($(id).value = day);

    function setRange(id, day) {
        if (!DAY_RE.test(day) || day === (id === 'rangeFrom' ? from : to)) return;
        if (id === 'rangeFrom') from = day; else to = day;
        render();
    }

    function setupPickers() {
        const days = allRows.map(row => row._day);
        recordDays = new Set(days);
        ['rangeFrom', 'rangeTo'].forEach(id => {
            if (typeof flatpickr === 'undefined') {
                const week = mode === 'week';
                $(id).min = week ? days[0] : '';
                $(id).max = week ? days[days.length - 1] : '';
                return;
            }
            if (pickers[id]) { pickers[id].redraw(); return; }
            pickers[id] = flatpickr($(id), {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'j M Y',
                altInputClass: 'input range-picker',
                disableMobile: true,   // the phone's own date picker cannot grey out days
                enable: [date => { const day = localDay(date); return mode === 'month' || recordDays.has(day) || isRevenueDay(day) || day === from || day === to; }],
                onChange: (dates, value) => setRange(id, value),
                onDayCreate: (dates, value, picker, dayElem) => {
                    if (!isRevenueDay(localDay(dayElem.dateObj))) return;
                    dayElem.classList.add('revenue-day');
                    dayElem.title = 'Revenue entry';
                }
            });
        });
    }

    function syncControls() {
        const week = mode === 'week';
        const unit = week ? 'week' : 'month';
        $('periodMode').value = mode;
        $('monthField').hidden = week;
        $('weekField').hidden = !week;
        if (week) {
            // Weeks, newest first.
            const list = weeks;
            const select = $('weekInput');
            if (select.options.length !== list.length || select.dataset.list !== list.join()) {
                select.replaceChildren(...[...list].reverse().map(w => new Option(weekLabel(w) + (weekSpan.get(w).open ? ' (open)' : ''), w)));
                select.dataset.list = list.join();
            }
            select.value = current;
        } else {
            $('monthInput').value = current;
        }
        showDay('rangeFrom', from);
        showDay('rangeTo', to);
        $('rangeToLabel').textContent = `To (${unit} closed on)`;
        $('prevMonth').title = week ? 'Previous week (revenue entries)' : 'Previous month with data';
        $('nextMonth').title = week ? 'Next week (revenue entries)' : 'Next month with data';
        $('prevMonth').disabled = !periods().some(p => p < current);
        $('nextMonth').disabled = !periods().some(p => p > current);
        $('resetRange').textContent = week ? 'Whole week' : 'Whole month';
        $('resetRange').title = week ? 'Back to the day after one revenue entry up to the next' : 'Back to the 1st and last day of the month';
        $('resetRange').disabled = isWholePeriod();
    }

    // Week mode needs the revenue sheet; load it, then put the week asked for (a day) on screen.
    function loadWeeks() {
        $('monthReport').hidden = true;
        destroyChartInstance();
        Mb.setStatus(status(), 'info', 'Loading revenue entry dates…');
        loadRevenue().then(() => {
            buildWeeks();
            if (mode !== 'week') return;
            if (!weeks.length) {
                Mb.setStatus(status(), 'empty', 'The revenue sheet needs at least two dated entries to make weeks.');
                return;
            }
            current = weekFor(current || to || Mb.todayIST());
            if (!rangeFromLink) { from = periodStart(current); to = periodEnd(current); }
            rangeFromLink = false;
            if (isActive()) render();
        }, error => {
            console.error('Error fetching revenue:', error);
            Mb.setStatus(status(), 'error', 'Could not load the revenue sheet for weeks. Pick Week again to retry.');
        });
    }

    function render() {
        if (!months.length || !current) return;
        if (mode === 'week' && !weekSpan.has(current)) { loadWeeks(); return; }
        syncControls();
        syncUrl();

        const report = $('monthReport');
        $('monthTitle').textContent = mode === 'week' ? `Week: ${weekLabel(current)}` : monthName(current);
        if (from > to) {
            destroyChartInstance();
            report.hidden = true;
            Mb.setStatus(status(), 'error', '"From" is after "To". Pick the dates again.');
            return;
        }
        const rows = rowsIn(from, to);
        if (!rows.length) {
            destroyChartInstance();
            report.hidden = true;
            Mb.setStatus(status(), 'empty', `Nothing recorded from ${rangeLabel(from, to)}.`);
            return;
        }
        Mb.setStatus(status(), null);
        report.hidden = false;

        // Compare with the same range one month and one year back (1 Oct – 2 Nov vs 1 Sep – 2 Oct and 1 Oct – 2 Nov last year).
        // A week compares with the week before it (or, with moved dates, as many days just before From)
        // and the same dates a year back.
        const week = mode === 'week';
        const whole = isWholePeriod();
        let prevFrom = shiftDay(from, -1), prevTo = shiftDay(to, -1);
        if (week) {
            const before = weeks.filter(w => w < current).pop();
            if (whole && before) { prevFrom = periodStart(before); prevTo = periodEnd(before); }
            else { prevTo = addDays(from, -1); prevFrom = addDays(prevTo, -daysBetween(from, to)); }
        }
        const yearFrom = shiftDay(from, -12), yearTo = shiftDay(to, -12);
        const compare = week ? {
            prev: { short: 'previous week', title: rangeLabel(prevFrom, prevTo) },
            year: { short: 'last year', title: rangeLabel(yearFrom, yearTo) }
        } : {
            prev: { short: monthName(shiftMonth(current, -1), 'short'), title: rangeLabel(prevFrom, prevTo) },
            year: { short: monthName(shiftMonth(current, -12), 'short'), title: rangeLabel(yearFrom, yearTo) }
        };
        compare.prev.label = 'vs ' + compare.prev.short;
        compare.year.label = 'vs ' + compare.year.short;

        const now = summarize(rows);
        const prev = summarize(rowsIn(prevFrom, prevTo));
        const lastYearRows = rowsIn(yearFrom, yearTo);
        const lastYear = summarize(lastYearRows);

        const notes = [];
        if (!whole) notes.push(week
            ? `Closed over ${rangeLabel(from, to)}; compared with ${compare.prev.title} and the same dates a year back.`
            : `Closed over ${rangeLabel(from, to)}; comparisons use the same dates in ${compare.prev.short} and ${compare.year.short}.`);
        else if (week) notes.push(`Compared with ${compare.prev.title} and ${compare.year.title}.`);
        if (to >= Mb.todayIST()) notes.push(`In progress: figures up to ${dayLabel(now.lastDay)}, so comparisons with full periods run low.`);
        else notes.push(`${now.days} trading days, ${Mb.formatNumber(now.km, 0)} km driven.`);
        $('monthNote').textContent = notes.join(' ');


        renderKpis(now, prev, lastYear, compare);
        renderExpenses(now, prev, compare);
        renderDays(rows);
        renderChart(rows, lastYearRows, yearFrom, compare);
        if (sub() === 'balances') renderBalances();
    }

    // ---------- Balances tab ----------

    async function fetchDeliveries(spreadsheetId, worksheet) {
        const data = await callSheetsApi([{ type: "SELECT", spreadsheetId, worksheet, id: "mbros-github-site" }]);
        return data[0].rows.filter(row => row.name);
    }

    function buildCustomers() {
        rowsByCustomer = new Map();
        [...archiveRows, ...(currentRows || [])].forEach((row, index) => {
            row._day = dayOf(row.timestamp);
            row._index = index;
            if (!rowsByCustomer.has(row.name)) rowsByCustomer.set(row.name, []);
            rowsByCustomer.get(row.name).push(row);
        });
        rowsByCustomer.forEach(rows => rows.sort((a, b) => a._day.localeCompare(b._day) || a._index - b._index));
    }

    function parseRevenue(rows) {
        const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
        revenueColumns = { found: keys };
        Object.entries(REVENUE_FIELDS).forEach(([field, names]) => {
            revenueColumns[field] = keys.find(key => names.includes(normKey(key))) || null;
        });
        const col = revenueColumns;
        if (!col.date) return [];
        return rows.map(row => {
            if (!has(row[col.date])) return null;
            const day = dayOf(row[col.date]);
            if (!DAY_RE.test(day)) return null;
            const value = field => col[field] && has(row[col[field]]) ? num(String(row[col[field]]).replace(/,/g, '')) : null;
            const snapshot = { day, cash: value('cash'), bank: value('bank'), directDebt: value('directDebt'),
                online: value('online'), marketDue: value('marketDue'), balance: value('balance'), networth: value('networth') };
            return ['cash', 'bank', 'directDebt', 'online'].some(field => snapshot[field] !== null) ? snapshot : null;
        }).filter(Boolean).sort((a, b) => a.day.localeCompare(b.day));
    }

    function loadRevenue() {
        revenueLoad ??= callSheetsApi([{ type: "SELECT", spreadsheetId: MAIN_SHEET_ID, worksheet: "revenue", id: "mbros-github-site" }])
            .then(data => { revenueRows = parseRevenue(data[0].rows); redrawPickers(); })
            .catch(error => { revenueLoad = null; throw error; });
        return revenueLoad;
    }

    // Load what the range needs: `revenue` and db2.deliveries always, the archive only for dates before 2026.
    function loadDeliveries(needArchive) {
        currentLoad ??= fetchDeliveries(MAIN_SHEET_ID, "db2.deliveries").then(rows => { currentRows = rows; buildCustomers(); })
            .catch(error => { currentLoad = null; throw error; });
        const loads = [currentLoad, loadRevenue()];
        if (needArchive) {
            archiveLoad ??= fetchDeliveries(ARCHIVE_SHEET_ID, "deliveries.2023").then(rows => {
                archiveRows = rows;
                archiveLoaded = true;
                buildCustomers();
            }).catch(error => { archiveLoad = null; throw error; });
            loads.push(archiveLoad);
        }
        return Promise.all(loads);
    }

    // Per customer over [a, b]: opening = last khata balance before a (else the first row's prevAmount),
    // closing = last khata balance on or before b. "Other" is the part of the change the rows' sales,
    // collections and discounts don't explain (adjustments, payments not entered). Same rule as the
    // Customer Statement in app/statements/.
    function customerBalances(a, b) {
        const customers = [];
        let openingAll = 0, closingAll = 0;
        rowsByCustomer.forEach((rows, name) => {
            if (rows[0]._day > b) return;
            let opening = num(rows[0].prevAmount);
            let closing = opening;
            const inRange = [];
            for (const row of rows) {
                if (row._day < a) { opening = num(row.khataBalance); closing = opening; }
                else if (row._day <= b) { inRange.push(row); closing = num(row.khataBalance); }
                else break;
            }
            openingAll += opening;
            closingAll += closing;
            if (!inRange.length) return;
            const sum = key => inRange.reduce((total, row) => total + num(row[key]), 0);
            const sales = sum('deliverAmount'), cash = sum('paidCash'), online = sum('paidOnline'), discount = sum('discount');
            const change = closing - opening;
            customers.push({ name, opening, closing, change, sales, cash, online, collected: cash + online, discount,
                kg: sum('deliveredKg'), other: change - (sales - cash - online - discount) });
        });
        return { customers, openingAll, closingAll };
    }

    // Market due on a day: every customer's last khata balance on or before it.
    function customerDuesOn(day) {
        let total = 0;
        rowsByCustomer.forEach(rows => {
            let balance = null;
            for (const row of rows) {
                if (row._day > day) break;
                balance = num(row.khataBalance);
            }
            if (balance !== null) total += balance;
        });
        return total;
    }

    // Snapshots for the range: start = last one before From (the previous close), else the first in the range;
    // end = last one on or before To.
    function revenueSnapshots() {
        if (!revenueRows || !revenueRows.length) return null;
        const before = revenueRows.filter(row => row.day < from);
        const upTo = revenueRows.filter(row => row.day <= to);
        const start = before.length ? before[before.length - 1] : upTo.find(row => row.day >= from);
        const end = upTo[upTo.length - 1];
        return start && end ? { start, end } : null;
    }

    function renderRevenue(snapshots) {
        const table = $('balRevenue');
        const head = table.tHead.rows[0];
        const body = table.tBodies[0];
        body.replaceChildren();
        const note = $('balRevenueNote');
        if (!revenueColumns?.date) {
            head.replaceChildren();
            note.textContent = `The revenue sheet has no Date column (columns found: ${revenueColumns?.found.join(', ') || 'none'}).`;
            return;
        }
        if (!snapshots) {
            head.replaceChildren();
            note.textContent = `The revenue sheet has no entry on or before ${dayLabel(to, { day: 'numeric', month: 'short', year: 'numeric' })}.`;
            return;
        }
        const missing = ['cash', 'bank', 'directDebt', 'online'].filter(field => !revenueColumns[field]);
        const { start, end } = snapshots;
        const columns = [start, end].map(snap => {
            const balance = snap.balance !== null ? snap.balance : num(snap.cash) + num(snap.bank) + num(snap.directDebt) + num(snap.online);
            const marketDue = snap.marketDue !== null ? snap.marketDue : customerDuesOn(snap.day);
            return { ...snap, balance, marketDue, networth: snap.networth !== null ? snap.networth : balance + marketDue };
        });

        head.replaceChildren();
        ['Date', ...columns.map(c => dayLabel(c.day, { day: 'numeric', month: 'short', year: 'numeric' })), 'Difference'].forEach((text, i) => {
            const th = document.createElement('th');
            th.textContent = text;
            if (i) th.className = 'num';
            head.append(th);
        });
        const fmt = value => value === null ? '–' : Mb.formatNumber(value, 0);
        const diff = key => {
            const value = columns[1][key] - columns[0][key];
            return (value > 0 ? '+' : value < 0 ? '−' : '') + Mb.formatNumber(Math.abs(value), 0);
        };
        // Difference colours: green is good. Market Due going down is good, so it is the other way round.
        const addRow = (label, key, withDiff, className, goodWhenUp = true) => {
            const tr = body.insertRow();
            if (className) tr.className = className;
            tr.insertCell().textContent = label;
            columns.forEach(c => Object.assign(tr.insertCell(), { className: 'num', textContent: fmt(c[key]) }));
            const td = Object.assign(tr.insertCell(), { className: 'num', textContent: withDiff ? diff(key) : '' });
            const delta = withDiff ? columns[columns.length - 1][key] - columns[0][key] : 0;
            if (delta) td.classList.add((delta > 0) === goodWhenUp ? 'gain' : 'loss');
            if (key === 'balance' && delta > 0) td.classList.add('rise');   // Balance going up stands out
        };
        addRow('Cash', 'cash');
        addRow('Bank', 'bank');
        addRow('Direct Debt', 'directDebt');
        addRow('Online', 'online');
        addRow('Balance', 'balance', true, 'total-row');
        const gap = body.insertRow();
        gap.className = 'gap-row';
        Object.assign(gap.insertCell(), { colSpan: 4 });
        addRow('Market Due', 'marketDue', true, '', false);
        addRow('Networth', 'networth', true, 'total-row');

        const notes = [];
        if (start.day >= from) notes.push(`No revenue entry before ${dayLabel(from)}, so the first one in the range is used.`);
        if (start.day === end.day) notes.push('Only one revenue entry covers this range.');
        if (missing.length) notes.push(`Not in the revenue sheet, counted as 0: ${missing.map(f => ({ cash: 'Cash', bank: 'Bank', directDebt: 'Direct Debt', online: 'Online' })[f]).join(', ')} (columns found: ${revenueColumns.found.join(', ')}).`);
        if ([start, end].some(snap => snap.marketDue === null))
            notes.push('Market Due is blank in the revenue sheet, so it is the total of customer khata balances on that date.');
        note.textContent = notes.join(' ');
    }

    function renderBalances() {
        if (!current || from > to) return;
        const balStatus = $('balStatus');
        const balReport = $('balReport');
        // The archive is needed for customer rows before 2026, including market due on a start snapshot before 2026.
        const snapshotsNow = revenueRows ? revenueSnapshots() : null;
        const needArchive = from < CURRENT_START
            || (snapshotsNow && snapshotsNow.start.marketDue === null && snapshotsNow.start.day < CURRENT_START);
        if (!currentRows || !revenueRows || (needArchive && !archiveLoaded)) {
            balReport.hidden = true;
            Mb.setStatus(balStatus, 'info', needArchive ? 'Loading customer deliveries, including 2023–2025…' : 'Loading customer deliveries…');
            const range = `${from}|${to}`;
            loadDeliveries(needArchive).then(() => {
                if (isActive() && sub() === 'balances' && `${from}|${to}` === range) renderBalances();
            }, error => {
                console.error('Error fetching deliveries:', error);
                Mb.setStatus(balStatus, 'error', 'Could not load customer deliveries. Open the tab again to retry.');
            });
            return;
        }
        Mb.setStatus(balStatus, null);
        balReport.hidden = false;

        renderRevenue(revenueSnapshots());
        const { customers } = customerBalances(from, to);

        // Customers: biggest increase first; decreases only when the switch is on.
        const showDecreased = $('showDecreased').checked;
        const up = customers.filter(c => c.change > 0.5);
        const down = customers.filter(c => c.change < -0.5);
        const shown = (showDecreased ? customers : up).sort((x, y) => y.change - x.change || x.name.localeCompare(y.name));
        $('balCustomersTitle').textContent = showDecreased ? `Customer balances (${shown.length})` : `Customer balances: increased (${shown.length})`;

        const body = $('balCustomers').tBodies[0];
        body.replaceChildren();
        const cells = (tr, values) => values.forEach((value, i) => {
            const td = tr.insertCell();
            td.textContent = value;
            if (i) td.className = 'num';
        });
        if (!shown.length) {
            const td = body.insertRow().insertCell();
            td.colSpan = 8;
            td.className = 'empty-state';
            td.textContent = showDecreased ? 'No customer activity in this range.' : 'No customer balance went up in this range.';
        }
        const fmt = value => Mb.formatNumber(value, 0);
        shown.forEach(c => {
            const tr = body.insertRow();
            cells(tr, [c.name, fmt(c.opening), fmt(c.sales), fmt(c.collected), fmt(c.discount), fmt(c.other), fmt(c.closing),
                (c.change > 0 ? '+' : c.change < 0 ? '−' : '') + fmt(Math.abs(c.change))]);
            if (c.change > 0.5) tr.cells[7].classList.add('up');
            if (c.change < -0.5) tr.cells[7].classList.add('down');
        });
        if (shown.length) {
            const sumShown = key => shown.reduce((s, c) => s + c[key], 0);
            const tr = body.insertRow();
            tr.className = 'total-row';
            const change = sumShown('change');
            cells(tr, ['Total', fmt(sumShown('opening')), fmt(sumShown('sales')), fmt(sumShown('collected')), fmt(sumShown('discount')),
                fmt(sumShown('other')), fmt(sumShown('closing')), (change > 0 ? '+' : change < 0 ? '−' : '') + fmt(Math.abs(change))]);
        }
        const unchanged = customers.length - up.length - down.length;
        $('balSummary').textContent = `${up.length} customers up by ${inr(up.reduce((s, c) => s + c.change, 0))}, `
            + `${down.length} down by ${inr(-down.reduce((s, c) => s + c.change, 0))}`
            + (unchanged ? `, ${unchanged} unchanged` : '') + ' (customers with entries in the range).';
    }

    function setSub(view) {
        document.body.dataset.sub = view;
        document.querySelectorAll('.sub-switch button').forEach(button =>
            button.setAttribute('aria-selected', String(button.dataset.sub === view)));
        syncUrl();
        if (view === 'balances') renderBalances();
    }

    function selectPeriod(period) {
        rangeFromLink = false;
        current = period;
        from = periodStart(period);
        to = periodEnd(period);
        render();
    }

    // Month -> week: the week holding the month's To date. Week -> month: the month of the week's From.
    function setMode(next) {
        if (next === mode || !current) return;
        mode = next;
        rangeFromLink = false;
        redrawPickers();
        if (next === 'week') {
            current = weeks.length ? weekFor(to) : to;   // a day to look for until the weeks have loaded
        } else {
            const month = from.slice(0, 7);
            current = months.includes(month) ? month : (months.filter(m => m <= month).pop() || months[months.length - 1]);
        }
        if (mode === 'month' || weekSpan.has(current)) selectPeriod(current);
        else render();
    }

    function syncUrl() {
        const params = new URLSearchParams(location.search);
        ['view', 'sub', 'month', 'week', 'from', 'to'].forEach(key => params.delete(key));
        if (isActive()) {
            params.set('view', 'monthly');
            if (sub() === 'balances') params.set('sub', 'balances');
            const ready = current && (mode === 'month' || weekSpan.has(current));
            if (ready) params.set(mode, current);
            if (ready && !isWholePeriod()) {
                params.set('from', from);
                params.set('to', to);
            }
        }
        const query = params.toString();
        history.replaceState(null, '', query ? `?${query}` : location.pathname);
    }

    function step(direction) {
        const target = direction < 0 ? periods().filter(p => p < current).pop() : periods().find(p => p > current);
        if (target) selectPeriod(target);
    }

    // ---------- Public ----------

    function setRows(rows) {
        allRows = [];
        rows.forEach(row => {
            if (!row.date) return;
            const day = dayOf(row.date);
            if (!DAY_RE.test(day)) return;
            row._day = day;
            allRows.push(row);
        });
        allRows.sort((a, b) => a._day.localeCompare(b._day));
        months = [...new Set(allRows.map(row => row._day.slice(0, 7)))];
        if (revenueRows) buildWeeks();
        if (!months.length) {
            Mb.setStatus(status(), 'empty', 'No daily figures found.');
            return;
        }
        ['periodMode', 'monthInput', 'weekInput', 'latestMonth', 'rangeFrom', 'rangeTo'].forEach(id => $(id).disabled = false);
        $('monthInput').min = months[0];
        $('monthInput').max = months[months.length - 1];
        setupPickers();

        const params = new URLSearchParams(location.search);
        const month = params.get('month'), week = params.get('week');
        if (DAY_RE.test(week || '')) {
            mode = 'week';
            current = week;   // a day to look for until the weeks have loaded
        } else {
            mode = 'month';
            current = MONTH_RE.test(month || '') ? month : months[months.length - 1];
        }
        const requestedFrom = params.get('from'), requestedTo = params.get('to');
        rangeFromLink = DAY_RE.test(requestedFrom || '') && DAY_RE.test(requestedTo || '');
        from = rangeFromLink ? requestedFrom : periodStart(current);
        to = rangeFromLink ? requestedTo : periodEnd(current);
        if (isActive()) render();
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
        render();
    }

    function setView(view) {
        document.body.dataset.view = view;
        document.querySelectorAll('.main-switch button').forEach(button =>
            button.setAttribute('aria-selected', String(button.dataset.view === view)));
        if (view === 'monthly') show();
        else syncUrl();
    }

    document.querySelectorAll('.main-switch button').forEach(button =>
        button.addEventListener('click', () => setView(button.dataset.view)));
    document.querySelectorAll('.sub-switch button').forEach(button =>
        button.addEventListener('click', () => setSub(button.dataset.sub)));
    $('showDecreased').addEventListener('change', renderBalances);
    $('periodMode').addEventListener('change', event => setMode(event.target.value));
    $('monthInput').addEventListener('change', event => {
        if (MONTH_RE.test(event.target.value)) selectPeriod(event.target.value);
    });
    $('weekInput').addEventListener('change', event => {
        if (DAY_RE.test(event.target.value)) selectPeriod(event.target.value);
    });
    // Plain date inputs when flatpickr did not load (setRange ignores the repeat when it did).
    $('rangeFrom').addEventListener('change', event => setRange('rangeFrom', event.target.value));
    $('rangeTo').addEventListener('change', event => setRange('rangeTo', event.target.value));
    $('resetRange').addEventListener('click', () => selectPeriod(current));
    $('prevMonth').addEventListener('click', () => step(-1));
    $('nextMonth').addEventListener('click', () => step(1));
    $('latestMonth').addEventListener('click', () => selectPeriod(periods()[periods().length - 1]));
    document.addEventListener('mb:themechange', () => { if (isActive() && current) render(); });

    const startParams = new URLSearchParams(location.search);
    if (startParams.get('sub') === 'balances') {
        document.body.dataset.sub = 'balances';
        document.querySelectorAll('.sub-switch button').forEach(button =>
            button.setAttribute('aria-selected', String(button.dataset.sub === 'balances')));
    }
    if (startParams.get('view') === 'monthly') setView('monthly');

    return { setRows, fail };
})();

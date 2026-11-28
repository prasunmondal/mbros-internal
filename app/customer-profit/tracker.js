// Balance Tracker tab of app/customer-profit/: a customer's (or every customer's) balance day by day,
// with a draggable range and stats for the chosen range.
//
// Balance = dues = totalBalance (see .claude/context/product.md). One customer: the totalBalance of their
// last delivery row each day, carried forward to today. All customers: the new_due_balance of
// cumilativeCalculations (already corrected to totalBalance by useTotalBalanceDues). Delivery rows are the
// 2023–2025 archive (deliveries.2023) followed by db2.deliveries (from 2026); billed / received / discount
// come from them too, and the archive has gaps (rows without payment amounts, mostly 2023).
//
// The page calls BalanceTracker.init({ onRangeCommit }) once and BalanceTracker.setData() when rows arrive.
(function () {
    const DAY_MS = 86400000;
    const MIN_SPAN = 1;  // the range always covers at least 2 days
    const PRESETS = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365 };

    const number = value => Number(String(value ?? "").replace(/,/g, "")) || 0;
    const isDue = value => value !== "" && value !== null && value !== undefined && value !== "#N/A";
    // totalBalance; an archive row without one falls back to khataBalance. db2.deliveries rows never do, so a
    // missing totalBalance there shows (and assets/js/config.js reports the missing column) instead of hiding.
    let archiveSet = new WeakSet();   // archive rows, which may lack totalBalance
    const rowBalance = row => archiveSet.has(row) && !isDue(row.totalBalance) ? number(row.khataBalance) : number(row.totalBalance);
    // Newer rows hold YYYY-MM-DD; older ones a UTC timestamp of IST midnight.
    const dayOf = value => (typeof value === "string" && value.length === 10) ? value : Mb.toISTDate(value);
    const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const $ = id => document.getElementById(id);

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formatDay = (day, withYear = true) => {
        const [y, m, d] = day.split("-");
        return `${Number(d)} ${MONTHS[Number(m) - 1]}` + (withYear ? ` ${y}` : "");
    };
    // ₹1.2Cr / ₹4.5L / ₹12k, for axis ticks only.
    const formatCompact = value => {
        const abs = Math.abs(value), sign = value < 0 ? "−" : "";
        if (abs >= 1e7) return `${sign}₹${+(abs / 1e7).toFixed(1)}Cr`;
        if (abs >= 1e5) return `${sign}₹${+(abs / 1e5).toFixed(1)}L`;
        if (abs >= 1e3) return `${sign}₹${+(abs / 1e3).toFixed(0)}k`;
        return `${sign}₹${Math.round(abs)}`;
    };

    // Validated with the dataviz palette checker (CVD and contrast) against the light and black themes.
    const PALETTE = {
        // The balance line is red where it rises (more owed to us: losing) and green where it falls (being paid).
        light: { rise: "#dc2626", fall: "#15803d", ma7: "#8b5cf6", ma30: "#d97706", billed: "#2563eb", received: "#db2777" },
        dark: { rise: "#f43f5e", fall: "#15803d", ma7: "#9a7cf0", ma30: "#d48a0a", billed: "#4a8ef0", received: "#e9559a" }
    };
    const themeColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const palette = () => PALETTE[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
    const withAlpha = (hex, alpha) => hex + Math.round(alpha * 255).toString(16).padStart(2, "0");

    // Colour per day: rising or falling against the day before; a flat day keeps the last move's colour, so a
    // stretch with no entries stays the colour of how it got there. Chart.js colours a segment by its end point.
    function directionColors(values, opening, c, alpha = 1) {
        let last = c.rise;
        return values.map((v, i) => {
            const prev = i ? values[i - 1] : opening;
            if (v > prev) last = c.rise;
            else if (v < prev) last = c.fall;
            return alpha === 1 ? last : withAlpha(last, alpha);
        });
    }
    const bySegment = (line, fill) => ({ borderColor: ctx => line[ctx.p1DataIndex], backgroundColor: ctx => fill[ctx.p1DataIndex] });

    let options = { onRangeCommit: () => {} };
    let deliveries = [], dayRows = [], customer = "";
    let series = null;          // { days: [{ day, balance, billed, received, discount, orders, moved }], opening, flowsFrom }
    let start = 0, end = 0;     // the selected range, as indices into series.days (inclusive)
    let charts = { main: null, flow: null, nav: null };
    let visible = false, dirty = true;

    // ---------- data ----------

    function buildSeries(name) {
        const rows = deliveries.filter(r => r.timestamp && r.name && (name === "ALL" || r.name === name))
            .map((row, index) => ({ row, index, day: dayOf(row.timestamp) }))
            .sort((a, b) => a.day.localeCompare(b.day) || a.index - b.index);

        const flows = new Map();
        rows.forEach(({ row, day }) => {
            const flow = flows.get(day) || { billed: 0, received: 0, discount: 0, orders: 0 };
            flow.billed += number(row.deliverAmount);
            flow.received += number(row.paidCash) + number(row.paidOnline);
            flow.discount += number(row.discount);
            if (number(row.deliveredKg) > 0) flow.orders++;
            flows.set(day, flow);
        });

        const closes = new Map();
        let opening = null;
        if (name === "ALL") {
            dayRows.filter(p => p.date && isDue(p.new_due_balance))
                .map(p => ({ p, day: dayOf(p.date) }))
                .sort((a, b) => a.day.localeCompare(b.day))
                .forEach(({ p, day }) => {
                    if (opening === null && isDue(p.prev_due_balance)) opening = number(p.prev_due_balance);
                    closes.set(day, number(p.new_due_balance));
                });
        } else {
            rows.forEach(({ row, day }) => {
                if (opening === null) opening = number(row.prevAmount) + rowBalance(row) - number(row.khataBalance);
                closes.set(day, rowBalance(row));
            });
        }
        const keys = [...closes.keys()].sort();
        if (!keys.length) return null;

        const first = keys[0];
        const last = [keys[keys.length - 1], Mb.todayIST()].sort()[1];
        const days = [];
        let balance = opening ?? closes.get(first);
        for (let day = first; day <= last; day = addDays(day, 1)) {
            if (closes.has(day)) balance = closes.get(day);
            const flow = flows.get(day);
            days.push({
                day, balance,
                billed: flow?.billed || 0, received: flow?.received || 0,
                discount: flow?.discount || 0, orders: flow?.orders || 0,
                moved: closes.has(day)
            });
        }
        return { days, opening: opening ?? days[0].balance, flowsFrom: rows.length ? rows[0].day : null };
    }

    function movingAverage(values, window) {
        const out = new Array(values.length).fill(null);
        let sum = 0;
        values.forEach((v, i) => {
            sum += v;
            if (i >= window) sum -= values[i - window];
            if (i >= window - 1) out[i] = sum / window;
        });
        return out;
    }

    // Least-squares line through the range's daily balances.
    function regression(from, to) {
        const n = to - from + 1;
        let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        for (let i = from; i <= to; i++) {
            const x = i - from, y = series.days[i].balance;
            sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
        }
        const denom = n * sxx - sx * sx;
        if (n < 2 || denom === 0) return { slope: 0, intercept: sy / n, r2: 0 };
        const slope = (n * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / n;
        const varY = n * syy - sy * sy;
        const r2 = varY === 0 ? 1 : Math.pow(n * sxy - sx * sy, 2) / (denom * varY);
        return { slope, intercept, r2 };
    }

    function rangeStats(from, to) {
        const days = series.days;
        const opening = from > 0 ? days[from - 1].balance : series.opening;
        const closing = days[to].balance;
        const s = {
            opening, closing, change: closing - opening, n: to - from + 1,
            billed: 0, received: 0, discount: 0, orders: 0, payments: 0,
            peak: -Infinity, peakDay: null, low: Infinity, lowDay: null,
            rise: { value: 0, day: null }, fall: { value: 0, day: null },
            paydown: { value: 0, from: null, to: null }
        };
        let sum = 0, sumSq = 0, runPeak = opening, runPeakDay = from > 0 ? days[from - 1].day : days[from].day;
        const values = [];
        for (let i = from; i <= to; i++) {
            const d = days[i], b = d.balance;
            const delta = b - (i > 0 ? days[i - 1].balance : series.opening);
            if (delta > s.rise.value) s.rise = { value: delta, day: d.day };
            if (delta < s.fall.value) s.fall = { value: delta, day: d.day };
            if (b > s.peak) { s.peak = b; s.peakDay = d.day; }
            if (b < s.low) { s.low = b; s.lowDay = d.day; }
            if (b > runPeak) { runPeak = b; runPeakDay = d.day; }
            else if (runPeak - b > s.paydown.value) s.paydown = { value: runPeak - b, from: runPeakDay, to: d.day };
            sum += b; sumSq += b * b; values.push(b);
            s.billed += d.billed; s.received += d.received; s.discount += d.discount; s.orders += d.orders;
            if (d.received > 0) s.payments++;
        }
        s.average = sum / s.n;
        s.stdDev = Math.sqrt(Math.max(0, sumSq / s.n - s.average * s.average));
        values.sort((a, b) => a - b);
        s.median = s.n % 2 ? values[(s.n - 1) / 2] : (values[s.n / 2 - 1] + values[s.n / 2]) / 2;
        s.other = s.change - s.billed + s.received + s.discount;
        s.trend = regression(from, to);
        s.projection = closing + s.trend.slope * 30;
        s.collection = s.billed > 0 ? s.received / s.billed : null;
        s.dso = s.billed > 0 ? s.average / (s.billed / s.n) : null;
        // The last payment on or before the range end, even if it was before the range start.
        s.lastPayment = null;
        for (let i = to; i >= 0; i--) {
            if (days[i].received > 0) { s.lastPayment = { day: days[i].day, amount: days[i].received, ago: to - i }; break; }
        }
        s.flowsMissing = !series.flowsFrom || days[from].day < series.flowsFrom;
        return s;
    }

    // ---------- range ----------

    function indexOfDay(day, fallback) {
        if (!day) return fallback;
        const days = series.days;
        if (day <= days[0].day) return 0;
        if (day >= days[days.length - 1].day) return days.length - 1;
        return clamp(daysBetween(days[0].day, day), 0, days.length - 1);
    }

    function setRange(from, to, commit) {
        const last = series.days.length - 1;
        if (last < MIN_SPAN) { start = 0; end = last; }
        else {
            from = clamp(Math.round(from), 0, last);
            to = clamp(Math.round(to), 0, last);
            if (from > to) [from, to] = [to, from];
            if (to - from < MIN_SPAN) { if (to + MIN_SPAN <= last) to = from + MIN_SPAN; else from = to - MIN_SPAN; }
            start = from; end = to;
        }
        applyRange();
        if (commit) {
            const all = start === 0 && end === last;
            options.onRangeCommit(all ? "" : series.days[start].day, all ? "" : series.days[end].day);
        }
    }

    function applyRange() {
        ["main", "flow"].forEach(key => {
            const chart = charts[key];
            if (!chart) return;
            chart.options.scales.x.min = start;
            chart.options.scales.x.max = end;
        });
        if (charts.main) {
            updateTrendDataset();
            updateMarkers();
            charts.main.update("none");
        }
        if (charts.flow) charts.flow.update("none");
        if (charts.nav) charts.nav.draw();
        positionBrush();
        renderStats();
        markPreset();
        $("trackerRangeLabel").textContent = `${formatDay(series.days[start].day)} – ${formatDay(series.days[end].day)} · ${end - start + 1} days`;
    }

    function markPreset() {
        const last = series.days.length - 1;
        const endDay = series.days[last].day;
        let active = null;
        if (end === last) {
            if (start === 0) active = "ALL";
            else if (series.days[start].day === endDay.slice(0, 4) + "-01-01") active = "YTD";
            else Object.entries(PRESETS).forEach(([key, n]) => { if (last - start === n - 1) active = key; });
        }
        document.querySelectorAll("#trackerPresets button").forEach(b =>
            b.setAttribute("aria-pressed", String(b.dataset.preset === active)));
    }

    function applyPreset(key) {
        const last = series.days.length - 1;
        if (key === "ALL") return setRange(0, last, true);
        if (key === "YTD") return setRange(indexOfDay(series.days[last].day.slice(0, 4) + "-01-01", 0), last, true);
        setRange(last - PRESETS[key] + 1, last, true);
    }

    // ---------- charts ----------

    function baseScales(showY) {
        const ticks = themeColor("--text-subtle"), grid = themeColor("--border");
        return {
            x: {
                type: "category", min: start, max: end, offset: false,
                grid: { display: false }, border: { color: grid },
                ticks: {
                    color: ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8,
                    callback(value) {
                        const day = this.getLabelForValue(value);
                        return day ? formatDay(day, (this.max - this.min) > 300) : "";
                    }
                }
            },
            y: {
                display: showY, grid: { color: grid }, border: { display: false },
                afterFit: scale => { scale.width = showY ? 64 : 0; },  // same width on both charts, so their days line up
                ticks: { color: ticks, maxTicksLimit: 6, callback: v => formatCompact(v) }
            }
        };
    }

    // A vertical guide at the hovered day.
    const crosshair = {
        id: "crosshair",
        afterDatasetsDraw(chart) {
            const active = chart.tooltip?.getActiveElements?.();
            if (!active?.length) return;
            const x = active[0].element.x, { top, bottom } = chart.chartArea, ctx = chart.ctx;
            ctx.save();
            ctx.strokeStyle = themeColor("--border-strong");
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
            ctx.restore();
        }
    };

    function tooltipStyle() {
        return {
            backgroundColor: themeColor("--surface"), borderColor: themeColor("--border-strong"), borderWidth: 1,
            titleColor: themeColor("--text"), bodyColor: themeColor("--text-muted"), footerColor: themeColor("--text-muted"),
            padding: 10, boxPadding: 4, usePointStyle: true
        };
    }

    function buildCharts() {
        destroyCharts();
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        const days = series.days, labels = days.map(d => d.day), balances = days.map(d => d.balance);
        const c = palette();
        const lineColors = directionColors(balances, series.opening, c), fillColors = directionColors(balances, series.opening, c, 0.1);
        const show = id => $(id).checked;

        charts.main = new Chart($("balanceChart"), {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Balance", data: balances, borderColor: c.rise, backgroundColor: withAlpha(c.rise, 0.1),
                        segment: bySegment(lineColors, fillColors),
                        fill: "origin", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0, hidden: !show("optBalance"),
                        pointHoverBackgroundColor: ctx => lineColors[ctx.dataIndex], pointHoverBorderColor: themeColor("--surface"), pointHoverBorderWidth: 2
                    },
                    { label: "7-day average", data: movingAverage(balances, 7), borderColor: c.ma7, borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, hidden: !show("optMa7") },
                    { label: "30-day average", data: movingAverage(balances, 30), borderColor: c.ma30, borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, hidden: !show("optMa30") },
                    { label: "Trend", data: [], borderColor: themeColor("--text-muted"), borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, hidden: !show("optTrend") },
                    {
                        label: "Peak & low", data: [], showLine: false, hidden: !show("optMarkers"),
                        pointRadius: 5, pointHoverRadius: 6, pointStyle: "circle",
                        pointBackgroundColor: themeColor("--text"), pointBorderColor: themeColor("--surface"), pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
                interaction: { mode: "index", intersect: false },
                scales: baseScales(true),
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipStyle(),
                        filter: item => item.raw !== null && item.datasetIndex !== 4,
                        callbacks: {
                            title: items => formatDay(items[0].label),
                            label: item => ` ${item.dataset.label}: ${Mb.formatINR(item.raw)}`,
                            footer: items => {
                                const d = days[items[0].dataIndex];
                                const prev = items[0].dataIndex > 0 ? days[items[0].dataIndex - 1].balance : series.opening;
                                const lines = [`Change: ${d.balance - prev >= 0 ? "+" : ""}${Mb.formatINR(d.balance - prev)}`];
                                if (d.billed) lines.push(`Billed: ${Mb.formatINR(d.billed)}`);
                                if (d.received) lines.push(`Received: ${Mb.formatINR(d.received)}`);
                                if (d.discount) lines.push(`Discount: ${Mb.formatINR(d.discount)}`);
                                return lines;
                            }
                        }
                    }
                }
            },
            plugins: [crosshair]
        });

        charts.flow = new Chart($("flowChart"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    { label: "Billed", data: days.map(d => d.billed || null), backgroundColor: c.billed, borderRadius: 2, grouped: false },
                    // Received hangs below the axis: money in pulls the balance down.
                    { label: "Received", data: days.map(d => d.received ? -d.received : null), backgroundColor: c.received, borderRadius: 2, grouped: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: "index", intersect: false },
                datasets: { bar: { categoryPercentage: 0.9, barPercentage: 0.9, maxBarThickness: 14 } },
                scales: (() => {
                    const s = baseScales(true);
                    s.y.ticks.callback = v => formatCompact(Math.abs(v));
                    return s;
                })(),
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipStyle(),
                        filter: item => item.raw !== null,
                        callbacks: {
                            title: items => formatDay(items[0].label),
                            label: item => ` ${item.dataset.label}: ${Mb.formatINR(Math.abs(item.raw))}`
                        }
                    }
                }
            },
            plugins: [crosshair]
        });

        charts.nav = new Chart($("navChart"), {
            type: "line",
            data: { labels, datasets: [{ data: balances, borderColor: c.rise, backgroundColor: withAlpha(c.rise, 0.1),
                segment: bySegment(directionColors(balances, series.opening, c, 0.85), directionColors(balances, series.opening, c, 0.1)),
                fill: "start", borderWidth: 1.5, pointRadius: 0, tension: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false, events: [],
                layout: { padding: { left: 0, right: 0 } },
                scales: (() => {
                    const s = baseScales(false);
                    delete s.x.min; delete s.x.max;
                    s.y.beginAtZero = false;  // show the shape, not a flat line far above zero
                    s.x.ticks.maxTicksLimit = 6;
                    s.x.ticks.callback = function (value) { const day = this.getLabelForValue(value); return day ? formatDay(day, days.length > 300) : ""; };
                    return s;
                })(),
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [{ id: "brushSync", afterDraw: positionBrush }]
        });

        applyRange();
        dirty = false;
    }

    function destroyCharts() {
        Object.keys(charts).forEach(key => { charts[key]?.destroy(); charts[key] = null; });
    }

    function updateTrendDataset() {
        const data = new Array(series.days.length).fill(null);
        const { slope, intercept } = regression(start, end);
        for (let i = start; i <= end; i++) data[i] = intercept + slope * (i - start);
        charts.main.data.datasets[3].data = data;
    }

    function updateMarkers() {
        const data = new Array(series.days.length).fill(null);
        let hi = start, lo = start;
        for (let i = start; i <= end; i++) {
            if (series.days[i].balance > series.days[hi].balance) hi = i;
            if (series.days[i].balance < series.days[lo].balance) lo = i;
        }
        data[hi] = series.days[hi].balance;
        data[lo] = series.days[lo].balance;
        charts.main.data.datasets[4].data = data;
    }

    // ---------- navigator brush ----------

    function navPixel(index) {
        const chart = charts.nav;
        return chart ? chart.scales.x.getPixelForValue(index) : 0;
    }

    function navIndex(clientX) {
        const chart = charts.nav, rect = chart.canvas.getBoundingClientRect();
        const value = chart.scales.x.getValueForPixel(clientX - rect.left);
        return clamp(Math.round(value), 0, series.days.length - 1);
    }

    function positionBrush() {
        const chart = charts.nav;
        if (!chart || !series) return;
        const { left: areaLeft, right: areaRight, top, bottom } = chart.chartArea;
        const left = navPixel(start), right = navPixel(end);
        const brush = $("navBrush");
        brush.style.top = (chart.canvas.offsetTop + top) + "px";
        brush.style.height = (bottom - top) + "px";
        $("navShadeLeft").style.cssText = `left:${areaLeft}px;width:${Math.max(0, left - areaLeft)}px`;
        $("navShadeRight").style.cssText = `left:${right}px;width:${Math.max(0, areaRight - right)}px`;
        const win = $("navWindow");
        win.style.left = left + "px";
        win.style.width = Math.max(2, right - left) + "px";
        win.setAttribute("aria-valuetext", `${formatDay(series.days[start].day)} to ${formatDay(series.days[end].day)}`);
    }

    function wireBrush() {
        const brush = $("navBrush");
        let drag = null;
        brush.addEventListener("pointerdown", event => {
            if (!series || !charts.nav || event.button > 0) return;
            const handle = event.target.dataset.handle;
            const at = navIndex(event.clientX);
            drag = handle === "left" || handle === "right" ? { mode: handle }
                : event.target.closest("#navWindow") ? { mode: "move", grab: at, s: start, e: end }
                : { mode: "new", anchor: at };
            brush.setPointerCapture(event.pointerId);
            brush.classList.add("dragging");
            event.preventDefault();
        });
        brush.addEventListener("pointermove", event => {
            if (!drag) return;
            const at = navIndex(event.clientX), last = series.days.length - 1;
            if (drag.mode === "left") setRange(Math.min(at, end - MIN_SPAN), end);
            else if (drag.mode === "right") setRange(start, Math.max(at, start + MIN_SPAN));
            else if (drag.mode === "new") setRange(drag.anchor, at);
            else {
                const span = drag.e - drag.s;
                const from = clamp(drag.s + at - drag.grab, 0, last - span);
                setRange(from, from + span);
            }
        });
        const finish = () => {
            if (!drag) return;
            drag = null;
            brush.classList.remove("dragging");
            setRange(start, end, true);
        };
        brush.addEventListener("pointerup", finish);
        brush.addEventListener("pointercancel", finish);

        // Keyboard: arrows pan the window by a day (a week with Shift); Home / End jump to the ends.
        $("navWindow").addEventListener("keydown", event => {
            if (!series) return;
            const span = end - start, last = series.days.length - 1;
            const step = event.shiftKey ? 7 : 1;
            let from = null;
            if (event.key === "ArrowLeft") from = start - step;
            else if (event.key === "ArrowRight") from = start + step;
            else if (event.key === "Home") from = 0;
            else if (event.key === "End") from = last - span;
            if (from === null) return;
            event.preventDefault();
            from = clamp(from, 0, last - span);
            setRange(from, from + span, true);
        });
    }

    // Drag across the main chart (mouse) to zoom into those days.
    function wireZoomSelect() {
        const wrap = $("balanceChartWrap"), box = $("zoomSelect");
        let from = null;
        const xIn = event => {
            const area = charts.main.chartArea, rect = charts.main.canvas.getBoundingClientRect();
            return clamp(event.clientX - rect.left, area.left, area.right);
        };
        wrap.addEventListener("pointerdown", event => {
            if (!charts.main || event.pointerType !== "mouse" || event.button !== 0) return;
            from = xIn(event);
            wrap.setPointerCapture(event.pointerId);
        });
        wrap.addEventListener("pointermove", event => {
            if (from === null) return;
            const x = xIn(event), area = charts.main.chartArea;
            box.hidden = Math.abs(x - from) < 4;
            box.style.cssText = `left:${Math.min(x, from)}px;width:${Math.abs(x - from)}px;top:${area.top}px;height:${area.bottom - area.top}px`;
        });
        wrap.addEventListener("pointerup", event => {
            if (from === null) return;
            const x = xIn(event), scale = charts.main.scales.x;
            box.hidden = true;
            if (Math.abs(x - from) >= 8) setRange(scale.getValueForPixel(Math.min(x, from)), scale.getValueForPixel(Math.max(x, from)), true);
            from = null;
        });
        wrap.addEventListener("dblclick", () => { if (series) applyPreset("ALL"); });
    }

    // ---------- stats ----------

    const signed = value => (value > 0 ? "+" : "") + Mb.formatINR(value);
    const percent = value => (value * 100).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "%";

    function stat(label, value, sub, tone, hint) {
        const toneClass = tone ? ` ${tone}` : "";
        return `<div class="stat"${hint ? ` title="${Mb.escapeHtml(hint)}"` : ""}>
            <div class="stat-label">${Mb.escapeHtml(label)}</div>
            <div class="stat-value${toneClass}">${Mb.escapeHtml(value)}</div>
            ${sub ? `<div class="stat-sub">${Mb.escapeHtml(sub)}</div>` : ""}
        </div>`;
    }

    // Rising dues are bad for the business, falling dues good.
    const debtTone = value => value > 0 ? "negative" : value < 0 ? "positive" : "";

    function renderStats() {
        const s = rangeStats(start, end);
        const pctChange = s.opening !== 0 ? ` (${s.change >= 0 ? "+" : ""}${percent(s.change / Math.abs(s.opening))})` : "";
        const perMonth = s.trend.slope * 30;

        $("trackerStatsMain").innerHTML = [
            stat("Opening balance", Mb.formatINR(s.opening), `Close of ${formatDay(start > 0 ? series.days[start - 1].day : series.days[0].day)}`),
            stat("Closing balance", Mb.formatINR(s.closing), `Close of ${formatDay(series.days[end].day)}`),
            stat("Change", signed(s.change), pctChange.trim() || null, debtTone(s.change)),
            stat("Average balance", Mb.formatINR(s.average), `Median ${Mb.formatINR(s.median)}`, "", "Mean of the daily closing balances in the range")
        ].join("");

        $("trackerStatsRisk").innerHTML = [
            stat("Peak", Mb.formatINR(s.peak), formatDay(s.peakDay)),
            stat("Low", Mb.formatINR(s.low), formatDay(s.lowDay)),
            stat("Trend", `${signed(Math.round(perMonth))}/mo`, `R² ${s.trend.r2.toFixed(2)} · 30-day projection ${Mb.formatINR(s.projection)}`,
                debtTone(perMonth), "Least-squares line through the daily balances; the projection extends it 30 days past the range end"),
            stat("Volatility", Mb.formatINR(s.stdDev), "Standard deviation of daily balance"),
            stat("Biggest paydown", Mb.formatINR(s.paydown.value),
                s.paydown.value ? `${formatDay(s.paydown.from, false)} → ${formatDay(s.paydown.to, false)}` : "No fall from a high", s.paydown.value ? "positive" : "",
                "Largest fall from a high to a later low inside the range"),
            stat("Largest 1-day rise", signed(s.rise.value), s.rise.day ? formatDay(s.rise.day) : "None", s.rise.value ? "negative" : "")
        ].join("");

        const flowNote = s.flowsMissing ? "Billed and received start on " + (series.flowsFrom ? formatDay(series.flowsFrom) : "–") : null;
        // The archive's 2023 rows often lack payment amounts, so received can read low there.
        const archiveGap = series.days[start].day < "2024-01-01";
        $("trackerStatsFlow").innerHTML = [
            stat("Billed", Mb.formatINR(s.billed), `${s.orders} order${s.orders === 1 ? "" : "s"}` + (flowNote ? ` · ${flowNote}` : "")),
            stat("Received", Mb.formatINR(s.received), `${s.payments} payment day${s.payments === 1 ? "" : "s"}` + (archiveGap ? " · 2023 rows often lack payments" : "")),
            stat("Collection rate", s.collection === null ? "–" : percent(s.collection), "Received ÷ billed", s.collection === null ? "" : s.collection >= 1 ? "positive" : "negative"),
            stat("Days to collect", s.dso === null ? "–" : `${Math.round(s.dso)} days`, "Average balance ÷ average daily billing", "",
                "Days sales outstanding: how many days of billing the average balance represents"),
            stat("Last payment", s.lastPayment ? Mb.formatINR(s.lastPayment.amount) : "–",
                s.lastPayment ? `${formatDay(s.lastPayment.day)} · ${s.lastPayment.ago === 0 ? "on the range end" : s.lastPayment.ago + " days before range end"}` : "None recorded")
        ].join("");

        const rows = [
            ["Opening balance", s.opening, "opening"],
            ["+ Billed", s.billed],
            ["− Received", -s.received],
            ["− Discount", -s.discount],
            ["± Other adjustments", s.other, "", "Balance change the deliveries' billed, received and discount don't explain (auto adjust, adjustments, other balances)"],
            ["Closing balance", s.closing, "total-row"]
        ];
        $("bridgeTable").querySelector("tbody").innerHTML = rows.map(([label, value, cls, hint]) =>
            `<tr class="${cls || ""}"${hint ? ` title="${Mb.escapeHtml(hint)}"` : ""}><td>${Mb.escapeHtml(label)}</td><td class="num">${Mb.escapeHtml(Mb.formatINR(value))}</td></tr>`
        ).join("");
        $("bridgeNote").hidden = !s.flowsMissing;
        if (s.flowsMissing) $("bridgeNote").textContent = `The range starts before the first delivery row (${series.flowsFrom ? formatDay(series.flowsFrom) : "none"}), so billing and payments before then land in other adjustments.`;
    }

    // ---------- CSV ----------

    function downloadCsv() {
        if (!series) return;
        const lines = [["Date", "Balance", "Billed", "Received", "Discount"].join(",")];
        for (let i = start; i <= end; i++) {
            const d = series.days[i];
            lines.push([d.day, d.balance, d.billed, d.received, d.discount].join(","));
        }
        const name = (customer === "ALL" ? "all-customers" : customer).replace(/[^\w-]+/g, "-");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
        link.download = `balance-${name}-${series.days[start].day}-to-${series.days[end].day}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // ---------- page hooks ----------

    function showEmpty(message) {
        $("trackerEmpty").hidden = false;
        $("trackerEmpty").textContent = message;
        $("trackerBody").hidden = true;
        destroyCharts();
    }

    function refresh() {
        if (!visible) { dirty = true; return; }
        if (!customer) return showEmpty("Select a customer (or All customers) to see their balance over time.");
        if (!series) return showEmpty("No balance rows for this customer.");
        $("trackerEmpty").hidden = true;
        $("trackerBody").hidden = false;
        if (dirty || !charts.main) buildCharts();
        else applyRange();
    }

    window.BalanceTracker = {
        init(opts) {
            options = { ...options, ...opts };
            wireBrush();
            wireZoomSelect();
            document.querySelectorAll("#trackerPresets button").forEach(b =>
                b.addEventListener("click", () => series && applyPreset(b.dataset.preset)));
            ["optBalance", "optMa7", "optMa30", "optTrend", "optMarkers"].forEach((id, i) =>
                $(id).addEventListener("change", () => {
                    if (!charts.main) return;
                    charts.main.data.datasets[i].hidden = !$(id).checked;
                    charts.main.update("none");
                }));
            $("trackerCsv").addEventListener("click", downloadCsv);
            // Rebuild in the new colours when the theme toggles.
            document.addEventListener("mb:themechange", () => { dirty = true; if (visible && series) buildCharts(); });
        },
        // Archive rows from the first db2.deliveries day on are dropped, so no day counts twice.
        setData(deliveryRows, cumulativeRows, archiveRows) {
            const current = (deliveryRows || []).filter(r => r.timestamp);
            const currentStart = current.reduce((min, r) => { const d = dayOf(r.timestamp); return d < min ? d : min; }, "9999-12-31");
            const archive = (archiveRows || []).filter(r => r.timestamp && dayOf(r.timestamp) < currentStart);
            archiveSet = new WeakSet(archive);
            deliveries = [...archive, ...current];
            dayRows = cumulativeRows || [];
            series = customer ? buildSeries(customer) : null;
            dirty = true;
        },
        // Customer or dates changed in the shared toolbar.
        update(name, fromDay, toDay) {
            if (name !== customer || !series) {
                customer = name;
                series = name ? buildSeries(name) : null;
                dirty = true;
            }
            if (series) {
                const last = series.days.length - 1;
                const from = indexOfDay(fromDay, 0), to = indexOfDay(toDay, last);
                setRangeQuiet(from, to);
            }
            refresh();
        },
        setVisible(isVisible) {
            visible = isVisible;
            if (visible) refresh();
        }
    };

    // Move the range without redrawing or telling the page (used before the charts exist).
    function setRangeQuiet(from, to) {
        const last = series.days.length - 1;
        start = clamp(Math.min(from, to), 0, last);
        end = clamp(Math.max(from, to), 0, last);
        if (end - start < MIN_SPAN && last >= MIN_SPAN) { if (end + MIN_SPAN <= last) end = start + MIN_SPAN; else start = end - MIN_SPAN; }
    }
})();

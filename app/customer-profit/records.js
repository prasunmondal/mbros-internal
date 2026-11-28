// Records table on the Balance Tracker tab of app/customer-profit/: KG, billed, paid and due per day,
// grouped by time, counting back from the range end (To, else today):
//   Smart (default): the latest 4 weeks by week, the 6 months before them by month, anything older by year.
//   Custom:          the same, with the number of weeks and months chosen, and any level switched off. The
//                    last level switched on takes everything older; none on = plain days.
// Weeks end on the chosen weekday (Sunday by default; Thursday = Friday to Thursday), in both modes. Weeks
// and months open to their days, years to their months. Newest first everywhere. The choices are remembered
// in this browser.
// Due = billed − paid (cash + online); discounts are not in it. Rows: the 2023–2025 archive, then db2.deliveries.
//
// The page calls BalanceRecords.init() once, setData() when rows arrive and update() when the customer or
// the date range changes.
(function () {
    const DAY_MS = 86400000;
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const LEVEL_LABEL = { year: "Year", month: "Month", week: "Week", day: "Day" };

    const $ = id => document.getElementById(id);
    const number = value => Number(String(value ?? "").replace(/,/g, "")) || 0;
    const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
    const monthEnd = month => addDays(addDays(month + "-28", 4).slice(0, 7) + "-01", -1);   // "2026-02" → "2026-02-28"
    const shiftMonth = (month, n) => { const [y, m] = month.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`; };
    const dayLabel = (day, withYear = true) => { const [y, m, d] = day.split("-"); return `${Number(d)} ${MONTHS[m - 1]}${withYear ? " " + y : ""}`; };
    const monthLabel = month => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
    const rangeLabel = (a, b) => a === b ? dayLabel(a) : a.slice(0, 7) === b.slice(0, 7)
        ? `${Number(a.slice(8))}–${dayLabel(b)}`
        : a.slice(0, 4) === b.slice(0, 4) ? `${dayLabel(a, false)} – ${dayLabel(b)}` : `${dayLabel(a)} – ${dayLabel(b)}`;
    const clip = (a, b, lo, hi) => [a < lo ? lo : a, b > hi ? hi : b];

    let current = [], archive = [];
    let customer = "", fromDay = "", toDay = "";
    let mode = "smart";
    // Weekday a week ends on, as getUTCDay numbers it (0 = Sunday … 6 = Saturday).
    let weekEnd = 0;
    const SMART = { week: true, weeks: 4, month: true, months: 6, year: true };
    const SETTINGS_KEY = "mb-records";
    // First day of the week holding `day`: the day after the chosen end weekday.
    const weekStartOf = day => {
        const startDow = (weekEnd + 1) % 7, dow = new Date(day + "T00:00:00Z").getUTCDay();
        return addDays(day, -((dow - startDow + 7) % 7));
    };
    const expanded = new Set();   // ids of open groups, kept across re-renders

    // ---------- data ----------

    // One entry per day for the customer (or everyone) inside the range, newest first.
    function dailyTotals() {
        const byDay = new Map();
        [...archive, ...current].forEach(row => {
            if (!row.timestamp || !row.name || (customer !== "ALL" && row.name !== customer)) return;
            const day = Mb.toISTDate(row.timestamp);
            if ((fromDay && day < fromDay) || (toDay && day > toDay)) return;
            const t = byDay.get(day) || { day, kg: 0, billed: 0, paid: 0 };
            t.kg += number(row.deliveredKg);
            t.billed += number(row.deliverAmount);
            t.paid += number(row.paidCash) + number(row.paidOnline);
            byDay.set(day, t);
        });
        return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
    }

    // ---------- grouping ----------

    function node(id, level, label, start, end, days, children) {
        const n = { id, level, label, start, end, children, kg: 0, billed: 0, paid: 0, count: days.length };
        days.forEach(d => { n.kg += d.kg; n.billed += d.billed; n.paid += d.paid; });
        return n;
    }

    const dayNodes = (days, parentId) => days.map(d => ({ id: `${parentId}/${d.day}`, level: "day", label: dayLabel(d.day), kg: d.kg, billed: d.billed, paid: d.paid, children: [] }));

    // The calendar span of a group key, clipped to its parent's span.
    function span(level, key, lo, hi) {
        const [a, b] = level === "year" ? [key + "-01-01", key + "-12-31"]
            : level === "month" ? [key + "-01", monthEnd(key)]
            : [key, addDays(key, 6)];
        return clip(a, b, lo, hi);
    }
    const keyOf = (level, day) => level === "year" ? day.slice(0, 4) : level === "month" ? day.slice(0, 7) : weekStartOf(day);

    function labelFor(level, key, a, b) {
        if (level === "week") return rangeLabel(a, b);
        const [fullA, fullB] = span(level, key, "0000-00-00", "9999-99-99");
        const base = level === "year" ? key : monthLabel(key);
        return a === fullA && b === fullB ? base : `${base} (${rangeLabel(a, b)})`;
    }

    // Nest days by the given levels, in order; days come in newest first and groups keep that order.
    function nest(days, levels, parentId, lo, hi) {
        if (!levels.length) return dayNodes(days, parentId);
        const [level, ...rest] = levels;
        const groups = new Map();
        days.forEach(d => {
            const key = keyOf(level, d.day);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(d);
        });
        return [...groups].map(([key, list]) => {
            const [a, b] = span(level, key, lo, hi);
            const id = `${parentId}/${level}:${key}`;
            return node(id, level, labelFor(level, key, a, b), a, b, list, nest(list, rest, id, a, b));
        });
    }

    // Rolling groups back from the anchor: weeks, then months, then years, each only when switched on.
    // The month window is the partial month left before the weeks (if any) plus `months` full months.
    function rollingTree(days, o) {
        const anchor = toDay || Mb.todayIST();
        const lo = fromDay || "0000-01-01";
        const on = ["week", "month", "year"].filter(level => o[level]);
        const id = `roll:${weekEnd}:${on.map(l => l + (o[l + "s"] || "")).join("+")}`;
        if (!on.length) return dayNodes(days, id);
        const last = on[on.length - 1];
        const out = [];
        let remaining = days, boundary = addDays(anchor, 1);   // days before `boundary` are still ungrouped
        const take = (level, from, levels) => {
            const part = remaining.filter(d => d.day >= from);
            remaining = remaining.filter(d => d.day < from);
            out.push(...nest(part, levels, `${id}/${level}s`, from > lo ? from : lo, addDays(boundary, -1)));
            boundary = from;
        };
        if (o.week) take("week", last === "week" ? "0000-01-01" : addDays(weekStartOf(anchor), -7 * (o.weeks - 1)), ["week"]);
        if (o.month) take("month", last === "month" ? "0000-01-01" : shiftMonth(addDays(boundary, -1).slice(0, 7), -o.months) + "-01", ["month"]);
        if (o.year) take("year", "0000-01-01", ["year", "month"]);
        return out;
    }

    function customOptions() {
        const count = (id, fallback, max) => Math.min(max, Math.max(1, Math.round(Number($(id).value)) || fallback));
        return {
            week: $("recLevel-week").checked, weeks: count("recWeeks", SMART.weeks, 104),
            month: $("recLevel-month").checked, months: count("recMonths", SMART.months, 60),
            year: $("recLevel-year").checked
        };
    }
    const tree = days => rollingTree(days, mode === "smart" ? SMART : customOptions());

    // ---------- render ----------

    const inr = v => Mb.formatINR(v, 0);
    // Due above zero adds to what the customer owes (red, as on the balance chart); below zero pays it down (green).
    const dueClass = v => Math.round(v) > 0 ? "due-up" : Math.round(v) < 0 ? "due-down" : "";

    function render() {
        const body = $("recordsTable").tBodies[0], foot = $("recordsTable").tFoot;
        body.replaceChildren();
        foot.replaceChildren();
        $("recordsCustom").hidden = mode !== "custom";
        document.querySelectorAll("#recordsMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
        if (!customer) return empty("Select a customer (or All customers) to see their records.");

        const days = dailyTotals();
        if (!days.length) return empty("No records in this range.");
        const groups = tree(days);

        const walk = (nodes, depth, visible) => nodes.forEach(n => {
            const open = expanded.has(n.id);
            const tr = body.insertRow();
            tr.className = `rec-${n.level}`;
            tr.hidden = !visible;
            tr.dataset.depth = depth;
            const cell = tr.insertCell();
            cell.className = "rec-label";
            cell.style.paddingLeft = `${14 + depth * 20}px`;
            if (n.children.length) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "rec-toggle";
                button.setAttribute("aria-expanded", String(open));
                button.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${n.label}`);
                button.addEventListener("click", () => { open ? expanded.delete(n.id) : expanded.add(n.id); render(); });
                const label = document.createElement("span");
                label.textContent = n.label;
                button.append(label);
                cell.append(button);
                const kind = document.createElement("span");
                kind.className = "rec-kind";
                kind.textContent = `${LEVEL_LABEL[n.level]} · ${n.count} day${n.count === 1 ? "" : "s"}`;
                cell.append(kind);
            } else {
                cell.textContent = n.label;
            }
            const due = n.billed - n.paid;
            [Mb.formatNumber(n.kg, 3), inr(n.billed), inr(n.paid), (due > 0 ? "+" : "") + inr(due)].forEach((value, i) => {
                const td = tr.insertCell();
                td.className = "num" + (i === 3 && dueClass(due) ? " " + dueClass(due) : "");
                td.textContent = value;
            });
            walk(n.children, depth + 1, visible && open);
        });
        walk(groups, 0, true);

        const total = days.reduce((t, d) => ({ kg: t.kg + d.kg, billed: t.billed + d.billed, paid: t.paid + d.paid }), { kg: 0, billed: 0, paid: 0 });
        const tr = foot.insertRow();
        tr.className = "total-row";
        const due = total.billed - total.paid;
        [`Total · ${days.length} day${days.length === 1 ? "" : "s"}`, Mb.formatNumber(total.kg, 3), inr(total.billed), inr(total.paid), (due > 0 ? "+" : "") + inr(due)]
            .forEach((value, i) => {
                const td = tr.insertCell();
                td.textContent = value;
                if (i) td.className = "num" + (i === 4 && dueClass(due) ? " " + dueClass(due) : "");
            });
        $("recordsRange").textContent = days.length
            ? `${dayLabel(days[days.length - 1].day)} – ${dayLabel(days[0].day)}` + ` · counted back from ${dayLabel(toDay || Mb.todayIST())}`
            : "";
    }

    function empty(message) {
        const td = $("recordsTable").tBodies[0].insertRow().insertCell();
        td.colSpan = 5;
        td.className = "empty-state";
        td.textContent = message;
        $("recordsRange").textContent = "";
    }

    // Open or close every group in the current tree.
    function setAll(open) {
        expanded.clear();
        if (open && customer) {
            const days = dailyTotals();
            const add = nodes => nodes.forEach(n => { if (n.children.length) { expanded.add(n.id); add(n.children); } });
            add(tree(days));
        }
        render();
    }

    // A count box is greyed out while its level is off.
    function syncCounts() {
        $("recWeeks").disabled = !$("recLevel-week").checked;
        $("recMonths").disabled = !$("recLevel-month").checked;
    }

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            if (saved.mode === "custom" || saved.mode === "smart") mode = saved.mode;
            if (Number.isInteger(saved.weekEnd) && saved.weekEnd >= 0 && saved.weekEnd <= 6) weekEnd = saved.weekEnd;
            if (saved.custom) {
                ["week", "month", "year"].forEach(l => { if (typeof saved.custom[l] === "boolean") $(`recLevel-${l}`).checked = saved.custom[l]; });
                if (saved.custom.weeks) $("recWeeks").value = saved.custom.weeks;
                if (saved.custom.months) $("recMonths").value = saved.custom.months;
            }
        } catch { /* defaults */ }
        $("recWeekEnd").value = String(weekEnd);
        syncCounts();
    }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, weekEnd, custom: customOptions() })); } catch { /* this visit only */ }
    }

    window.BalanceRecords = {
        init() {
            loadSettings();
            document.querySelectorAll("#recordsMode button").forEach(b =>
                b.addEventListener("click", () => { mode = b.dataset.mode; saveSettings(); render(); }));
            ["recLevel-year", "recLevel-month", "recLevel-week", "recWeeks", "recMonths"].forEach(id =>
                $(id).addEventListener("change", () => { syncCounts(); saveSettings(); render(); }));
            $("recWeekEnd").addEventListener("change", () => { weekEnd = Number($("recWeekEnd").value); saveSettings(); render(); });
            $("recordsExpand").addEventListener("click", () => setAll(true));
            $("recordsCollapse").addEventListener("click", () => setAll(false));
            render();
        },
        setData(currentRows, archiveRows) {
            current = currentRows || [];
            const start = current.reduce((min, r) => { if (!r.timestamp) return min; const d = Mb.toISTDate(r.timestamp); return d < min ? d : min; }, "9999-12-31");
            // Archive rows from the first db2.deliveries day on are dropped, so no day counts twice.
            archive = (archiveRows || []).filter(r => r.timestamp && Mb.toISTDate(r.timestamp) < start);
            render();
        },
        update(name, from, to) {
            if (name !== customer) expanded.clear();
            customer = name || "";
            fromDay = from || "";
            toDay = to || "";
            render();
        }
    };
})();

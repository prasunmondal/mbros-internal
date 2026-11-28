// Data Checks (app/checks/): loads every worksheet the site reads and runs sanity checks on it, so one page
// shows whether the data still matches what the pages expect. Read only. "Run again" reloads the page,
// which clears the data cache in assets/js/config.js, so every run reads fresh data.
//
// Rules checked come from .claude/context/product.md (khata arithmetic, dues = totalBalance, archive
// handoff); worksheet columns from EXPECTED_COLUMNS in assets/js/config.js.
(function () {
    // Spreadsheet IDs other than MAIN_SHEET_ID live in the pages that use them; repeated here for the checks.
    const ARCHIVE_SHEET_ID = "1-uKyCderO-4Zq-YRb8HEzPgbSZPJ_vdzWs2P3BqE2kw";   // app/statements/, app/deliveries/
    const STAGING_SHEET_ID = "1X6HriHjIE0XfAblDlE7Uf5a8JTHu00kW2SWvTFKL78w";   // app/statements/, app/deliveries/
    const METER_SHEET_ID = "1VYrAZxWXE4bNA6HjoBWbGS17rQxaMgjvnrIUzopnHdY";     // app/meters/

    const SOURCES = [
        { key: "deliveries", spreadsheetId: MAIN_SHEET_ID, worksheet: "db2.deliveries", usedBy: "most pages" },
        { key: "archive", spreadsheetId: ARCHIVE_SHEET_ID, worksheet: "deliveries.2023", usedBy: "history before 2026" },
        { key: "days", spreadsheetId: MAIN_SHEET_ID, worksheet: "cumilativeCalculations", usedBy: "Dashboards, Day Summary, Customer Profit" },
        { key: "loads", spreadsheetId: MAIN_SHEET_ID, worksheet: "db2.loads", usedBy: "Statements, Dashboards" },
        { key: "staged", spreadsheetId: STAGING_SHEET_ID, worksheet: "temp.load", usedBy: "Statements (staged rows)" },
        { key: "occasions", spreadsheetId: STAGING_SHEET_ID, worksheet: "cal.occasions", usedBy: "Past Deliveries" },
        { key: "revenue", spreadsheetId: MAIN_SHEET_ID, worksheet: "revenue", usedBy: "Dashboards (Balances)" },
        { key: "meters", spreadsheetId: METER_SHEET_ID, worksheet: "apiData", usedBy: "Meters" }
    ];
    const DELIVERY_NUMBERS = ["deliveredPc", "deliveredKg", "rate", "deliverAmount", "paidCash", "paidOnline", "discount",
        "autoAdjust", "adjustments", "prevAmount", "khataBalance", "totalBalance"];
    const STALE_DAYS = 3;       // a worksheet whose latest row is older than this gets a warning
    const TOLERANCE = 1;        // ₹ differences up to this count as equal (rounding)
    const MAX_ROWS = 100;       // detail rows shown per check

    const $ = id => document.getElementById(id);
    const isBlank = v => v === "" || v === null || v === undefined;
    const number = v => Number(String(v ?? "").replace(/,/g, "")) || 0;
    const isNumeric = v => isBlank(v) || typeof v === "number" || /^\s*-?[\d,]*\.?\d+\s*$/.test(String(v));
    const isDue = v => !isBlank(v) && v !== "#N/A";
    // Newer cumilativeCalculations rows hold YYYY-MM-DD; older ones a UTC timestamp of IST midnight.
    const dayOf = v => (typeof v === "string" && v.length === 10) ? v : Mb.toISTDate(v);
    const validDay = v => !isBlank(v) && !Number.isNaN(Date.parse(typeof v === "string" && v.length === 10 ? v + "T00:00:00Z" : v));
    const daysAgo = day => Math.round((Date.parse(Mb.todayIST() + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000);
    const inr = v => Mb.formatINR(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2);
    const plural = (n, word) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

    const results = [];   // { group, title, status: pass | warn | fail | skip, summary, note, table: { head, rows, total } }
    const add = (group, title, status, summary, extra = {}) => results.push({ group, title, status, summary, ...extra });
    const table = (head, rows) => ({ head, rows: rows.slice(0, MAX_ROWS), total: rows.length });

    // ---------- load ----------

    async function loadAll(progress) {
        const loaded = {};
        for (const [i, source] of SOURCES.entries()) {
            progress(`Loading ${source.worksheet} (${i + 1} of ${SOURCES.length})…`);
            const started = performance.now();
            try {
                const [result] = await callSheetsApi([{ type: "SELECT", spreadsheetId: source.spreadsheetId, worksheet: source.worksheet, id: "mbros-github-site-checks" }]);
                loaded[source.key] = { rows: result.rows || [], ms: performance.now() - started };
            } catch (error) {
                loaded[source.key] = { error: error.message || String(error), ms: performance.now() - started };
            }
        }
        return loaded;
    }

    // ---------- checks ----------

    function checkSources(data) {
        SOURCES.forEach(source => {
            const got = data[source.key];
            const title = `${source.worksheet} loads`;
            if (got.error) {
                add("Connection", title, "fail", got.error, { note: `Used by ${source.usedBy}.` });
            } else {
                add("Connection", title, "pass", `${plural(got.rows.length, "row")} in ${Math.round(got.ms).toLocaleString("en-IN")} ms`,
                    { note: `Used by ${source.usedBy}.` });
            }
        });
    }

    function checkColumnsFor(data) {
        SOURCES.forEach(source => {
            const got = data[source.key];
            if (got.error) return;
            const title = `${source.worksheet} columns`;
            const report = columnReports[`${source.spreadsheetId}/${source.worksheet}`];
            if (!report) return add("Columns", title, "skip", "No rows, so no columns to check.");
            const expected = report.expected || [];
            const rows = [
                ...report.missing.map(c => [c, "Missing (pages depend on it)"]),
                ...report.removed.map(c => [c, "Removed since last check"]),
                ...report.added.map(c => [c, "New since last check"]),
                ...report.columns.filter(c => !report.added.includes(c)).map(c => [c, expected.includes(c) ? "Present, expected" : "Present"])
            ];
            const changed = report.added.length + report.removed.length;
            const status = report.missing.length ? "fail" : changed ? "warn" : "pass";
            const summary = report.missing.length ? `Missing: ${report.missing.join(", ")}`
                : changed ? [report.added.length && `added ${report.added.join(", ")}`, report.removed.length && `removed ${report.removed.join(", ")}`].filter(Boolean).join("; ")
                : `${plural(report.columns.length, "column")}` + (report.expected ? `, all ${expected.length} expected present` : " (no expected list)");
            add("Columns", title, status, summary, {
                note: (report.firstSeen ? "First check in this browser: these columns are now the baseline. " : "") +
                    (changed ? "Changes are reported once; they are the baseline from now on." : ""),
                table: table(["Column", "Status"], rows)
            });
        });
    }

    function checkFreshness(data) {
        const latest = (key, label, pick) => {
            const got = data[key];
            if (got.error) return add("Freshness", label, "skip", `${SOURCES.find(s => s.key === key).worksheet} did not load.`);
            const days = got.rows.map(pick).filter(Boolean).sort();
            if (!days.length) return add("Freshness", label, "warn", "No dated rows.");
            const day = days[days.length - 1], age = daysAgo(day);
            add("Freshness", label, age > STALE_DAYS ? "warn" : "pass",
                `Latest ${day} (${age <= 0 ? "today" : plural(age, "day") + " ago"})`,
                age > STALE_DAYS ? { note: `Older than ${STALE_DAYS} days: fine during a break, otherwise the app may have stopped syncing.` } : {});
        };
        latest("deliveries", "Latest delivery row", r => validDay(r.timestamp) ? Mb.toISTDate(r.timestamp) : null);
        latest("days", "Latest daily totals row", r => validDay(r.date) ? dayOf(r.date) : null);
        latest("loads", "Latest load / transaction row", r => validDay(r.deliverySession) ? dayOf(r.deliverySession) : null);
    }

    // db2.deliveries rows in sheet order per customer, sorted by day (stable).
    function deliveryRows(rows) {
        return rows.map((row, index) => ({ row, index, day: validDay(row.timestamp) ? Mb.toISTDate(row.timestamp) : null }))
            .filter(r => r.row.name && r.day)
            .sort((a, b) => a.day.localeCompare(b.day) || a.index - b.index);
    }

    function checkLedger(data) {
        const group = "Deliveries ledger";
        const got = data.deliveries;
        if (got.error) {
            ["Values are valid", "Khata arithmetic", "Previous balance chain", "Order IDs are unique"].forEach(t => add(group, t, "skip", "db2.deliveries did not load."));
            return;
        }
        const rows = got.rows;

        // Dates and numbers that won't parse read as 0 or vanish from date ranges.
        const bad = [];
        rows.forEach((row, i) => {
            if (!row.name && !row.timestamp) return;
            if (!validDay(row.timestamp)) bad.push([i + 2, row.name || "", "timestamp", String(row.timestamp ?? "")]);
            DELIVERY_NUMBERS.forEach(col => { if (col in row && !isNumeric(row[col])) bad.push([i + 2, row.name || "", col, String(row[col])]); });
            if (!row.name) bad.push([i + 2, "", "name", "(blank)"]);
        });
        add(group, "Values are valid", bad.length ? "fail" : "pass",
            bad.length ? `${plural(bad.length, "bad value")} (text in a number column, unreadable date or blank name)` : `All ${plural(rows.length, "row")} have readable dates and numbers`,
            bad.length ? { table: table(["Row", "Customer", "Column", "Value"], bad) } : {});

        // khataBalance = prevAmount + deliverAmount − paidCash − paidOnline − discount + autoAdjust + adjustments
        const sorted = deliveryRows(rows);
        const off = [];
        sorted.forEach(({ row, index, day }) => {
            const expected = number(row.prevAmount) + number(row.deliverAmount) - number(row.paidCash) - number(row.paidOnline)
                - number(row.discount) + number(row.autoAdjust) + number(row.adjustments);
            const diff = number(row.khataBalance) - expected;
            if (Math.abs(diff) > TOLERANCE) off.push([index + 2, day, row.name, inr(number(row.khataBalance)), inr(expected), inr(diff)]);
        });
        add(group, "Khata arithmetic", off.length ? "fail" : "pass",
            off.length ? `${plural(off.length, "row")} where khataBalance ≠ prevAmount + deliverAmount − paid − discount + adjustments` : `Holds on all ${plural(sorted.length, "row")}`,
            { note: "Rule from product.md (khata row arithmetic).", ...(off.length ? { table: table(["Row", "Day", "Customer", "khataBalance", "Expected", "Difference"], off) } : {}) });

        // Each row's prevAmount is the customer's previous khataBalance.
        const last = new Map(), broken = [];
        sorted.forEach(({ row, index, day }) => {
            const prev = last.get(row.name);
            if (prev && Math.abs(number(row.prevAmount) - number(prev.row.khataBalance)) > TOLERANCE)
                broken.push([index + 2, day, row.name, inr(number(row.prevAmount)), inr(number(prev.row.khataBalance)), prev.day]);
            last.set(row.name, { row, day });
        });
        add(group, "Previous balance chain", broken.length ? "fail" : "pass",
            broken.length ? `${plural(broken.length, "row")} whose prevAmount isn't the customer's previous khataBalance` : `Unbroken for all ${plural(last.size, "customer")}`,
            broken.length ? { table: table(["Row", "Day", "Customer", "prevAmount", "Previous khataBalance", "Previous day"], broken) } : {});

        // Duplicate order IDs.
        const seen = new Map(), dupes = [];
        rows.forEach((row, i) => {
            const id = String(row.orderId ?? "").trim();
            if (!id) return;
            if (seen.has(id)) dupes.push([id, seen.get(id) + 2, i + 2, row.name || ""]);
            else seen.set(id, i);
        });
        add(group, "Order IDs are unique", dupes.length ? "warn" : "pass",
            dupes.length ? `${plural(dupes.length, "repeated order ID")}` : `${plural(seen.size, "order ID")}, no repeats`,
            dupes.length ? { table: table(["Order ID", "First row", "Repeat row", "Customer"], dupes) } : {});
    }

    function checkArchive(data) {
        const group = "Archive (2023–2025)";
        if (data.archive.error || data.deliveries.error) {
            ["Archive ends before 2026", "2025 → 2026 balances carry over"].forEach(t => add(group, t, "skip", "A deliveries worksheet did not load."));
            return;
        }
        const current = deliveryRows(data.deliveries.rows), archive = deliveryRows(data.archive.rows);
        const currentStart = current.length ? current[0].day : "9999-12-31";

        const overlap = archive.filter(r => r.day >= currentStart);
        add(group, "Archive ends before 2026", overlap.length ? "warn" : "pass",
            overlap.length ? `${plural(overlap.length, "archive row")} on or after ${currentStart}; pages drop them so no day counts twice`
                : `Last archive day ${archive.length ? archive[archive.length - 1].day : "–"}, db2.deliveries starts ${currentStart}`,
            overlap.length ? { table: table(["Day", "Customer"], overlap.map(r => [r.day, r.row.name])) } : {});

        // Each customer's last archive khataBalance should be their first 2026 prevAmount (held on 2026-10-30).
        const lastArchive = new Map();
        archive.filter(r => r.day < currentStart).forEach(r => lastArchive.set(r.row.name, r));
        const firstCurrent = new Map();
        current.forEach(r => { if (!firstCurrent.has(r.row.name)) firstCurrent.set(r.row.name, r); });
        const gaps = [];
        firstCurrent.forEach((r, name) => {
            const before = lastArchive.get(name);
            if (before && Math.abs(number(r.row.prevAmount) - number(before.row.khataBalance)) > TOLERANCE)
                gaps.push([name, before.day, inr(number(before.row.khataBalance)), r.day, inr(number(r.row.prevAmount))]);
        });
        const both = [...firstCurrent.keys()].filter(name => lastArchive.has(name)).length;
        add(group, "2025 → 2026 balances carry over", gaps.length ? "fail" : "pass",
            gaps.length ? `${plural(gaps.length, "customer")} whose first 2026 prevAmount isn't their last archive balance` : `Carries over for all ${plural(both, "customer")} in both`,
            gaps.length ? { table: table(["Customer", "Last archive day", "Archive khataBalance", "First 2026 day", "2026 prevAmount"], gaps) } : {});
    }

    async function checkDailyTotals(data) {
        const group = "Daily totals";
        const titles = ["One row per day", "Sales match deliveries", "Dues match customer balances"];
        if (data.days.error || data.deliveries.error) return titles.forEach(t => add(group, t, "skip", "A worksheet did not load."));
        const current = deliveryRows(data.deliveries.rows);
        const from = current.length ? current[0].day : "9999-12-31";
        const dayRows = data.days.rows.filter(r => validDay(r.date)).map(r => ({ ...r, day: dayOf(r.date) })).filter(r => r.day >= from);

        const counts = new Map();
        dayRows.forEach(r => counts.set(r.day, (counts.get(r.day) || 0) + 1));
        const doubled = [...counts].filter(([, n]) => n > 1);
        add(group, titles[0], doubled.length ? "warn" : "pass",
            doubled.length ? `${plural(doubled.length, "day")} with more than one row since ${from}` : `${plural(counts.size, "day")} since ${from}, one row each`,
            doubled.length ? { table: table(["Day", "Rows"], doubled) } : {});

        // sold_amount and deliveredPc against that day's delivery rows.
        const byDay = new Map();
        current.forEach(({ row, day }) => {
            const t = byDay.get(day) || { amount: 0, pc: 0 };
            t.amount += number(row.deliverAmount); t.pc += number(row.deliveredPc);
            byDay.set(day, t);
        });
        const mismatch = [];
        dayRows.forEach(r => {
            const t = byDay.get(r.day) || { amount: 0, pc: 0 };
            const da = number(r.sold_amount) - t.amount, dp = number(r.deliveredPc) - t.pc;
            if (Math.abs(da) > TOLERANCE || Math.abs(dp) > 0.5)
                mismatch.push([r.day, inr(number(r.sold_amount)), inr(t.amount), Mb.formatNumber(number(r.deliveredPc)), Mb.formatNumber(t.pc)]);
        });
        add(group, titles[1], mismatch.length ? "warn" : "pass",
            mismatch.length ? `${plural(mismatch.length, "day")} of ${counts.size} where sold_amount or deliveredPc differ from the day's deliveries` : `Match on all ${plural(counts.size, "day")} since ${from}`,
            { note: "Not every day matched when last measured (1,042 of 1,124 days, 2026-10-30), so this is a warning, not a failure.",
              ...(mismatch.length ? { table: table(["Day", "sold_amount", "Deliveries", "deliveredPc", "Delivered PC"], mismatch) } : {}) });

        // Corrected new_due_balance against every customer's latest totalBalance that day (archive + 2026).
        try {
            const corrected = await useTotalBalanceDues(dayRows.map(r => ({ ...r })));
            const all = data.archive.error ? current : [...deliveryRows(data.archive.rows).filter(r => r.day < from), ...current];
            const latest = new Map();
            let i = 0;
            const wrong = [];
            corrected.filter(r => isDue(r.new_due_balance)).sort((a, b) => a.day.localeCompare(b.day)).forEach(r => {
                while (i < all.length && all[i].day <= r.day) {
                    const row = all[i].row;
                    latest.set(row.name, isDue(row.totalBalance) ? number(row.totalBalance) : number(row.khataBalance));
                    i++;
                }
                let sum = 0;
                latest.forEach(v => { sum += v; });
                const diff = number(r.new_due_balance) - sum;
                if (Math.abs(diff) > TOLERANCE) wrong.push([r.day, inr(number(r.new_due_balance)), inr(sum), inr(diff)]);
            });
            add(group, titles[2], wrong.length ? "warn" : "pass",
                wrong.length ? `${plural(wrong.length, "day")} where the day's dues differ from the sum of customer balances` : `Match on every day since ${from}`,
                { note: "Dues = totalBalance (product.md). The sheet's due columns are corrected by useTotalBalanceDues first, as every page does.",
                  ...(wrong.length ? { table: table(["Day", "Dues (corrected)", "Sum of customer balances", "Difference"], wrong) } : {}) });
        } catch (error) {
            add(group, titles[2], "fail", `Could not correct the dues: ${error.message || error}`);
        }
    }

    // ---------- render ----------

    const LABEL = { pass: "Pass", warn: "Warning", fail: "Fail", skip: "Skipped" };
    const ICON = { pass: "✓", warn: "!", fail: "✕", skip: "–" };

    function render(ranAt) {
        const count = s => results.filter(r => r.status === s).length;
        $("countPass").textContent = count("pass");
        $("countWarn").textContent = count("warn");
        $("countFail").textContent = count("fail");
        $("countSkip").textContent = count("skip");
        const fails = count("fail"), warns = count("warn");
        Mb.setStatus($("overall"), fails ? "error" : warns ? "empty" : "success",
            fails ? `${plural(fails, "check")} failed${warns ? `, ${plural(warns, "warning")}` : ""}. Open a check to see the rows behind it.`
                : warns ? `No failures, ${plural(warns, "warning")} to look at.` : "All checks pass.");
        $("ranAt").textContent = `Checked ${ranAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;

        const groups = [...new Set(results.map(r => r.group))];
        $("results").innerHTML = groups.map(group => {
            const items = results.filter(r => r.group === group);
            const worst = ["fail", "warn", "skip", "pass"].find(s => items.some(r => r.status === s));
            return `<section class="card section check-group">
                <div class="card-header"><h2>${Mb.escapeHtml(group)}</h2><span class="pill ${worst}">${ICON[worst]} ${LABEL[worst]}</span></div>
                ${items.map(renderCheck).join("")}
            </section>`;
        }).join("");
    }

    function renderCheck(r) {
        const hasBody = r.note || r.table;
        const head = `<span class="pill ${r.status}">${ICON[r.status]} ${LABEL[r.status]}</span>
            <span class="check-title">${Mb.escapeHtml(r.title)}</span>
            <span class="check-summary">${Mb.escapeHtml(r.summary)}</span>`;
        if (!hasBody) return `<div class="check"><div class="check-head">${head}</div></div>`;
        const t = r.table;
        const tableHtml = t ? `<div class="table-wrap"><table class="table"><thead><tr>${t.head.map(h => `<th>${Mb.escapeHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${t.rows.map(row => `<tr>${row.map(v => `<td>${Mb.escapeHtml(String(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
            ${t.total > t.rows.length ? `<p class="subtle check-more">Showing ${t.rows.length} of ${t.total.toLocaleString("en-IN")}.</p>` : ""}` : "";
        return `<details class="check"${r.status === "fail" ? " open" : ""}><summary class="check-head">${head}</summary>
            <div class="check-body">${r.note ? `<p class="subtle">${Mb.escapeHtml(r.note)}</p>` : ""}${tableHtml}</div></details>`;
    }

    function reportText() {
        const lines = [`Mondal Brothers data checks · ${$("ranAt").textContent}`, $("overall").textContent, ""];
        [...new Set(results.map(r => r.group))].forEach(group => {
            lines.push(group);
            results.filter(r => r.group === group).forEach(r => lines.push(`  [${LABEL[r.status]}] ${r.title}: ${r.summary}`));
            lines.push("");
        });
        return lines.join("\n");
    }

    async function run() {
        const status = $("status");
        try {
            const data = await loadAll(message => Mb.setStatus(status, "info", message));
            Mb.setStatus(status, "info", "Running checks…");
            checkSources(data);
            checkColumnsFor(data);
            checkFreshness(data);
            checkLedger(data);
            checkArchive(data);
            await checkDailyTotals(data);
            Mb.setStatus(status, null);
            render(new Date());
            $("copyReport").disabled = false;
        } catch (error) {
            console.error(error);
            Mb.setStatus(status, "error", `The checks stopped: ${error.message || error}`);
        }
    }

    $("runAgain").addEventListener("click", () => location.reload());
    $("copyReport").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(reportText());
            $("copyReport").textContent = "Copied";
            setTimeout(() => { $("copyReport").textContent = "Copy report"; }, 1500);
        } catch {
            Mb.setStatus($("status"), "error", "This browser would not copy the report.");
        }
    });
    run();
})();

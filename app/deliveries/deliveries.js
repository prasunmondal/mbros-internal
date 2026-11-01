
/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG = {

    operations: [
        {
            type: "SELECT",
            spreadsheetId:
                "1-uKyCderO-4Zq-YRb8HEzPgbSZPJ_vdzWs2P3BqE2kw",
            worksheet: "deliveries.2023",
            id: "mbros-github-site-1"
        },
        {
            type: "SELECT",
            spreadsheetId:
                MAIN_SHEET_ID,
            worksheet: "db2.deliveries",
            id: "mbros-github-site-2"
        }
    ]
};


/* ============================================================
   STATE
   ============================================================ */

let dateGroups = [];

let highlightedDates = [];

let allTransactions = null;

let nextGroupId = 1;


/* ============================================================
   REPORT TITLE
   ============================================================ */

function getReportTitle() {

    const input =
        document.getElementById(
            "reportTitle"
        );

    return (
        input?.value.trim() ||
        "Delivery Report"
    );
}


/* ============================================================
   DATE HELPERS
   ============================================================ */

function formatDateToIST(timestamp) {

    const date = new Date(timestamp);

    date.setHours(
        date.getHours() + 5,
        date.getMinutes() + 30
    );

    return date.toISOString().split("T")[0];
}


function parseDate(dateString) {

    const [year, month, day] =
        dateString.split("-").map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}


function formatDateDisplay(dateString) {

    const date =
        parseDate(dateString);

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}


function formatDateWithDay(dateString) {

    const date =
        parseDate(dateString);

    const dateText =
        date.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

    const dayText =
        date.toLocaleDateString(
            "en-IN",
            {
                weekday: "long"
            }
        );

    return {
        date: dateText,
        day: dayText
    };
}


function addDays(dateString, days) {

    const date =
        parseDate(dateString);

    date.setDate(
        date.getDate() + days
    );

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/* ============================================================
   GROUP HELPERS
   ============================================================ */

function getGroup(groupId) {

    return dateGroups.find(
        group =>
            group.id === groupId
    );
}


function getAllSelectedDates() {

    return dateGroups.flatMap(
        group => group.dates
    );
}


function isDateSelectedInGroup(
    group,
    date
) {

    return group.dates.includes(date);
}


function isDateSelectedAnywhere(
    date
) {

    return dateGroups.some(
        group =>
            group.dates.includes(date)
    );
}


/* ============================================================
   CREATE GROUP
   ============================================================ */

function createDateGroup() {

    const group = {
        id: nextGroupId++,
        dates: []
    };

    dateGroups.push(group);

    renderDateGroups();

    /*
     * Focus the date picker so the user can
     * immediately choose a date.
     */
    document
        .getElementById("calendarDate")
        ?.focus();
}


/* ============================================================
   DELETE GROUP
   ============================================================ */

function deleteDateGroup(groupId) {

    const group =
        getGroup(groupId);

    if (!group) {
        return;
    }

    /*
     * Remove highlights belonging
     * to this group.
     */
    highlightedDates =
        highlightedDates.filter(
            date =>
                !group.dates.includes(date)
        );

    dateGroups =
        dateGroups.filter(
            group =>
                group.id !== groupId
        );

    renderDateGroups();

    renderHighlightedDates();

    if (allTransactions !== null) {
        renderReportFromCachedData();
    }
}


/* ============================================================
   ADD DATE TO GROUP
   ============================================================ */

function addDateToGroup(groupId) {

    const input =
        document.getElementById("calendarDate");

    if (!input) {
        return;
    }

    /*
     * Remember which group is waiting
     * for a date selection.
     */
    input.dataset.groupId = groupId;

    /*
     * Clear the previous selection so
     * the calendar can be used again.
     */
    input.value = "";

    /*
     * Open the native date picker.
     */
    if (typeof input.showPicker === "function") {
        input.showPicker();
    } else {
        input.click();
    }
}


function addDateValueToGroup(
    groupId,
    date
) {

    const group =
        getGroup(groupId);

    if (!group || !date) {
        return;
    }

    /*
     * Do not allow duplicate date
     * inside the same group.
     */
    if (
        isDateSelectedInGroup(
            group,
            date
        )
    ) {
        return;
    }

    group.dates.push(date);

    group.dates.sort();

    renderDateGroups();

    if (allTransactions !== null) {
        renderReportFromCachedData();
    }
}


/* ============================================================
   REMOVE DATE FROM GROUP
   ============================================================ */

function removeDateFromGroup(
    groupId,
    date
) {

    const group =
        getGroup(groupId);

    if (!group) {
        return;
    }

    group.dates =
        group.dates.filter(
            d => d !== date
        );

    /*
     * Removed date cannot remain highlighted.
     */
    highlightedDates =
        highlightedDates.filter(
            d => d !== date
        );

    renderDateGroups();

    renderHighlightedDates();

    if (allTransactions !== null) {
        renderReportFromCachedData();
    }
}


/* ============================================================
   RENDER DATE GROUPS
   ============================================================ */

function renderDateGroups() {

    const container =
        document.getElementById(
            "dateGroups"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!dateGroups.length) {

        const empty =
            document.createElement(
                "span"
            );

        empty.className =
            "no-selected-dates";

        empty.textContent =
            "No groups created";

        container.appendChild(
            empty
        );

        return;
    }


    dateGroups.forEach(
        (group, index) => {

            const groupElement =
                document.createElement(
                    "div"
                );

            groupElement.className =
                "date-group";


            /* -----------------------------
               GROUP HEADER
               ----------------------------- */

            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "date-group-header";


            const title =
                document.createElement(
                    "span"
                );

            title.className =
                "date-group-title";

            title.textContent =
                `Group ${index + 1}`;


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.className =
                "delete-group-button";

            deleteButton.textContent =
                "🗑";

            deleteButton.title =
                "Delete group";

            deleteButton.addEventListener(
                "click",
                () => {

                    if (
                        confirm(
                            `Delete Group ${index + 1}?`
                        )
                    ) {
                        deleteDateGroup(
                            group.id
                        );
                    }

                }
            );


            header.appendChild(title);

            header.appendChild(
                deleteButton
            );

            groupElement.appendChild(
                header
            );


            /* -----------------------------
               DATES
               ----------------------------- */

            const datesContainer =
                document.createElement(
                    "div"
                );

            datesContainer.className =
                "date-group-dates";


            group.dates.forEach(
                date => {

                    const chip =
                        document.createElement(
                            "div"
                        );

                    chip.className =
                        "date-chip";


                    const text =
                        document.createElement(
                            "span"
                        );

                    text.textContent =
                        formatDateDisplay(
                            date
                        );


                    const remove =
                        document.createElement(
                            "button"
                        );

                    remove.type =
                        "button";

                    remove.className =
                        "remove-date";

                    remove.textContent =
                        "×";

                    remove.title =
                        `Remove ${formatDateDisplay(
                            date
                        )}`;


                    remove.addEventListener(
                        "click",
                        () => {

                            removeDateFromGroup(
                                group.id,
                                date
                            );

                        }
                    );


                    chip.appendChild(text);

                    chip.appendChild(
                        remove
                    );

                    datesContainer.appendChild(
                        chip
                    );
                }
            );


            groupElement.appendChild(
                datesContainer
            );


            /* -----------------------------
               PREVIOUS / NEXT SUGGESTIONS
               ----------------------------- */

            if (group.dates.length) {

                const firstDate =
                    group.dates[0];

                const lastDate =
                    group.dates[
                    group.dates.length - 1
                        ];


                const previousDate =
                    addDays(
                        firstDate,
                        -1
                    );

                const nextDate =
                    addDays(
                        lastDate,
                        1
                    );


                const navigation =
                    document.createElement(
                        "div"
                    );

                navigation.className =
                    "date-group-navigation";


                /*
                 * Previous date
                 */

                if (
                    !isDateSelectedInGroup(
                        group,
                        previousDate
                    )
                ) {

                    const button =
                        document.createElement(
                            "button"
                        );

                    button.type =
                        "button";

                    button.className =
                        "date-navigation-option";

                    button.textContent =
                        `← ${formatDateDisplay(
                            previousDate
                        )}`;

                    button.title =
                        `Add ${formatDateDisplay(
                            previousDate
                        )}`;


                    button.addEventListener(
                        "click",
                        () => {

                            addDateValueToGroup(
                                group.id,
                                previousDate
                            );

                        }
                    );


                    navigation.appendChild(
                        button
                    );
                }


                /*
                 * Next date
                 */

                if (
                    !isDateSelectedInGroup(
                        group,
                        nextDate
                    )
                ) {

                    const button =
                        document.createElement(
                            "button"
                        );

                    button.type =
                        "button";

                    button.className =
                        "date-navigation-option";

                    button.textContent =
                        `${formatDateDisplay(
                            nextDate
                        )} →`;

                    button.title =
                        `Add ${formatDateDisplay(
                            nextDate
                        )}`;


                    button.addEventListener(
                        "click",
                        () => {

                            addDateValueToGroup(
                                group.id,
                                nextDate
                            );

                        }
                    );


                    navigation.appendChild(
                        button
                    );
                }


                if (
                    navigation.children.length
                ) {

                    groupElement.appendChild(
                        navigation
                    );
                }
            }


            /* -----------------------------
               ADD DATE BUTTON
               ----------------------------- */

            const addButton =
                document.createElement(
                    "button"
                );

            addButton.type =
                "button";

            addButton.className =
                "add-group-date-button";

            addButton.textContent =
                "+ Add Date";


            addButton.addEventListener(
                "click",
                () => {

                    addDateToGroup(
                        group.id
                    );

                }
            );


            groupElement.appendChild(
                addButton
            );


            container.appendChild(
                groupElement
            );
        }
    );
}


/* ============================================================
   HIGHLIGHTED DATES
   ============================================================ */

function addHighlightedDate(date) {

if (!date) {
    return;
}

if (highlightedDates.includes(date)) {
    highlightedDates =
        highlightedDates.filter(
            d => d !== date
        );
} else {
    highlightedDates.push(date);
    highlightedDates.sort();
}

renderHighlightedDates();
applyDateHighlights();
}


function removeHighlightedDate(date) {

    highlightedDates =
        highlightedDates.filter(
            d => d !== date
        );

    renderHighlightedDates();

    applyDateHighlights();
}


function renderHighlightedDates() {

    const container =
        document.getElementById(
            "highlightedDates"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";


    if (!highlightedDates.length) {

        const empty =
            document.createElement(
                "span"
            );

        empty.className =
            "no-highlighted-dates";

        empty.textContent =
            "Click a date in the report";

        container.appendChild(
            empty
        );

        return;
    }


    highlightedDates.forEach(
        date => {

            const chip =
                document.createElement(
                    "div"
                );

            chip.className =
                "highlighted-date-chip";


            const text =
                document.createElement(
                    "span"
                );

            text.textContent =
                formatDateDisplay(
                    date
                );


            const remove =
                document.createElement(
                    "button"
                );

            remove.type =
                "button";

            remove.className =
                "remove-highlight";

            remove.textContent =
                "×";

            remove.title =
                `Remove ${formatDateDisplay(
                    date
                )}`;


            remove.addEventListener(
                "click",
                () => {

                    removeHighlightedDate(
                        date
                    );

                }
            );


            chip.appendChild(text);

            chip.appendChild(remove);

            container.appendChild(
                chip
            );
        }
    );
}


function applyDateHighlights() {

    document
        .querySelectorAll(
            "#yearReports .highlight-date-header"
        )
        .forEach(
            element => {

                element.classList.remove(
                    "highlight-date-header"
                );

            }
        );


    document
        .querySelectorAll(
            "#yearReports .highlight-date-cell"
        )
        .forEach(
            element => {

                element.classList.remove(
                    "highlight-date-cell"
                );

            }
        );


    highlightedDates.forEach(
        date => {

            document
                .querySelectorAll(
                    `#yearReports [data-date="${date}"]`
                )
                .forEach(
                    element => {

                        if (
                            element.tagName === "TH"
                        ) {

                            element.classList.add(
                                "highlight-date-header"
                            );

                        } else {

                            element.classList.add(
                                "highlight-date-cell"
                            );

                        }

                    }
                );

        }
    );
}


/* ============================================================
   API / DATA FETCHING
   ============================================================ */

async function fetchData() {

    const allSelectedDates =
        getAllSelectedDates();

    if (!allSelectedDates.length) {

        alert(
            "Create a group and select at least one date"
        );

        return;
    }


    document.getElementById(
        "loading"
    ).style.display = "block";


    try {

        const json = await callSheetsApi(CONFIG.operations);


        const data1 =
            json[0]?.rows || [];

        const data2 =
            json[1]?.rows || [];


        allTransactions =
            [
                ...data1,
                ...data2
            ];


        renderReportFromCachedData();


    } catch (error) {

        console.error(
            "Fetch failed:",
            error
        );

        alert(
            "Failed to fetch data"
        );

    } finally {

        document.getElementById(
            "loading"
        ).style.display = "none";
    }
}


/* ============================================================
   FILTER CACHED DATA
   ============================================================ */

function renderReportFromCachedData() {

    if (
        allTransactions === null
    ) {
        return;
    }


    const allSelectedDates =
        getAllSelectedDates();


    const selectedSet =
        new Set(
            allSelectedDates
        );


    const filteredTransactions =
        allTransactions.filter(
            transaction => {

                if (
                    !transaction.timestamp
                ) {
                    return false;
                }


                const date =
                    formatDateToIST(
                        transaction.timestamp
                    );


                return selectedSet.has(
                    date
                );
            }
        );


    renderDateGroupReports(
        dateGroups,
        filteredTransactions
    );
}


/* ============================================================
   RENDER GROUP REPORTS
   ============================================================ */

function renderDateGroupReports(
    groups,
    transactions
) {

    const container =
        document.getElementById(
            "yearReports"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    const validGroups =
        groups.filter(
            group =>
                group.dates.length > 0
        );


    if (!validGroups.length) {

        container.innerHTML = `
            <div class="empty-state">

                <div class="empty-state-title">
                    No report generated
                </div>

                <div>
                    Create a group and add at least one date.
                </div>

            </div>
        `;

        return;
    }


    validGroups.forEach(
        (group, index) => {

            const report =
                createGroupReport(
                    group,
                    transactions,
                    index + 1
                );


            container.appendChild(
                report
            );
        }
    );


    applyDateHighlights();
}


/* ============================================================
   CREATE GROUP REPORT
   ============================================================ */

function createGroupReport(
    group,
    transactions,
    groupNumber
) {

    const report =
        document.createElement(
            "div"
        );

    report.className =
        "year-report";


    /* ========================================================
       HEADING
       ======================================================== */

    const years = [
        ...new Set(
            group.dates.map(
                date =>
                    date.substring(0, 4)
            )
        )
    ];


    const yearText =
        years.join(" / ");


    const heading =
        document.createElement(
            "h2"
        );

    heading.className =
        "year-title";


    heading.textContent =
        `${getReportTitle()} - ${yearText} - Delivery Report`;


    report.appendChild(
        heading
    );


    /* ========================================================
       TABLE
       ======================================================== */

    const table =
        document.createElement(
            "table"
        );


    const thead =
        document.createElement(
            "thead"
        );


    const headerRow =
        document.createElement(
            "tr"
        );


    /* Customer */

    const customerHeader =
        document.createElement(
            "th"
        );

    customerHeader.textContent =
        "Customer";

    customerHeader.className =
        "customer-header";


    headerRow.appendChild(
        customerHeader
    );


    /* Dates */

    group.dates.forEach(
        date => {

            const th =
                document.createElement(
                    "th"
                );


            const dateInfo =
                formatDateWithDay(
                    date
                );


            th.innerHTML = `
                <div>
                    ${dateInfo.date}
                </div>

                <div
                    style="
                        font-size: 11px;
                        font-weight: 400;
                        margin-top: 3px;
                    "
                >
                    ${dateInfo.day}
                </div>
            `;


            th.title =
                formatDateDisplay(
                    date
                );


            th.dataset.date =
                date;


            th.className =
                "clickable-date";


            th.addEventListener(
                "click",
                () => {

                    addHighlightedDate(
                        date
                    );

                }
            );


            headerRow.appendChild(
                th
            );
        }
    );


    /* Total */

    const totalHeader =
        document.createElement(
            "th"
        );


    totalHeader.textContent =
        "Total";


    totalHeader.className =
        "total-header";


    headerRow.appendChild(
        totalHeader
    );


    thead.appendChild(
        headerRow
    );


    table.appendChild(
        thead
    );


    /* ========================================================
       AGGREGATION
       ======================================================== */

    const customers = {};

    const dateSums = {};


    group.dates.forEach(
        date => {

            dateSums[date] = 0;

        }
    );


    transactions.forEach(
        transaction => {

            const date =
                formatDateToIST(
                    transaction.timestamp
                );


            if (
                !group.dates.includes(
                    date
                )
            ) {
                return;
            }


            const name =
                transaction.name ||
                "Unknown";


            const kg =
                Number(
                    transaction.deliveredKg
                ) || 0;


            if (
                !customers[name]
            ) {

                customers[name] = {};

            }


            customers[name][date] =
                (
                    customers[name][date] ||
                    0
                ) + kg;


            dateSums[date] =
                (
                    dateSums[date] ||
                    0
                ) + kg;
        }
    );


    /* ========================================================
   CUSTOMER ROWS
   ======================================================== */

const tbody =
document.createElement(
    "tbody"
);

const customerNames =
Object.keys(
    customers
).sort(
    (a, b) =>
        a.localeCompare(b)
);


/*
 * Sort customers by their total
 * delivered KG in descending order.
 */
const sortedCustomers =
customerNames
    .map(customer => {

        const customerTotal =
            group.dates.reduce(
                (sum, date) => {

                    const kg =
                        customers[customer]?.[date] ||
                        0;

                    return sum + kg;
                },
                0
            );

        return {
            customer,
            customerTotal
        };
    })
    .sort(
        (a, b) =>
            b.customerTotal -
            a.customerTotal
    );


sortedCustomers.forEach(
({ customer, customerTotal }) => {

    const row =
        document.createElement(
            "tr"
        );


    const customerCell =
        document.createElement(
            "td"
        );


    customerCell.textContent =
        customer;


    customerCell.className =
        "customer-cell";


    row.appendChild(
        customerCell
    );


    group.dates.forEach(
        date => {

            const kg =
                customers[customer][date] ||
                0;


            const cell =
                document.createElement(
                    "td"
                );


            cell.textContent =
                formatKg(
                    kg
                );


            cell.dataset.date =
                date;


            row.appendChild(
                cell
            );
        }
    );


    const totalCell =
        document.createElement(
            "td"
        );


    totalCell.textContent =
        formatKg(
            customerTotal
        );


    totalCell.className =
        "total-col";


    row.appendChild(
        totalCell
    );


    tbody.appendChild(
        row
    );
}
);


    /* ========================================================
       GRAND TOTAL
       ======================================================== */

    const totalRow =
        document.createElement(
            "tr"
        );


    totalRow.className =
        "total-row";


    const totalLabel =
        document.createElement(
            "td"
        );


    totalLabel.textContent =
        "Total";


    totalLabel.className =
        "customer-cell";


    totalRow.appendChild(
        totalLabel
    );


    let grandTotal = 0;


    group.dates.forEach(
        date => {

            const value =
                dateSums[date] ||
                0;


            grandTotal +=
                value;


            const cell =
                document.createElement(
                    "td"
                );


            cell.textContent =
                formatKg(
                    value
                );


            cell.dataset.date =
                date;


            totalRow.appendChild(
                cell
            );
        }
    );


    const grandTotalCell =
        document.createElement(
            "td"
        );


    grandTotalCell.textContent =
        formatKg(
            grandTotal
        );


    grandTotalCell.className =
        "total-col";


    totalRow.appendChild(
        grandTotalCell
    );


    tbody.appendChild(
        totalRow
    );


    table.appendChild(
        tbody
    );


    report.appendChild(
        table
    );


    return report;
}


/* ============================================================
   NUMBER FORMATTING
   ============================================================ */

function formatKg(value) {

const number =
    Number(value) || 0;

if (number === 0) {
    return "-";
}

return number.toLocaleString(
    "en-IN",
    {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    }
);
}

/* ============================================================
   PRINT
   ============================================================ */

function printReport() {

    window.print();

}


/* ============================================================
   SHARE AS LINK
   ============================================================
   The link carries the whole report setup in its query string, so opening it rebuilds the same
   report: ?title=…&g=<dates of group 1>&g=<dates of group 2>&h=<highlighted dates>.
   Dates are YYYY-MM-DD joined by commas; an empty `g=` keeps an empty group. Data is not in the
   link: it is fetched fresh on open (behind the password gate, like any app page). */

const SHARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildShareLink() {

    const params = new URLSearchParams();

    params.set("title", getReportTitle());

    dateGroups.forEach(group =>
        params.append("g", group.dates.join(","))
    );

    if (highlightedDates.length) {
        params.set("h", highlightedDates.join(","));
    }

    const url = new URL(location.href);
    url.search = params.toString();
    url.hash = "";
    return url.href;
}


function parseShareDates(value) {

    return [...new Set(
        String(value || "")
            .split(",")
            .map(d => d.trim())
            .filter(d => SHARE_DATE.test(d))
    )].sort();
}


async function shareReportLink() {

    const status =
        document.getElementById("shareStatus");

    if (!getAllSelectedDates().length) {
        Mb.setStatus(status, "error", "Add at least one date before sharing.");
        return;
    }

    const link = buildShareLink();

    // Keep the address bar in step, so a refresh or bookmark gives the same report too.
    history.replaceState(null, "", link);

    // Phones: the share sheet (WhatsApp etc.). Elsewhere: copy to the clipboard.
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        try {
            await navigator.share({ title: `${getReportTitle()} - Delivery Report`, url: link });
            Mb.setStatus(status, null);
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }

    try {
        await navigator.clipboard.writeText(link);
        Mb.setStatus(status, "success", "Link copied. Anyone opening it sees this report after unlocking.");
    } catch {
        // Clipboard blocked (e.g. plain http): show the link so it can be copied by hand.
        Mb.setStatus(status, "info", link);
        status.querySelector(".spinner")?.remove();
    }
}


// Rebuild the report from a shared link's query string; returns true when it held any dates.
function restoreFromShareLink() {

    const params = new URLSearchParams(location.search);

    if (!params.has("g")) {
        return false;
    }

    const title = params.get("title");
    const titleInput = document.getElementById("reportTitle");

    if (title !== null && titleInput) {
        titleInput.value = title;
        const banner = document.getElementById("reportBanner");
        if (banner) banner.textContent = `${getReportTitle()} - Delivery Report`;
    }

    dateGroups = params.getAll("g").map(value => ({
        id: nextGroupId++,
        dates: parseShareDates(value)
    }));

    highlightedDates = parseShareDates(params.get("h"));

    renderDateGroups();
    renderHighlightedDates();

    return getAllSelectedDates().length > 0;
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const calendarDate =
            document.getElementById("calendarDate");

        if (calendarDate) {

            calendarDate.addEventListener(
                "change",
                () => {

                    const groupId =
                        Number(
                            calendarDate.dataset.groupId
                        );

                    const date =
                        calendarDate.value;

                    if (!groupId || !date) {
                        return;
                    }

                    addDateValueToGroup(
                        groupId,
                        date
                    );

                    calendarDate.value = "";
                    calendarDate.dataset.groupId = "";
                }
            );
        }

        renderDateGroups();

        renderHighlightedDates();


        const banner =
            document.getElementById(
                "reportBanner"
            );


        if (banner) {

            banner.textContent =
                `${getReportTitle()} - Delivery Report`;

        }


        const reportTitleInput =
            document.getElementById(
                "reportTitle"
            );


        if (reportTitleInput) {

            reportTitleInput.addEventListener(
                "input",
                () => {

                    if (banner) {

                        banner.textContent =
                            `${getReportTitle()} - Delivery Report`;

                    }


                    if (
                        allTransactions !== null
                    ) {

                        renderReportFromCachedData();

                    }

                }
            );
        }


        // Opened from a shared link: rebuild the setup and load the report straight away.
        if (restoreFromShareLink()) {

            fetchData();

        }

    }
);


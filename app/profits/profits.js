// Register Chart.js plugins
Chart.register(ChartDataLabels);

let chartInstances = {};
let rawData = null;

// Axis, legend and grid colours from the site theme tokens (light or black, see assets/css/site.css).
function chartTheme() {
    const css = getComputedStyle(document.documentElement);
    const token = name => css.getPropertyValue(name).trim();
    return {
        legend: token('--text-muted'),
        ticks: token('--text-subtle'),
        grid: token('--border'),
        surface: token('--surface'),
        dark: document.documentElement.dataset.theme === 'dark'
    };
}

// Redraw every chart in the new theme, keeping each chart's chosen grouping.
function redrawCharts() {
    if (!rawData) return;
    const group = chart => document.querySelector(`.control-btn.active[data-chart="${chart}"]`)?.dataset.group || 'month';
    updateProfitChart(group('profit'));
    updateExpensesChart(group('expenses'));
    updateDueBalanceChart(group('dueBalance'));
    updateProfitPerKgChart(group('profitPerKg'));
    updateTotalExpensesChart(group('totalExpenses'));
    updateActualMoneyChart(group('actualMoney'));
    updateActualMoneyBarChart(group('actualMoneyBar'));
    updateActualMoneyLast12MonthsChart();
    updateKgComparisonChart(group('kgComparison'));
    updateProfitComparisonChart(group('profitComparison'));
    updateActualMoneyComparisonChart(group('actualMoneyComparison'));
    updateCustomOverlapChart();
    updateCustomLinearChart();
}

async function fetchData() {
    try {
        rawData = await callSheetsApi([{
            type: "SELECT",
            spreadsheetId: MAIN_SHEET_ID,
            worksheet: "cumilativeCalculations",
            id: "f6893973-f58c-4c10-a219-d9b281138026-1740944738031"
        }]);

        updateDashboard();

    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

function updateDashboard() {
    if (!rawData || !rawData[0] || !rawData[0].rows) return;

    updateKPIs();
    updateProfitChart('month');
    updateExpensesChart('month');
    updateDueBalanceChart('month');
    updateProfitPerKgChart('month');
    updateTotalExpensesChart('month');
    updateActualMoneyChart('month');
    populateBarChartYearFilters();
    updateActualMoneyBarChart('month');
    updateActualMoneyLast12MonthsChart();
    updateKgComparisonChart('month');
    updateProfitComparisonChart('month');
    updateActualMoneyComparisonChart('month');

    populateCustomGraphDropdowns();
    updateCustomOverlapChart();
    updateCustomLinearChart();
}

function getMonthName(monthIndex) {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex];
}

function getWeek(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((((date - firstDay) / 86400000) + firstDay.getDay() + 1) / 7);
}

function formatDate(date, groupBy, includeYear = true) {
    switch (groupBy) {
        case 'day': {
            const dayStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return includeYear ? `${date.getFullYear()}-${dayStr}` : dayStr;
        }
        case 'week': {
            const weekStr = `W${getWeek(date)}`;
            return includeYear ? `${date.getFullYear()} ${weekStr}` : weekStr;
        }
        case 'month': {
            const monthStr = getMonthName(date.getMonth());
            return includeYear ? `${monthStr} ${date.getFullYear()}` : monthStr;
        }
        case 'year':
            return `${date.getFullYear()}`;
        default:
            return '';
    }
}

function destroyChart(chartId) {
    if (chartInstances[chartId]) {
        chartInstances[chartId].destroy();
        chartInstances[chartId] = null;
    }
}

function updateKPIs() {
    if (!rawData || !rawData[0] || !rawData[0].rows) return;

    let latestDueBalance = 0;
    let totalKg = 0;
    let totalTrips = 0;
    let latestDate = null;

    rawData[0].rows.forEach(entry => {
        totalKg += parseFloat(entry.kg) || 0;
        totalTrips++;

        if (entry.date && entry.new_due_balance !== undefined && entry.new_due_balance !== "#N/A") {
            const date = new Date(entry.date);
            if (!isNaN(date.getTime())) {
                if (!latestDate || date > latestDate) {
                    latestDate = date;
                    latestDueBalance = parseFloat(entry.new_due_balance) || 0;
                }
            }
        }
    });

    const dueBalanceElement = document.getElementById('dueBalance');
    const totalKgElement = document.getElementById('totalKgHandled');
    const totalTripsElement = document.getElementById('totalTrips');

    if (dueBalanceElement) {
        dueBalanceElement.textContent = `₹${latestDueBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }
    if (totalKgElement) {
        totalKgElement.textContent = `${totalKg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} KG`;
    }
    if (totalTripsElement) {
        totalTripsElement.textContent = totalTrips;
    }
}

function groupDataByPeriod(groupBy, field) {
    const grouped = {};
    const dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        if (!grouped[key]) {
            grouped[key] = 0;
            dateMap[key] = date;
        }
        grouped[key] += parseFloat(entry[field]) || 0;
    });

    const labels = Object.keys(grouped).sort((a, b) => dateMap[a] - dateMap[b]);
    return { labels, values: labels.map(label => grouped[label]) };
}

function getChartConfig(type = 'line') {
    const theme = chartTheme();
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                display: true,
                labels: { font: { size: 12, weight: 600 }, color: theme.legend }
            },
            datalabels: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { drawBorder: false, color: theme.grid },
                ticks: { color: theme.ticks }
            },
            x: {
                grid: { display: false },
                ticks: { color: theme.ticks }
            }
        }
    };
}

function updateProfitChart(groupBy) {
    if (!rawData) return;
    const { labels, values } = groupDataByPeriod(groupBy, 'profit');
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;

    destroyChart('profitChart');
    chartInstances['profitChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Profit',
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: chartTheme().surface,
                pointBorderWidth: 1
            }]
        },
        options: getChartConfig()
    });
}

function updateExpensesChart(groupBy) {
    if (!rawData) return;

    const groupedCar = {}, groupedLabour = {}, groupedExtra = {}, dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        if (!groupedCar[key]) {
            groupedCar[key] = 0;
            groupedLabour[key] = 0;
            groupedExtra[key] = 0;
            dateMap[key] = date;
        }

        groupedCar[key] += parseFloat(entry.car_expense) || 0;
        groupedLabour[key] += parseFloat(entry.labour_expense) || 0;
        groupedExtra[key] += parseFloat(entry.extra_expenses) || 0;
    });

    const labels = Object.keys(groupedCar).sort((a, b) => dateMap[a] - dateMap[b]);
    const ctx = document.getElementById('expensesChart');
    if (!ctx) return;

    destroyChart('expensesChart');
    chartInstances['expensesChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Car Expense',
                    data: labels.map(label => groupedCar[label]),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                },
                {
                    label: 'Labour Expense',
                    data: labels.map(label => groupedLabour[label]),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                },
                {
                    label: 'Extra Expense',
                    data: labels.map(label => groupedExtra[label]),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.05)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                }
            ]
        },
        options: getChartConfig()
    });
}

function updateDueBalanceChart(groupBy) {
    if (!rawData) return;

    const grouped = {}, dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        const value = parseFloat(entry.new_due_balance);
        if (isNaN(value)) return;

        if (!grouped[key] || date > grouped[key].date) {
            grouped[key] = { value, date };
            dateMap[key] = date;
        }
    });

    const labels = Object.keys(grouped).sort((a, b) => dateMap[a] - dateMap[b]);
    const ctx = document.getElementById('dueBalanceChart');
    if (!ctx) return;

    destroyChart('dueBalanceChart');
    chartInstances['dueBalanceChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Due Balance',
                data: labels.map(label => grouped[label].value),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: getChartConfig()
    });
}

function updateProfitPerKgChart(groupBy) {
    if (!rawData) return;

    const groupedProfit = {}, groupedKg = {}, dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        if (!groupedProfit[key]) {
            groupedProfit[key] = 0;
            groupedKg[key] = 0;
            dateMap[key] = date;
        }

        groupedProfit[key] += parseFloat(entry.profit) || 0;
        groupedKg[key] += parseFloat(entry.kg) || 0;
    });

    const labels = Object.keys(groupedProfit).sort((a, b) => dateMap[a] - dateMap[b]);
    const values = labels.map(label => groupedKg[label] ? groupedProfit[label] / groupedKg[label] : 0);
    const ctx = document.getElementById('profitPerKgChart');
    if (!ctx) return;

    destroyChart('profitPerKgChart');
    chartInstances['profitPerKgChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Profit per KG',
                data: values,
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#06b6d4'
            }]
        },
        options: getChartConfig()
    });
}

function updateTotalExpensesChart(groupBy) {
    if (!rawData) return;

    const grouped = {}, dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        if (!grouped[key]) {
            grouped[key] = 0;
            dateMap[key] = date;
        }

        const car = parseFloat(entry.car_expense) || 0;
        const labour = parseFloat(entry.labour_expense) || 0;
        const extra = parseFloat(entry.extra_expenses) || 0;
        grouped[key] += car + labour + extra;
    });

    const labels = Object.keys(grouped).sort((a, b) => dateMap[a] - dateMap[b]);
    const ctx = document.getElementById('totalExpensesChart');
    if (!ctx) return;

    destroyChart('totalExpensesChart');
    chartInstances['totalExpensesChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Total Expenses',
                data: labels.map(label => grouped[label]),
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 2
            }]
        },
        options: getChartConfig()
    });
}

function updateActualMoneyChart(groupBy) {
    if (!rawData) return;

    const grouped = {}, dateMap = {};
    const periodData = {}; // Track transactions per period

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy);
        if (!periodData[key]) {
            periodData[key] = [];
            dateMap[key] = date;
        }
        periodData[key].push(entry);
    });

    // Calculate actualMoney at period level
    Object.keys(periodData).forEach(key => {
        const transactions = periodData[key];

        // Sum profits for the period
        const totalProfit = transactions.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

        // Get starting and ending due balances for the period
        const firstTransaction = transactions[0];
        const lastTransaction = transactions[transactions.length - 1];

        const startingDueBalance = parseFloat(firstTransaction.prev_due_balance) || 0;
        const endingDueBalance = parseFloat(lastTransaction.new_due_balance) || 0;

        // Debt change = how much due balance increased/decreased
        const debtChange = endingDueBalance - startingDueBalance;

        // Actual money = profit - debt change
        // (negative debt change = customer payments reducing balance = more cash in)
        grouped[key] = totalProfit - debtChange;
    });

    const labels = Object.keys(grouped).sort((a, b) => dateMap[a] - dateMap[b]);
    const ctx = document.getElementById('actualMoneyChart');
    if (!ctx) return;

    destroyChart('actualMoneyChart');
    chartInstances['actualMoneyChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Actual Money Received',
                data: labels.map(label => grouped[label]),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#8b5cf6'
            }]
        },
        options: getChartConfig()
    });
}

function getAvailableYearsForBar() {
    if (!rawData || !rawData[0] || !rawData[0].rows) return [];

    const yearsSet = new Set();
    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (!isNaN(date.getTime())) {
            yearsSet.add(date.getFullYear());
        }
    });

    return [...yearsSet].sort((a, b) => b - a); // Newest first
}

function populateBarChartYearFilters() {
    const years = getAvailableYearsForBar();
    const container = document.getElementById('barChartYearFilters');
    if (!container) return;

    container.innerHTML = '';
    years.forEach(year => {
        const label = document.createElement('label');
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.marginRight = '15px';
        label.style.cursor = 'pointer';
        label.style.gap = '6px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = year;
        checkbox.checked = true;
        checkbox.dataset.year = year;
        checkbox.style.cursor = 'pointer';

        const text = document.createElement('span');
        text.textContent = year;
        text.style.fontSize = '13px';
        text.style.fontWeight = '500';
        text.style.color = 'var(--text-muted)';

        label.appendChild(checkbox);
        label.appendChild(text);
        container.appendChild(label);

        checkbox.addEventListener('change', updateActualMoneyBarChart);
    });
}

function updateActualMoneyBarChart(groupBy) {
    if (!rawData) return;

    // Get selected years
    const yearCheckboxes = document.querySelectorAll('#barChartYearFilters input[type="checkbox"]');
    const selectedYears = new Set();
    yearCheckboxes.forEach(cb => {
        if (cb.checked) {
            selectedYears.add(parseInt(cb.value));
        }
    });

    if (selectedYears.size === 0) {
        // If no years selected, show all
        getAvailableYearsForBar().forEach(year => selectedYears.add(year));
    }

    // Handle both click event (has groupBy) and checkbox change (no groupBy)
    if (typeof groupBy !== 'string') {
        const timeSelect = document.getElementById('barTimeGroup');
        groupBy = timeSelect ? timeSelect.value : 'month';
    }

    const periodByYear = {}, dateMap = {}, yearsSet = new Set();
    const breakdownMap = {}; // Store profit and debt change for each period-year

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();
        if (!selectedYears.has(year)) return;

        const key = formatDate(date, groupBy, false); // Period without year
        if (!periodByYear[key]) {
            periodByYear[key] = {};
            dateMap[key] = date;
        }
        if (!periodByYear[key][year]) {
            periodByYear[key][year] = [];
        }
        periodByYear[key][year].push(entry);
        yearsSet.add(year);
    });

    // Calculate actualMoney for each period-year
    const grouped = {};
    Object.keys(periodByYear).forEach(key => {
        if (!grouped[key]) grouped[key] = {};

        Object.keys(periodByYear[key]).forEach(year => {
            const transactions = periodByYear[key][year];

            // Sum profits for the period
            const totalProfit = transactions.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

            // Get starting and ending due balances for the period
            const firstTransaction = transactions[0];
            const lastTransaction = transactions[transactions.length - 1];

            const startingDueBalance = parseFloat(firstTransaction.prev_due_balance) || 0;
            const endingDueBalance = parseFloat(lastTransaction.new_due_balance) || 0;

            // Debt change = how much due balance increased/decreased
            const debtChange = endingDueBalance - startingDueBalance;

            // Actual money = profit - debt change
            grouped[key][year] = totalProfit - debtChange;

            // Store breakdown for tooltip
            breakdownMap[`${key}-${year}`] = {
                profit: totalProfit,
                debtChange: debtChange,
                actualMoney: totalProfit - debtChange
            };
        });
    });

    const sortedYears = [...yearsSet].sort((a, b) => b - a); // Newest first
    const labels = sortLabelsByPeriod(Object.keys(grouped), groupBy);
    const olderYearsCount = Math.max(0, sortedYears.length - 2);
    const grayGradient = generateGrayGradient(olderYearsCount);

    const datasets = sortedYears.map((year, index) => {
        let color;
        if (index === 0) {
            color = '#8b5cf6'; // Current: Purple
        } else if (index === 1) {
            color = '#a78bfa'; // Previous: Light Purple
        } else {
            // Older years: dark gray → light gray
            const grayIndex = Math.min(index - 2, grayGradient.length - 1);
            color = grayGradient[grayIndex];
        }

        return {
            label: `${year}`,
            data: labels.map(label => grouped[label][year] || 0),
            backgroundColor: color,
            borderColor: color,
            borderWidth: 1
        };
    });

    const ctx = document.getElementById('actualMoneyBarChart');
    if (!ctx) return;

    destroyChart('actualMoneyBarChart');

    const baseConfig = getChartConfig();
    chartInstances['actualMoneyBarChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: baseConfig.responsive,
            maintainAspectRatio: baseConfig.maintainAspectRatio,
            interaction: baseConfig.interaction,
            plugins: {
                legend: baseConfig.plugins.legend,
                datalabels: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const periodLabel = context.label;
                            const year = parseInt(label);
                            const breakdown = breakdownMap[`${periodLabel}-${year}`];

                            if (!breakdown) {
                                return `${label}: ₹${context.parsed.y.toLocaleString('en-IN')}`;
                            }

                            const profit = breakdown.profit;
                            const debt = breakdown.debtChange;
                            const actual = breakdown.actualMoney;

                            return [
                                `↓ ₹${profit.toLocaleString('en-IN')} (profit)`,
                                `→ ₹${Math.abs(debt).toLocaleString('en-IN')} (debt${debt > 0 ? ' increase' : ' decrease'})`,
                                `= ₹${actual.toLocaleString('en-IN')} (actual)`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ...baseConfig.scales.x,
                    stacked: false
                },
                y: {
                    ...baseConfig.scales.y,
                    stacked: false
                }
            }
        }
    });
}

function updateActualMoneyComparisonChart(groupBy) {
    if (!rawData) return;

    const grouped = {}, yearsSet = new Set(), dateMap = {};
    const periodTransactions = {}; // Track transactions per period-year

    // First, group transactions by period (without year) and collect all
    const transactionsByPeriod = {};
    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, groupBy, false); // Period without year
        const year = date.getFullYear();

        if (!transactionsByPeriod[key]) {
            transactionsByPeriod[key] = {};
        }
        if (!transactionsByPeriod[key][year]) {
            transactionsByPeriod[key][year] = [];
        }
        transactionsByPeriod[key][year].push(entry);

        yearsSet.add(year);
        if (!dateMap[key]) dateMap[key] = date;
    });

    // Calculate actualMoney at period-year level
    Object.keys(transactionsByPeriod).forEach(key => {
        if (!grouped[key]) grouped[key] = {};

        Object.keys(transactionsByPeriod[key]).forEach(year => {
            const transactions = transactionsByPeriod[key][year];

            // Sum profits for the period-year
            const totalProfit = transactions.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

            // Get starting and ending due balances
            const firstTransaction = transactions[0];
            const lastTransaction = transactions[transactions.length - 1];

            const startingDueBalance = parseFloat(firstTransaction.prev_due_balance) || 0;
            const endingDueBalance = parseFloat(lastTransaction.new_due_balance) || 0;

            // Debt change and actual money
            const debtChange = endingDueBalance - startingDueBalance;
            grouped[key][year] = totalProfit - debtChange;
        });
    });

    const sortedYears = [...yearsSet].sort((a, b) => b - a); // Newest first
    const labels = sortLabelsByPeriod(Object.keys(grouped), groupBy);
    const olderYearsCount = Math.max(0, sortedYears.length - 2);
    const grayGradient = generateGrayGradient(olderYearsCount);

    const datasets = sortedYears.map((year, index) => {
        let color;
        if (index === 0) {
            color = '#8b5cf6'; // Current: Purple
        } else if (index === 1) {
            color = '#a78bfa'; // Previous: Light Purple
        } else {
            // Older years: dark gray → light gray
            const grayIndex = Math.min(index - 2, grayGradient.length - 1);
            color = grayGradient[grayIndex];
        }

        return {
            label: `${year}`,
            data: labels.map(label => grouped[label][year] || 0),
            borderColor: color,
            backgroundColor: color + '15',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 2
        };
    });

    const ctx = document.getElementById('actualMoneyComparisonChart');
    if (!ctx) return;

    destroyChart('actualMoneyComparisonChart');
    chartInstances['actualMoneyComparisonChart'] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: getChartConfig()
    });
}

function updateActualMoneyLast12MonthsChart() {
    if (!rawData) return;

    const grouped = {}, dateMap = {};
    const periodData = {}; // Track transactions per period
    const breakdownMap = {}; // Store profit and debt change for tooltip

    rawData[0].rows.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const key = formatDate(date, 'month', true); // Month with year
        if (!periodData[key]) {
            periodData[key] = [];
            dateMap[key] = date;
        }
        periodData[key].push(entry);
    });

    // Calculate actualMoney at month level
    Object.keys(periodData).forEach(key => {
        const transactions = periodData[key];

        // Sum profits for the month
        const totalProfit = transactions.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

        // Get starting and ending due balances for the month
        const firstTransaction = transactions[0];
        const lastTransaction = transactions[transactions.length - 1];

        const startingDueBalance = parseFloat(firstTransaction.prev_due_balance) || 0;
        const endingDueBalance = parseFloat(lastTransaction.new_due_balance) || 0;

        // Debt change = how much due balance increased/decreased
        const debtChange = endingDueBalance - startingDueBalance;

        // Actual money = profit - debt change
        const actualMoney = totalProfit - debtChange;
        grouped[key] = actualMoney;

        // Store breakdown for tooltip
        breakdownMap[key] = {
            profit: totalProfit,
            debtChange: debtChange,
            actualMoney: actualMoney
        };
    });

    // Get labels sorted by date and get last 12 months
    const labels = Object.keys(grouped).sort((a, b) => dateMap[a] - dateMap[b]);
    const last12Labels = labels.slice(-12); // Get last 12 months
    const last12Values = last12Labels.map(label => grouped[label]);

    const ctx = document.getElementById('actualMoneyLast12MonthsChart');
    if (!ctx) return;

    destroyChart('actualMoneyLast12MonthsChart');

    const baseConfig = getChartConfig();
    chartInstances['actualMoneyLast12MonthsChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last12Labels,
            datasets: [{
                label: 'Actual Money Received (Last 12 Months)',
                data: last12Values,
                backgroundColor: '#8b5cf6',
                borderColor: '#8b5cf6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: baseConfig.responsive,
            maintainAspectRatio: baseConfig.maintainAspectRatio,
            interaction: baseConfig.interaction,
            plugins: {
                legend: baseConfig.plugins.legend,
                datalabels: {
                    display: true,
                    color: chartTheme().ticks,
                    font: { weight: 'bold', size: 11 },
                    anchor: 'end',
                    align: 'end',
                    offset: 4,
                    formatter: (value) => {
                        if (value === 0) return '';
                        return value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            const periodLabel = context.label;
                            const breakdown = breakdownMap[periodLabel];

                            if (!breakdown) {
                                return `₹${context.parsed.y.toLocaleString('en-IN')}`;
                            }

                            const profit = breakdown.profit;
                            const debt = breakdown.debtChange;
                            const actual = breakdown.actualMoney;

                            return [
                                `↓ ₹${profit.toLocaleString('en-IN')} (profit)`,
                                `→ ₹${Math.abs(debt).toLocaleString('en-IN')} (debt${debt > 0 ? ' increase' : ' decrease'})`,
                                `= ₹${actual.toLocaleString('en-IN')} (actual)`
                            ];
                        }
                    }
                }
            },
            scales: baseConfig.scales
        }
    });
}

function groupDataByPeriodMultiYear(groupBy, field) {
    const grouped = {}, yearsSet = new Set(), dateMap = {};

    rawData[0].rows.forEach(entry => {
        if (!entry.date || entry[field] === "#N/A") return;
        const date = new Date(entry.date);
        if (isNaN(date.getTime())) return;

        const value = parseFloat(entry[field]);
        if (isNaN(value)) return;

        const key = formatDate(date, groupBy, false);
        const year = date.getFullYear();

        yearsSet.add(year);
        if (!dateMap[key]) dateMap[key] = date;
        if (!grouped[key]) grouped[key] = {};
        if (grouped[key][year] === undefined) grouped[key][year] = 0;

        grouped[key][year] += value;
    });

    return { grouped, yearsSet: [...yearsSet].sort(), dateMap };
}

function sortLabelsByPeriod(labels, groupBy) {
    const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return labels.sort((a, b) => {
        if (groupBy === 'month') {
            // Extract month names and sort by their index
            const monthA = monthOrder.findIndex(m => a.includes(m));
            const monthB = monthOrder.findIndex(m => b.includes(m));

            if (monthA !== monthB) {
                return monthA - monthB;
            }

            // If same month, sort by year
            const yearA = parseInt(a.match(/\d{4}/)?.[0] || 0);
            const yearB = parseInt(b.match(/\d{4}/)?.[0] || 0);
            return yearA - yearB;
        }

        if (groupBy === 'week') {
            return parseInt(a.substring(1)) - parseInt(b.substring(1));
        }

        if (groupBy === 'day') {
            const [aMonth, aDay] = a.split('-').map(Number);
            const [bMonth, bDay] = b.split('-').map(Number);
            return (aMonth * 100 + aDay) - (bMonth * 100 + bDay);
        }

        if (groupBy === 'year') {
            return parseInt(a) - parseInt(b);
        }

        return a.localeCompare(b);
    });
}

function generateGrayGradient(count) {
    if (count <= 0) return [];

    // Dark gray to medium gray (not too light/faded); on the black theme, light gray to medium gray
    const darkGray = chartTheme().dark ? { r: 209, g: 213, b: 219 } : { r: 75, g: 85, b: 99 }; // #d1d5db : #4b5563
    const mediumGray = chartTheme().dark ? { r: 107, g: 114, b: 128 } : { r: 156, g: 163, b: 175 }; // #6b7280 : #9ca3af

    const gradient = [];
    for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0.5 : i / (count - 1);
        const r = Math.round(darkGray.r + (mediumGray.r - darkGray.r) * ratio);
        const g = Math.round(darkGray.g + (mediumGray.g - darkGray.g) * ratio);
        const b = Math.round(darkGray.b + (mediumGray.b - darkGray.b) * ratio);

        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        gradient.push(hex);
    }
    return gradient;
}

function updateKgComparisonChart(groupBy) {
    if (!rawData) return;

    const { grouped, yearsSet } = groupDataByPeriodMultiYear(groupBy, 'kg');
    const labels = sortLabelsByPeriod(Object.keys(grouped), groupBy);

    const sortedYears = [...yearsSet].sort((a, b) => b - a); // Newest first
    const olderYearsCount = Math.max(0, sortedYears.length - 2);
    const grayGradient = generateGrayGradient(olderYearsCount);

    const datasets = sortedYears.map((year, index) => {
        let color;
        if (index === 0) {
            color = '#ef4444'; // Current: Red
        } else if (index === 1) {
            color = '#f59e0b'; // Previous: Amber
        } else {
            // Older years: dark gray → light gray
            const grayIndex = Math.min(index - 2, grayGradient.length - 1);
            color = grayGradient[grayIndex];
        }

        return {
            label: `${year}`,
            data: labels.map(label => grouped[label][year] || 0),
            borderColor: color,
            backgroundColor: color + '15',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 2
        };
    });

    const ctx = document.getElementById('kgComparisonChart');
    if (!ctx) return;

    destroyChart('kgComparisonChart');
    chartInstances['kgComparisonChart'] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: getChartConfig()
    });
}

function updateProfitComparisonChart(groupBy) {
    if (!rawData) return;

    const { grouped, yearsSet } = groupDataByPeriodMultiYear(groupBy, 'profit');
    const labels = sortLabelsByPeriod(Object.keys(grouped), groupBy);

    const sortedYears = [...yearsSet].sort((a, b) => b - a); // Newest first
    const olderYearsCount = Math.max(0, sortedYears.length - 2);
    const grayGradient = generateGrayGradient(olderYearsCount);

    const datasets = sortedYears.map((year, index) => {
        let color;
        if (index === 0) {
            color = '#ef4444'; // Current: Red
        } else if (index === 1) {
            color = '#f59e0b'; // Previous: Amber
        } else {
            // Older years: dark gray → light gray
            const grayIndex = Math.min(index - 2, grayGradient.length - 1);
            color = grayGradient[grayIndex];
        }

        return {
            label: `${year}`,
            data: labels.map(label => grouped[label][year] || 0),
            borderColor: color,
            backgroundColor: color + '15',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 2
        };
    });

    const ctx = document.getElementById('profitComparisonChart');
    if (!ctx) return;

    destroyChart('profitComparisonChart');
    chartInstances['profitComparisonChart'] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: getChartConfig()
    });
}

// Custom graph functionality
const CUSTOM_GRAPH_FIELD_LABELS = {
    kg: 'KG',
    profit: 'Profit',
    car_expense: 'Car Expense',
    labour_expense: 'Labour Expense',
    extra_expenses: 'Extra Expenses',
    new_due_balance: 'Due Balance'
};

function getCustomGraphContent() {
    if (!rawData || !rawData[0] || !Array.isArray(rawData[0].rows)) return [];
    return rawData[0].rows;
}

function getCustomGraphFields() {
    const content = getCustomGraphContent();
    if (!content.length) return [];

    const fields = new Set();
    content.forEach(entry => {
        Object.keys(entry).forEach(field => {
            if (field === 'date') return;
            const value = entry[field];
            if (value === null || value === undefined || value === '' || value === '#N/A') return;
            if (!isNaN(parseFloat(value))) fields.add(field);
        });
    });

    return [...fields].sort();
}

function getCustomGraphFieldLabel(field) {
    return CUSTOM_GRAPH_FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function populateCustomGraphDropdowns() {
    const fields = getCustomGraphFields();
    ['overlapYAxis', 'linearYAxis'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        const previousValue = select.value;
        select.innerHTML = '';
        fields.forEach(field => {
            const option = document.createElement('option');
            option.value = field;
            option.textContent = getCustomGraphFieldLabel(field);
            select.appendChild(option);
        });

        if (fields.includes(previousValue)) {
            select.value = previousValue;
        } else if (fields.includes('profit')) {
            select.value = 'profit';
        }
    });
}

function updateCustomOverlapChart() {
    const content = getCustomGraphContent();
    if (!content.length) return;

    const timeSelect = document.getElementById('overlapTimeGroup');
    const ySelect = document.getElementById('overlapYAxis');
    if (!timeSelect || !ySelect || !ySelect.value) return;

    const groupBy = timeSelect.value;
    const field = ySelect.value;

    const grouped = {};
    const yearsSet = new Set();

    content.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        const value = parseFloat(entry[field]);
        if (isNaN(date.getTime()) || isNaN(value)) return;

        const key = formatDate(date, groupBy, false);
        const year = date.getFullYear();

        yearsSet.add(year);
        if (!grouped[key]) grouped[key] = {};
        if (grouped[key][year] === undefined) grouped[key][year] = 0;

        grouped[key][year] += value;
    });

    const sortedYears = [...yearsSet].sort((a, b) => b - a); // Newest first
    const keys = sortLabelsByPeriod(Object.keys(grouped), groupBy);
    const olderYearsCount = Math.max(0, sortedYears.length - 2);
    const grayGradient = generateGrayGradient(olderYearsCount);

    const datasets = sortedYears.map((year, index) => {
        let color;
        if (index === 0) {
            color = '#ef4444'; // Current: Red
        } else if (index === 1) {
            color = '#f59e0b'; // Previous: Amber
        } else {
            // Older years: dark gray → light gray
            const grayIndex = Math.min(index - 2, grayGradient.length - 1);
            color = grayGradient[grayIndex];
        }

        return {
            label: `${year}`,
            data: keys.map(key => grouped[key][year] || 0),
            borderColor: color,
            backgroundColor: color + '15',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 2
        };
    });

    const ctx = document.getElementById('customOverlapChart');
    if (!ctx) return;

    destroyChart('customOverlapChart');
    chartInstances['customOverlapChart'] = new Chart(ctx, {
        type: 'line',
        data: { labels: keys, datasets },
        options: getChartConfig()
    });
}

function updateCustomLinearChart() {
    const content = getCustomGraphContent();
    if (!content.length) return;

    const timeSelect = document.getElementById('linearTimeGroup');
    const ySelect = document.getElementById('linearYAxis');
    if (!timeSelect || !ySelect || !ySelect.value) return;

    const groupBy = timeSelect.value;
    const field = ySelect.value;

    const grouped = {};
    content.forEach(entry => {
        if (!entry.date) return;
        const date = new Date(entry.date);
        const value = parseFloat(entry[field]);
        if (isNaN(date.getTime()) || isNaN(value)) return;

        const key = formatDate(date, groupBy);
        if (!grouped[key]) grouped[key] = 0;
        grouped[key] += value;
    });

    const labels = Object.keys(grouped);
    const ctx = document.getElementById('customLinearChart');
    if (!ctx) return;

    destroyChart('customLinearChart');
    chartInstances['customLinearChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: getCustomGraphFieldLabel(field),
                data: labels.map(label => grouped[label]),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 2
            }]
        },
        options: getChartConfig()
    });
}

function setupControls() {
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const chartType = this.dataset.chart;
            const groupBy = this.dataset.group;

            document.querySelectorAll(`.control-btn[data-chart="${chartType}"]`).forEach(button => button.classList.remove('active'));
            this.classList.add('active');

            const chartUpdaters = {
                profit: updateProfitChart,
                expenses: updateExpensesChart,
                dueBalance: updateDueBalanceChart,
                profitPerKg: updateProfitPerKgChart,
                totalExpenses: updateTotalExpensesChart,
                actualMoney: updateActualMoneyChart,
                actualMoneyBar: updateActualMoneyBarChart,
                kgComparison: updateKgComparisonChart,
                profitComparison: updateProfitComparisonChart,
                actualMoneyComparison: updateActualMoneyComparisonChart
            };

            if (chartUpdaters[chartType]) {
                chartUpdaters[chartType](groupBy);
            }
        });
    });

    document.getElementById('overlapTimeGroup')?.addEventListener('change', updateCustomOverlapChart);
    document.getElementById('overlapYAxis')?.addEventListener('change', updateCustomOverlapChart);
    document.getElementById('linearTimeGroup')?.addEventListener('change', updateCustomLinearChart);
    document.getElementById('linearYAxis')?.addEventListener('change', updateCustomLinearChart);
    document.getElementById('barTimeGroup')?.addEventListener('change', updateActualMoneyBarChart);
}

document.addEventListener("DOMContentLoaded", setupControls);
document.addEventListener("mb:themechange", redrawCharts);

window.addEventListener("load", fetchData);

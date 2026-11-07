// Dashboards page: Print, Share link and Share as PDF buttons (top right).
// - Print: the tab on screen, without its controls (print CSS in site.css and profits.css).
// - Share link: the address already holds view, sub, period and dates (monthly.js keeps it current).
// - Share PDF: the printed view as an A4 PDF, made in the browser. Each block (KPI row, chart, table card)
//   is captured with html2canvas in the light theme and laid onto pages so no block is cut in half,
//   unless it is taller than a page. html2canvas and jsPDF (version-pinned, jsDelivr) load on first use.
(() => {
    const $ = id => document.getElementById(id);
    const status = $('shareStatus');
    const buttons = ['printBtn', 'shareBtn', 'pdfBtn'];
    let busy = false;

    // Ready: Overview once the figures are in (rawData, profits.js); Revenue once its report is showing,
    // and on Balances once the balances are too. Watched through the DOM, so loading, errors and
    // "nothing recorded" all disable the buttons with no hooks in profits.js or monthly.js.
    const isReady = () => {
        const body = document.body;
        if (body.dataset.view === 'monthly')
            return !$('monthReport').hidden && (body.dataset.sub !== 'balances' || !$('balReport').hidden);
        try { return !!rawData?.[0]?.rows; } catch { return false; }
    };
    const update = () => {
        const ready = isReady();
        buttons.forEach(id => $(id).disabled = !ready || (busy && id === 'pdfBtn'));
        if (!ready && !busy) Mb.setStatus(status, null);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-sub'] });
    ['monthReport', 'balReport'].forEach(id => observer.observe($(id), { attributes: true, attributeFilter: ['hidden'] }));
    observer.observe($('dueBalance'), { childList: true, characterData: true, subtree: true });   // Overview KPIs filled in
    update();

    const reportTitle = () => {
        if (document.body.dataset.view !== 'monthly') return 'Dashboards';
        const heading = $('monthTitle').textContent;
        const part = document.body.dataset.sub === 'balances' ? 'Balances' : 'Sales';
        return `Revenue ${part}${heading ? ': ' + heading : ''}`;
    };

    $('printBtn').addEventListener('click', () => {
        const title = document.title;
        document.title = `${reportTitle()} · Mondal Brothers`;   // the default PDF file name
        window.print();
        document.title = title;
    });

    $('shareBtn').addEventListener('click', async () => {
        const link = location.href;
        // Phones: the share sheet (WhatsApp etc.). Elsewhere: copy to the clipboard.
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
            try {
                await navigator.share({ title: `${reportTitle()} - Mondal Brothers`, url: link });
                Mb.setStatus(status, null);
                return;
            } catch (error) {
                if (error.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(link);
            Mb.setStatus(status, 'success', 'Link copied. Anyone opening it sees this view after unlocking.');
        } catch {
            // Clipboard blocked (e.g. plain http): show the link so it can be copied by hand.
            Mb.setStatus(status, 'info', link);
            status.querySelector('.spinner')?.remove();
        }
    });

    // ---------- Share PDF ----------

    const LIBS = [
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    let libsLoad = null;
    const loadScript = src => new Promise((resolve, reject) => {
        const script = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: reject });
        document.head.append(script);
    });
    const loadLibs = () => libsLoad ??= Promise.all(LIBS.map(loadScript)).catch(error => { libsLoad = null; throw error; });

    // Wrappers are opened up; their visible children are the blocks.
    const WRAPPERS = ['monthReport', 'balReport'];
    const WRAPPER_CLASSES = ['monthly-only', 'overview-only', 'sales-only', 'balances-only'];
    const isWrapper = el => WRAPPERS.includes(el.id) || WRAPPER_CLASSES.some(c => el.classList.contains(c));
    const isShown = el => !el.hidden && !el.classList.contains('no-print') && !el.classList.contains('status')
        && el.tagName !== 'SCRIPT' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;

    function blocks() {
        const root = document.body.dataset.view === 'monthly' ? document.querySelector('.monthly-only') : document.querySelector('.overview-only');
        const out = [];
        const walk = el => [...el.children].forEach(child => {
            if (!isShown(child)) return;
            if (isWrapper(child)) walk(child);
            else out.push(child);
        });
        walk(root);
        return { root, list: out };
    }

    // The clone html2canvas draws: light theme, controls hidden as when printing.
    function prepareClone(doc) {
        doc.documentElement.removeAttribute('data-theme');
        const style = doc.createElement('style');
        style.textContent = '.no-print, .chart-controls, .year-filters { display: none !important; }'
            + ' .table-wrap { overflow: visible !important; } .card, .chart-card, .kpi-card { box-shadow: none !important; }';
        doc.head.append(style);
    }

    async function makePdf() {
        await loadLibs();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const pageW = 210, pageH = 297, margin = 10, gap = 4;
        const usableW = pageW - margin * 2;
        const { root, list } = blocks();
        const rootRect = root.getBoundingClientRect();
        const k = usableW / rootRect.width;   // mm per CSS pixel

        // Header: name and title, and when it was made.
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Mondal Brothers', margin, margin + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110);
        const made = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
        doc.text(`${reportTitle().replace(/[–—]/g, '-')}  ·  made ${made}`.replace(/·/g, '|'), margin, margin + 10);
        let y = margin + 15;

        // Blocks side by side (a grid) share a top; group them into rows by top edge.
        const rows = [];
        list.forEach(el => {
            const rect = el.getBoundingClientRect();
            const row = rows.find(r => Math.abs(r.top - rect.top) < 2);
            if (row) { row.items.push({ el, rect }); row.bottom = Math.max(row.bottom, rect.bottom); }
            else rows.push({ top: rect.top, bottom: rect.bottom, items: [{ el, rect }] });
        });

        const usableH = pageH - margin * 2;
        const jpeg = canvas => canvas.toDataURL('image/jpeg', 0.9);
        for (const row of rows) {
            const images = [];
            for (const { el, rect } of row.items) {
                const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, onclone: prepareClone });
                // Height from the capture (scale 2), not the screen: hidden controls make it shorter.
                images.push({ el, canvas, rect, offset: (rect.top - row.top) * k, h: canvas.height / 2 * k });
            }
            const rowH = Math.max(...images.map(image => image.offset + image.h));

            // One block taller than a page (a long table): slice it down the pages, between table rows where possible.
            if (images.length === 1 && rowH > usableH) {
                const { el, canvas, rect } = images[0];
                const x = margin + (rect.left - rootRect.left) * k, w = rect.width * k;
                const pxPerMm = canvas.height / rowH;
                const breaks = [...el.querySelectorAll('tr')].map(tr => (tr.getBoundingClientRect().bottom - rect.top) * k);
                let done = 0;
                while (done < rowH - 0.01) {
                    let room = pageH - margin - y;
                    if (room < 20) { doc.addPage(); y = margin; room = usableH; }
                    let part = Math.min(room, rowH - done);
                    if (done + part < rowH - 0.01) {
                        const cut = breaks.filter(b => b > done + 10 && b <= done + part).pop();
                        if (cut) part = cut - done;
                    }
                    const slice = document.createElement('canvas');
                    slice.width = canvas.width;
                    slice.height = Math.max(1, Math.round(part * pxPerMm));
                    slice.getContext('2d').drawImage(canvas, 0, Math.round(done * pxPerMm), canvas.width, slice.height, 0, 0, canvas.width, slice.height);
                    doc.addImage(jpeg(slice), 'JPEG', x, y, w, part);
                    done += part;
                    y += part;
                    if (done < rowH - 0.01) { doc.addPage(); y = margin; }
                }
                y += gap;
                continue;
            }

            // Otherwise the row goes whole: on this page if it fits, else on the next (shrunk if taller than a page).
            const scale = rowH > usableH ? usableH / rowH : 1;
            if (y + rowH * scale > pageH - margin) { doc.addPage(); y = margin; }
            images.forEach(({ canvas, rect, offset, h }) => doc.addImage(jpeg(canvas), 'JPEG',
                margin + (rect.left - rootRect.left) * k * scale, y + offset * scale,
                rect.width * k * scale, h * scale));
            y += rowH * scale + gap;
        }
        return doc.output('blob');
    }

    // The last PDF made, kept for the view it shows. Browsers allow sharing only for a few seconds after a
    // tap; a PDF that took longer is kept, and the next tap shares it straight away.
    let made = null;   // { key, file, title }
    const viewKey = () => `${location.href}|${document.body.dataset.view}|${document.body.dataset.sub}|${document.documentElement.dataset.theme || ''}|${$('showDecreased').checked}|${$('showMoneyMonths').checked}`;

    async function shareFile({ file, title }) {
        // The share sheet with the file wherever the browser can share files (phones, Windows, macOS);
        // otherwise (e.g. Firefox on a computer) it downloads.
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: `${title} - Mondal Brothers` });
                Mb.setStatus(status, null);
            } catch (error) {
                if (error.name === 'AbortError') { Mb.setStatus(status, null); return; }
                if (error.name === 'NotAllowedError') {
                    Mb.setStatus(status, 'success', 'PDF ready. Tap Share as PDF again to share it.');
                    return;
                }
                throw error;
            }
            return;
        }
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        Mb.setStatus(status, 'success', 'This browser cannot share files, so the PDF was downloaded instead.');
    }

    $('pdfBtn').addEventListener('click', async () => {
        if (busy) return;
        if (made && made.key === viewKey()) {   // already made for this view: share now, while the tap counts
            try { await shareFile(made); } catch (error) {
                console.error('Share failed:', error);
                Mb.setStatus(status, 'error', 'Could not share the PDF. Please try again.');
            }
            return;
        }
        busy = true;
        update();
        Mb.setStatus(status, 'info', 'Making the PDF…');
        try {
            const key = viewKey();
            const title = reportTitle();
            const fileName = `${title} - Mondal Brothers`.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '.pdf';
            made = { key, title, file: new File([await makePdf()], fileName, { type: 'application/pdf' }) };
            await shareFile(made);
        } catch (error) {
            console.error('PDF failed:', error);
            Mb.setStatus(status, 'error', 'Could not make the PDF. Check the connection and try again.');
        } finally {
            busy = false;
            update();
        }
    });
})();

// Share-as-PDF for statement pages (app/statement/, app/mbros-statement/). Needs the version-pinned jsPDF +
// jspdf-autotable scripts on the page. The PDF reproduces the printed page: A4 with 10 mm margins, in the
// orientation of the page's own @page rule, with the layout and colours of the print CSS. Sizes are the CSS pixel
// sizes × 0.75 (1 CSS px = 0.75 pt when printing at 100%).
(function () {
    // The PDF's built-in font has no ₹, minus sign or arrow, so swap them for ASCII.
    const pdfText = text => text.replace(/−/g, '-').replace(/₹/g, 'Rs ').replace(/→/g, '>');

    // Read a table as shown on screen: only visible columns; a single wide cell (empty state) spans them all.
    // Header rows above the last one are column groups (th colspan); they assume every grouped column is visible.
    // Columns whose th has class "even" all get the width of the widest of them.
    function visibleTable(table) {
        const headRows = [...table.tHead.rows];
        const headers = [...headRows[headRows.length - 1].cells];
        const groups = headRows.slice(0, -1).map(tr =>
            [...tr.cells].map(th => ({ content: th.textContent.trim().toUpperCase(), colSpan: th.colSpan, className: th.className })));
        const visible = headers.map((th, i) => i).filter(i => getComputedStyle(headers[i]).display !== 'none');
        const columnStyles = {};
        // Dates and numbers never wrap ('wrap' sizes the column to its content); text columns take the rest.
        visible.forEach((i, position) => {
            if (headers[i].classList.contains('num')) columnStyles[position] = { halign: 'right', cellWidth: 'wrap' };
            else if (headers[i].classList.contains('nowrap')) columnStyles[position] = { cellWidth: 'wrap' };
        });
        const rows = [...table.tBodies[0].rows];
        const full = tr => tr.cells.length === headers.length;
        return {
            head: [...groups, visible.map(i => headers[i].textContent.trim().toUpperCase())],   // th is uppercase in CSS
            headClasses: visible.map(i => headers[i].className),
            even: visible.map((i, position) => position).filter(position => headers[visible[position]].classList.contains('even')),
            body: rows.map(tr => full(tr)
                ? visible.map(i => table.classList.contains('hide-sums') && tr.cells[i].classList.contains('sum') ? '' : pdfText(tr.cells[i].textContent))
                : [{ content: pdfText(tr.cells[0].textContent), colSpan: visible.length }]),
            rowClasses: rows.map(tr => tr.className),
            cellClasses: rows.map(tr => full(tr) ? visible.map(i => tr.cells[i].className) : [tr.cells[0].className]),
            columnStyles
        };
    }

    // The PDF's built-in font has no emoji, so draw one on a canvas and embed it as an image.
    function emojiImage(emoji) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.font = '52px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, 32, 36);
            return canvas.toDataURL('image/png');
        } catch (error) {
            return null;
        }
    }

    // messages: { title, lines } drawn first as a heading over one highlighted box per sentence, or omitted.
    // summary: the totals table under a "SUMMARY" heading, or null. cards: [{ table, title, meta, footer }], each a
    // .card.section; footer is optional, a list of elements drawn as muted lines under the card, keeping the
    // green/red of spans with class mbros-pays / pays-mbros. letterhead: draw the business header (.letterhead) at the top of every page.
    // orientation: 'portrait' or 'landscape', matching the page's @page rule.
    function build({ messages, summary, cards, letterhead, orientation = 'portrait' }) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
        const BRAND = '#1f6f4a', BRAND_SOFT = '#e7f3ec';
        // Column-group tints (light theme --info-soft, --accent-soft), by the class on the th or td.
        const groupFillOf = className => /\bgroup-locked\b/.test(className || '') ? '#eaf1fe'
            : /\bgroup-staged\b/.test(className || '') ? '#fdf5e1' : null;
        // Who-pays colours: MBros pays in green (--brand-strong), the party pays MBros in red (--danger).
        const payColorOf = className => /\bmbros-pays\b/.test(className || '') ? '#17573a'
            : /\bpays-mbros\b/.test(className || '') ? DANGER : null;
        const TEXT = '#1c2420', MUTED = '#5c665f', SUBTLE = '#8a938c', BORDER = '#e2e5e0', SURFACE_MUTED = '#f1f3f0', DANGER = '#c0392b';
        const margin = 28.35;   // 10 mm
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - margin * 2;
        // Text baseline inside a CSS line box of `lineHeight` starting at `top`.
        const baseline = (top, lineHeight, size) => top + lineHeight / 2 + size * 0.35;

        // Letterhead: band 63.7, gold rule 3, strip 22.8, then a 12 gap; repeats on every page.
        const bandHeight = 63.7, ruleHeight = 3, stripHeight = 22.8;
        const bodyTop = letterhead ? margin + bandHeight + ruleHeight + stripHeight + 12 : margin;
        let y = bodyTop;

        // "even" columns all take the widest text among them (bold 9 pt, the widest style they use) plus padding.
        function withEvenWidths(table) {
            if (!table.even.length) return table.columnStyles;
            doc.setFont('helvetica', 'bold').setFontSize(9);
            const columnHead = table.head[table.head.length - 1];
            const texts = table.even.flatMap(p => [columnHead[p], ...table.body.filter(row => row.length > 1).map(row => row[p])]);
            const width = Math.max(...texts.map(text => doc.getTextWidth(String(text)))) + 12 + 1;
            const styles = { ...table.columnStyles };
            table.even.forEach(p => styles[p] = { ...styles[p], cellWidth: width });
            return styles;
        }

        const tableOptions = (table, extra = {}, isTotals = false) => ({
            head: table.head,
            body: table.body,
            columnStyles: withEvenWidths(table),
            theme: 'plain',
            margin: { top: bodyTop, left: margin, right: margin, bottom: margin },
            styles: {
                font: 'helvetica', fontSize: 9, textColor: TEXT, lineColor: BORDER, lineWidth: { bottom: 0.75 },
                cellPadding: { top: 5.25, bottom: 5.25, left: 6, right: 6 }
            },
            headStyles: { fillColor: SURFACE_MUTED, textColor: MUTED, fontStyle: 'bold' },
            didParseCell: data => {
                const styles = data.cell.styles;
                if (data.section === 'head') {
                    const isGroup = data.row.index < table.head.length - 1;
                    styles.halign = isGroup ? 'center' : table.columnStyles[data.column.index]?.halign || 'left';
                    const groupFill = groupFillOf(isGroup ? data.cell.raw.className : table.headClasses[data.column.index]);
                    if (groupFill) styles.fillColor = groupFill;
                    if (!isGroup) styles.textColor = payColorOf(table.headClasses[data.column.index]) || styles.textColor;
                    if (/\blowlight\b/.test(table.headClasses[data.column.index] || '')) Object.assign(styles, { fontSize: 7.8, textColor: SUBTLE });   // 0.65rem
                    return;
                }
                const rowClass = table.rowClasses[data.row.index];
                const cellClass = table.cellClasses[data.row.index][data.column.index] || '';
                if (rowClass === 'opening-row') Object.assign(styles, { fontStyle: 'italic', textColor: MUTED });
                if (rowClass === 'total-row') Object.assign(styles, { fontStyle: 'bold', fillColor: SURFACE_MUTED, lineWidth: 0 });
                if (groupFillOf(cellClass)) styles.fillColor = groupFillOf(cellClass);
                if (payColorOf(cellClass)) styles.textColor = payColorOf(cellClass);
                if (cellClass.includes('negative')) styles.textColor = DANGER;
                if (cellClass.includes('lowlight')) Object.assign(styles, { fontSize: 6.75, textColor: SUBTLE });   // 0.75em
                if (cellClass.includes('note')) Object.assign(styles, { fontSize: 9.6, textColor: MUTED });
                if (cellClass.includes('route')) Object.assign(styles, { fontSize: 10.2, textColor: MUTED });
                if (cellClass.includes('empty-state')) Object.assign(styles, { halign: 'center', textColor: MUTED, cellPadding: { top: 36, bottom: 36, left: 15, right: 15 } });
                if (isTotals) {
                    if (data.column.index === table.head[table.head.length - 1].length - 1) styles.fontStyle = 'bold';
                    if (rowClass === 'total-row') styles.fontSize = 12;
                }
            },
            ...extra
        });

        // A .card.section: 21 gap, bordered box with a header (title, optional meta) above a full-width table.
        function drawCard(table, title, meta) {
            y += 21;
            doc.setFont('helvetica', 'bold').setFontSize(15);
            const titleLines = doc.splitTextToSize(pdfText(title), contentWidth - 30);
            const headerHeight = 12 + titleLines.length * 18.75 + (meta ? 3 + 15.75 : 0) + 12;
            if (y + headerHeight + 50 > pageHeight - margin) {   // keep the header with the first rows
                doc.addPage();
                y = bodyTop;
            }
            const cardTop = y;
            const startPage = doc.getCurrentPageInfo().pageNumber;
            let textTop = y + 12;
            doc.setTextColor(TEXT);
            titleLines.forEach(line => {
                doc.text(line, margin + 15, baseline(textTop, 18.75, 15));
                textTop += 18.75;
            });
            if (meta) {
                doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(MUTED);
                doc.text(pdfText(meta), margin + 15, baseline(textTop + 3, 15.75, 10.5));
            }
            y += headerHeight;
            doc.setDrawColor(BORDER).setLineWidth(0.75).line(margin, y, pageWidth - margin, y);

            const segments = [];   // the card's outline on each page it spans
            doc.autoTable(tableOptions(table, {
                startY: y,
                margin: { top: bodyTop, left: margin + 0.75, right: margin + 0.75, bottom: margin },
                didDrawPage: data => {
                    const page = doc.getCurrentPageInfo().pageNumber;
                    segments.push({ page, top: page === startPage ? cardTop : bodyTop, bottom: data.cursor.y });
                }
            }));
            segments.forEach(({ page, top, bottom }) => {
                doc.setPage(page);
                doc.setDrawColor(BORDER).setLineWidth(0.75).roundedRect(margin, top, contentWidth, bottom - top, 7.5, 7.5, 'S');
            });
            doc.setPage(doc.getNumberOfPages());
            y = doc.lastAutoTable.finalY;
        }

        // Lines under a card (.statement-meta: 10.5 pt muted, 15.75 line), one per element, 9 gap above the first.
        function drawFooter(elements) {
            y += 9;
            elements.forEach(element => {
                if (y + 15.75 > pageHeight - margin) {
                    doc.addPage();
                    y = bodyTop;
                }
                let x = margin + 15;
                doc.setFont('helvetica', 'normal').setFontSize(10.5);
                [...element.childNodes].forEach(node => {
                    const text = pdfText(node.textContent);
                    doc.setTextColor(payColorOf(node.className) || MUTED).text(text, x, baseline(y, 15.75, 10.5));
                    x += doc.getTextWidth(text);
                });
                y += 15.75;
            });
        }

        // Each message: a brand-soft box with a 3 pt brand bar on the left, bold 12 pt text that wraps.
        if (messages?.lines.length) {
            doc.setFont('helvetica', 'bold').setFontSize(9.6).setTextColor(SUBTLE);
            doc.text(pdfText(messages.title).toUpperCase(), margin, baseline(y, 12, 9.6), { charSpace: 0.58 });
            y += 12 + 9;
            const boxWidth = contentWidth;
            messages.lines.forEach(line => {
                doc.setFont('helvetica', 'bold').setFontSize(12);
                const wrapped = doc.splitTextToSize(pdfText(line), boxWidth - 27);
                const height = 18 + wrapped.length * 16;
                if (y + height > pageHeight - margin) {
                    doc.addPage();
                    y = bodyTop;
                }
                doc.setFillColor(BRAND_SOFT).roundedRect(margin, y, boxWidth, height, 4.5, 4.5, 'F');
                doc.setFillColor(BRAND).rect(margin, y, 3, height, 'F');
                doc.setTextColor(TEXT);
                wrapped.forEach((text, i) => doc.text(text, margin + 15, baseline(y + 9 + i * 16, 16, 12)));
                y += height + 6;
            });
            y -= 6;
        }
        if (summary) {
            doc.setFont('helvetica', 'bold').setFontSize(9.6).setTextColor(SUBTLE);
            doc.text('SUMMARY', margin, baseline(y, 12, 9.6), { charSpace: 0.58 });
            y += 12 + 9;
            doc.autoTable(tableOptions(visibleTable(summary), { startY: y, tableWidth: 345 }, true));
            y = doc.lastAutoTable.finalY;
        }
        cards.forEach(card => {
            drawCard(visibleTable(card.table), card.title, card.meta);
            if (card.footer) drawFooter(card.footer);
        });

        if (letterhead) drawLetterhead(doc, { margin, pageWidth, contentWidth, bandHeight, ruleHeight, stripHeight, baseline });
        return doc.output('blob');
    }

    // Letterhead on every page: navy-to-blue band, gold rule, light strip with links.
    function drawLetterhead(doc, { margin, pageWidth, contentWidth, bandHeight, ruleHeight, stripHeight, baseline }) {
        const phoneIcon = emojiImage('📞');
        const left = margin + 12, right = pageWidth - margin - 12;
        for (let page = 1; page <= doc.getNumberOfPages(); page++) {
            doc.setPage(page);
            // jsPDF has no gradients, so the band is thin vertical slices: #0b1f4b 0%, #16367f 55%, #1f4fae 100%.
            const stops = [[0, [11, 31, 75]], [0.55, [22, 54, 127]], [1, [31, 79, 174]]];
            const slices = 80;
            for (let i = 0; i < slices; i++) {
                const t = i / (slices - 1);
                const [[t0, c0], [t1, c1]] = t <= 0.55 ? [stops[0], stops[1]] : [stops[1], stops[2]];
                const k = (t - t0) / (t1 - t0);
                doc.setFillColor(...c0.map((c, n) => Math.round(c + (c1[n] - c) * k)));
                doc.rect(margin + contentWidth * i / slices, margin, contentWidth / slices + 0.5, bandHeight, 'F');
            }
            doc.setFillColor('#d4a72c').rect(margin, margin + bandHeight, contentWidth, ruleHeight, 'F');
            const stripTop = margin + bandHeight + ruleHeight;
            doc.setFillColor('#eaf0fb').rect(margin, stripTop, contentWidth, stripHeight, 'F');

            doc.setFont('helvetica', 'bold').setFontSize(19.2).setTextColor('#ffffff');
            doc.text('Mondal Brothers', left, baseline(margin + 9, 28.8, 19.2));
            const rowY = baseline(margin + 9 + 28.8 + 1.5, 16.9, 11.25);
            doc.setFontSize(11.25).setTextColor('#f3c85b');
            doc.text('Wholesale Chicken Distributor', left + 30, rowY);
            doc.setTextColor('#ffffff');
            doc.text('Contact: 9734075801', right, rowY, { align: 'right' });

            const stripY = baseline(stripTop, stripHeight, 10.2);
            doc.setFontSize(10.2).setTextColor('#0b1f4b');
            let x = left;
            if (phoneIcon) {
                doc.addImage(phoneIcon, 'PNG', x, stripY - 8.5, 10.5, 10.5);
                x += 13.5;
            }
            doc.textWithLink('Click to Call', x, stripY, { url: 'tel:+919734075801' });
            const site = 'tinyurl.com/mondalbros';
            const siteX = right - doc.getTextWidth(site);
            doc.textWithLink(site, siteX, stripY, { url: 'https://tinyurl.com/mondalbros' });
            doc.setDrawColor('#0b1f4b').setLineWidth(0.6).line(siteX, stripY + 1.5, right, stripY + 1.5);
            doc.setFont('helvetica', 'normal').setTextColor('#4b5a7a');
            doc.text('Visit Website: ', siteX, stripY, { align: 'right' });
        }
    }

    // Build the PDF and share it: phones get the share sheet (WhatsApp etc.); elsewhere it downloads.
    // `status` is the page's .status element, for the error when the PDF scripts did not load.
    async function share({ fileName, title, status, ...content }) {
        if (!window.jspdf) {
            Mb.setStatus(status, 'error', 'PDF tools did not load. Check the connection and reload.');
            return;
        }
        await shareFile({ blob: build(content), fileName, title });
    }

    // Share a ready PDF blob: phones get the share sheet (WhatsApp etc.); elsewhere it downloads.
    // Also used by pages with their own PDF layout (app/deliveries/).
    async function shareFile({ blob, fileName, title }) {
        fileName = fileName.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase() + '.pdf';
        const file = new File([blob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title });
            } catch (error) {
                if (error.name !== 'AbortError') console.error('Share failed:', error);
            }
            return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    window.StatementPdf = { share, shareFile };
})();

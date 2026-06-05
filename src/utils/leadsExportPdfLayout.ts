import PDFDocument from "pdfkit";

export type PdfKitDoc = InstanceType<typeof PDFDocument>;

/**
 * SaaS-style CRM leads report (A4 portrait, PDFKit).
 * Uses Helvetica / Helvetica-Bold (clean sans, widely embedded in PDF viewers).
 */
export const leadsExportPdfTheme = {
    pageBg: "#FFFFFF",
    ink: "#0F172A",
    body: "#334155",
    muted: "#64748B",
    mutedFooter: "#94A3B8",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    primary: "#2563EB",
    primarySoft: "#EFF6FF",
    primaryMuted: "#DBEAFE",
    tableHeaderBg: "#E8EEF5",
    tableHeaderText: "#1E293B",
    tableHeaderRule: "#CBD5E1",
    rowStripe: "#F8FAFC",
    rowBase: "#FFFFFF",
    rowRule: "#EEF2F7",
    summaryCardBg: "#F8FAFC",
    summaryCardBorder: "#E2E8F0",
    pillBg: "#EFF6FF",
    pillBorder: "#BFDBFE",
    pillText: "#1D4ED8",
} as const;

/** Public site for platform branding links in PDF exports. */
export const MITRAVARTA_PLATFORM_URL = "https://mitravarta.com/";
export const MITRAVARTA_PLATFORM_NAME = "Mitra Varta";

const THEME = leadsExportPdfTheme;

/** Vertical space reserved at bottom of every page for footer rule + text. */
export const CRM_LEADS_PDF_FOOTER_RESERVE = 52;

const TABLE_HEADER_H = 28;
const SUMMARY_CARD_H = 64;
const SUMMARY_GAP = 10;
const HEADER_LOGO_BOX = 46;
const HEADER_LOGO_GAP = 12;

/**
 * Diagonal platform logo (or wordmark) on every page for free-plan PDF exports.
 * Drawn before footers so footer text stays on top.
 */
export function applyFreePlanWatermarkToAllPages(
    doc: PdfKitDoc,
    pageWidth: number,
    pageHeight: number,
    enabled: boolean,
    platformPdfLogo: Buffer | null
): void {
    if (!enabled) {
        return;
    }

    const range = doc.bufferedPageRange();
    const logo = platformPdfLogo;
    const cx = pageWidth / 2;
    const cy = pageHeight / 2 - 24;

    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.save();
        doc.translate(cx, cy);
        doc.rotate(-30);
        doc.opacity(0.12);

        if (logo) {
            try {
                const stampW = 240;
                const stampH = 54;
                doc.image(logo, -stampW / 2, -stampH / 2, { fit: [stampW, stampH] });
            } catch {
                doc.font("Helvetica-Bold").fontSize(38).fillColor(THEME.muted);
                doc.text(MITRAVARTA_PLATFORM_NAME.toUpperCase(), -200, -22, {
                    width: 400,
                    align: "center",
                });
            }
        } else {
            doc.font("Helvetica-Bold").fontSize(38).fillColor(THEME.muted);
            doc.text(MITRAVARTA_PLATFORM_NAME.toUpperCase(), -200, -22, {
                width: 400,
                align: "center",
            });
        }

        doc.restore();
    }
}

export function measureTableRowHeight(
    doc: PdfKitDoc,
    opts: {
        fontSize: number;
        cells: { text: string; width: number }[];
        lineGap?: number;
        minHeight?: number;
        verticalPadding?: number;
    }
): number {
    const {
        fontSize,
        cells,
        lineGap = 1.25,
        minHeight = 22,
        verticalPadding = 10,
    } = opts;
    doc.font("Helvetica").fontSize(fontSize);
    let maxInner = 0;
    for (const { text, width } of cells) {
        const h = doc.heightOfString(String(text || "—"), { width, lineGap });
        maxInner = Math.max(maxInner, h);
    }
    return Math.max(minHeight, maxInner + verticalPadding);
}

export function formatPropertyCountLabel(count: number): string {
    const n = Math.max(0, Math.floor(count));
    return n === 1 ? "1 property" : `${n} properties`;
}

export type CrmLeadsPdfHeaderOpts = {
    companyName: string;
    totalLeads: number;
    propertyCount: number;
    exportDateDisplay: string;
    reportBadgeLabel?: string;
    logoBuffer?: Buffer | null;
    /** Mitra Varta platform logo (PNG/JPEG buffer); from `getPlatformPdfLogoBuffer()`. */
    platformPdfLogoBuffer?: Buffer | null;
};

/**
 * Page 1 only: left — Mitra Varta logo (linked) + optional company logo; right — company + leads/meta (right-aligned).
 * Platform logo has no border; it links to MITRAVARTA_PLATFORM_URL. Export date is not in the header.
 */
export function drawCrmLeadsReportHeader(
    doc: PdfKitDoc,
    pageWidth: number,
    margin: number,
    opts: CrmLeadsPdfHeaderOpts
): number {
    const {
        companyName,
        totalLeads,
        propertyCount,
        exportDateDisplay: _exportDateDisplay,
        reportBadgeLabel = "LEADS REPORT",
        logoBuffer = null,
        platformPdfLogoBuffer = null,
    } = opts;

    const innerW = pageWidth - margin * 2;
    const blockTop = margin;
    const showCompanyLogo = Boolean(logoBuffer);
    /** Horizontal Mitra Varta lockup — `fit` preserves aspect (icon + wordmark + tagline). */
    const navbarLogoMaxW = 148;
    const navbarLogoH = 32;
    const gapBetweenColumns = 20;
    const platformLeftX = margin + (showCompanyLogo ? HEADER_LOGO_BOX + HEADER_LOGO_GAP : 0);
    const textX = platformLeftX + navbarLogoMaxW + gapBetweenColumns;
    const nameW = Math.max(100, pageWidth - margin - textX);

    const metaLine = `${totalLeads} lead${totalLeads === 1 ? "" : "s"} · ${formatPropertyCountLabel(propertyCount)}`;

    doc.save();
    doc.rect(margin, margin, innerW, doc.page.height - margin * 2).fillColor(THEME.pageBg).fill();
    doc.restore();

    if (showCompanyLogo && logoBuffer) {
        try {
            doc.image(logoBuffer, margin, blockTop, {
                fit: [HEADER_LOGO_BOX, HEADER_LOGO_BOX],
                align: "center",
                valign: "center",
            });
        } catch {
            /* omit invalid image */
        }
    }

    doc.font("Helvetica-Bold").fontSize(18).fillColor(THEME.ink);
    const titleH = doc.heightOfString(companyName || "—", { width: nameW, lineGap: 1.25 });

    doc.font("Helvetica").fontSize(9.5).fillColor(THEME.muted);
    const metaH = doc.heightOfString(metaLine, { width: nameW, lineGap: 1.35 });

    const platformLogoBuffer = platformPdfLogoBuffer;

    let platformColH: number;
    if (platformLogoBuffer) {
        platformColH = navbarLogoH;
    } else {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.pillText);
        platformColH = doc.currentLineHeight() + 6;
    }

    const gapTitleToMeta = 6;
    const textStackH = titleH + gapTitleToMeta + metaH;
    const leftColH = Math.max(showCompanyLogo ? HEADER_LOGO_BOX : 0, platformColH);
    const headerBottom = blockTop + Math.max(leftColH, textStackH) + 14;

    if (platformLogoBuffer) {
        try {
            doc.image(platformLogoBuffer, platformLeftX, blockTop, {
                fit: [navbarLogoMaxW, navbarLogoH],
                valign: "center",
                link: MITRAVARTA_PLATFORM_URL,
            });
        } catch {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.pillText);
            doc.text(String(reportBadgeLabel).toUpperCase(), platformLeftX, blockTop + 8, {
                width: navbarLogoMaxW,
                align: "left",
                link: MITRAVARTA_PLATFORM_URL,
            });
        }
    } else {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.pillText);
        doc.text(String(reportBadgeLabel).toUpperCase(), platformLeftX, blockTop + 8, {
            width: navbarLogoMaxW,
            align: "left",
            link: MITRAVARTA_PLATFORM_URL,
        });
    }

    doc.font("Helvetica-Bold").fontSize(18).fillColor(THEME.ink);
    doc.text(companyName || "—", textX, blockTop, { width: nameW, lineGap: 1.25, align: "right" });

    const yMeta = blockTop + titleH + gapTitleToMeta;
    doc.font("Helvetica").fontSize(9.5).fillColor(THEME.muted);
    doc.text(metaLine, textX, yMeta, { width: nameW, lineGap: 1.35, align: "right" });

    doc.moveTo(margin, headerBottom)
        .lineTo(pageWidth - margin, headerBottom)
        .lineWidth(0.55)
        .strokeColor(THEME.border)
        .stroke();

    return headerBottom + 4;
}

export type CrmLeadsPdfSummaryOpts = {
    totalLeads: number;
    propertyCount: number;
    firstLeadDateDisplay: string;
    lastLeadDateDisplay: string;
};

/**
 * Four summary cards (page 1). Returns Y below the card row.
 */
export function drawCrmLeadsReportSummaryCards(
    doc: PdfKitDoc,
    pageWidth: number,
    margin: number,
    startY: number,
    opts: CrmLeadsPdfSummaryOpts
): number {
    const innerW = pageWidth - margin * 2;
    const cardCount = 4;
    const gaps = SUMMARY_GAP * (cardCount - 1);
    const cardW = (innerW - gaps) / cardCount;
    const radius = 8;
    const labels = ["TOTAL LEADS", "PROPERTIES", "FIRST LEAD DATE", "LAST LEAD DATE"] as const;
    const values = [
        String(opts.totalLeads),
        String(opts.propertyCount),
        opts.firstLeadDateDisplay,
        opts.lastLeadDateDisplay,
    ] as const;

    let x = margin;
    for (let i = 0; i < cardCount; i++) {
        doc.save();
        doc
            .roundedRect(x, startY, cardW, SUMMARY_CARD_H, radius)
            .fillColor(THEME.summaryCardBg)
            .fill();
        doc
            .roundedRect(x, startY, cardW, SUMMARY_CARD_H, radius)
            .lineWidth(0.45)
            .strokeColor(THEME.summaryCardBorder)
            .stroke();
        doc.restore();

        doc.font("Helvetica").fontSize(6.5).fillColor(THEME.muted);
        const lh = doc.currentLineHeight();
        doc.text(labels[i], x + 12, startY + 12, { width: cardW - 24 });

        doc.font("Helvetica-Bold").fontSize(14).fillColor(THEME.ink);
        doc.text(values[i], x + 12, startY + 12 + lh + 6, { width: cardW - 24, lineGap: 1.1 });

        x += cardW + SUMMARY_GAP;
    }

    return startY + SUMMARY_CARD_H + 18;
}

export type PdfColumnSpec = {
    header: string;
    width: number;
    align?: "left" | "right" | "center";
    /** First body column often name — use bold */
    headerAlign?: "left" | "right" | "center";
};

function columnXs(tableStartX: number, columns: PdfColumnSpec[], gap: number): number[] {
    const xs: number[] = [];
    let x = tableStartX;
    for (let i = 0; i < columns.length; i++) {
        xs.push(x);
        x += columns[i].width + (i < columns.length - 1 ? gap : 0);
    }
    return xs;
}

export function buildEqualGapColumnWidths(
    usableWidth: number,
    fractions: number[],
    gap: number
): number[] {
    const gaps = gap * (fractions.length - 1);
    const avail = usableWidth - gaps;
    const sum = fractions.reduce((a, b) => a + b, 0);
    return fractions.map((f) => (f / sum) * avail);
}

export function drawCrmLeadsTableHeader(
    doc: PdfKitDoc,
    tableStartX: number,
    y: number,
    tableTotalWidth: number,
    columns: PdfColumnSpec[],
    colGap: number
): number {
    doc.rect(tableStartX, y, tableTotalWidth, TABLE_HEADER_H).fillColor(THEME.tableHeaderBg).fill();

    const xs = columnXs(tableStartX, columns, colGap);
    const cellPadX = 10;
    const innerTrim = 2;

    doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.tableHeaderText);
    const labelH = doc.currentLineHeight();
    const hy = y + (TABLE_HEADER_H - labelH) / 2;

    columns.forEach((col, i) => {
        const align = col.headerAlign ?? col.align ?? "left";
        const textW = col.width - cellPadX - innerTrim;
        const tx = xs[i] + cellPadX;
        doc.text(col.header, tx, hy, {
            width: textW,
            align: align === "right" ? "right" : align === "center" ? "center" : "left",
        });
    });

    doc.moveTo(tableStartX, y + TABLE_HEADER_H)
        .lineTo(tableStartX + tableTotalWidth, y + TABLE_HEADER_H)
        .lineWidth(0.5)
        .strokeColor(THEME.tableHeaderRule)
        .stroke();

    return TABLE_HEADER_H;
}

export type CrmLeadsTableRowInput = {
    cells: string[];
    nameColumnIndex?: number;
    /** Right-align phone and date columns for tidy layout */
    rightAlignIndices?: Set<number>;
};

export type RenderCrmLeadsTableOpts = {
    margin: number;
    pageWidth: number;
    pageHeight: number;
    tableStartX: number;
    tableTotalWidth: number;
    columns: PdfColumnSpec[];
    colGap: number;
    /** Y of the first table header row (page 1) */
    bodyStartY: number;
    /** Y of the table header on pages after the first */
    subsequentPageTopY: number;
    dataFontSize: number;
    dataLineGap: number;
    dataVerticalPad: number;
    minRowHeight: number;
    cellPadX: number;
    cellInnerTrim: number;
};

/**
 * Paginated body: draws header + rows, repeats header on each new page.
 * Email column wraps without ellipsis; phone/date use column align.
 */
export function renderCrmLeadsDataTable(
    doc: PdfKitDoc,
    opts: RenderCrmLeadsTableOpts,
    rows: CrmLeadsTableRowInput[]
): void {
    const {
        pageWidth,
        pageHeight,
        tableStartX,
        tableTotalWidth,
        columns,
        colGap,
        bodyStartY,
        subsequentPageTopY,
        dataFontSize,
        dataLineGap,
        dataVerticalPad,
        minRowHeight,
        cellPadX,
        cellInnerTrim,
    } = opts;

    const tableEndX = tableStartX + tableTotalWidth;
    const maxY = pageHeight - CRM_LEADS_PDF_FOOTER_RESERVE;
    const xs = columnXs(tableStartX, columns, colGap);

    const innerW = (idx: number) =>
        columns[idx].width - cellPadX - cellInnerTrim;

    const drawHeaderAt = (y: number) => {
        drawCrmLeadsTableHeader(doc, tableStartX, y, tableTotalWidth, columns, colGap);
    };

    let currentY = bodyStartY;
    drawHeaderAt(currentY);
    currentY += TABLE_HEADER_H;

    if (rows.length === 0) {
        const emptyTop = currentY + 36;
        doc.font("Helvetica").fontSize(10).fillColor(THEME.muted);
        doc.text("No leads found for this export.", tableStartX, emptyTop, {
            width: tableTotalWidth,
            align: "center",
        });
        return;
    }

    rows.forEach((row, index) => {
        const cells = row.cells;
        const measureCells = cells.map((text, i) => ({
            text,
            width: innerW(i),
        }));
        const rowHeight = measureTableRowHeight(doc, {
            fontSize: dataFontSize,
            cells: measureCells,
            lineGap: dataLineGap,
            minHeight: minRowHeight,
            verticalPadding: dataVerticalPad,
        });

        if (currentY + rowHeight > maxY) {
            doc.addPage({ margin: 0 });
            doc.save();
            doc.rect(opts.margin, opts.margin, pageWidth - opts.margin * 2, pageHeight - opts.margin * 2)
                .fillColor(THEME.pageBg)
                .fill();
            doc.restore();
            currentY = subsequentPageTopY;
            drawHeaderAt(currentY);
            currentY += TABLE_HEADER_H;
        }

        const rowFill = index % 2 === 0 ? THEME.rowStripe : THEME.rowBase;
        doc.rect(tableStartX, currentY, tableTotalWidth, rowHeight).fillColor(rowFill).fill();

        const textY = currentY + dataVerticalPad / 2;
        const textOpts = { lineGap: dataLineGap } as const;

        cells.forEach((cell, colIdx) => {
            const col = columns[colIdx];
            const align =
                row.rightAlignIndices?.has(colIdx) || col.align === "right"
                    ? "right"
                    : col.align === "center"
                      ? "center"
                      : "left";
            const isNameCol = row.nameColumnIndex === colIdx || (row.nameColumnIndex === undefined && colIdx === 0);
            doc.font(isNameCol ? "Helvetica-Bold" : "Helvetica").fontSize(dataFontSize).fillColor(THEME.body);
            doc.text(cell || "—", xs[colIdx] + cellPadX, textY, {
                width: innerW(colIdx),
                align,
                ...textOpts,
            });
        });

        currentY += rowHeight;
        doc.moveTo(tableStartX, currentY)
            .lineTo(tableEndX, currentY)
            .lineWidth(0.35)
            .strokeColor(THEME.rowRule)
            .stroke();
    });
}

export function applyCrmLeadsReportFootersToAllPages(
    doc: PdfKitDoc,
    margin: number,
    pageWidth: number,
    exportDateDisplay: string
): void {
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    const usable = pageWidth - margin * 2;
    const ruleYFromBottom = 32;
    const textBaselineFromBottom = 14;

    for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        const pageH = doc.page.height;
        const footerRuleY = pageH - ruleYFromBottom;
        doc.moveTo(margin, footerRuleY)
            .lineTo(pageWidth - margin, footerRuleY)
            .lineWidth(0.45)
            .strokeColor(THEME.border)
            .stroke();

        doc.font("Helvetica").fontSize(7);
        const lineH = doc.currentLineHeight(true);
        const textY = pageH - textBaselineFromBottom - lineH;

        doc.fillColor(THEME.mutedFooter).text("Powered by ", margin, textY, {
            width: usable * 0.4,
            align: "left",
            continued: true,
        });
        doc.fillColor(THEME.primary).text(MITRAVARTA_PLATFORM_NAME, {
            link: MITRAVARTA_PLATFORM_URL,
            underline: false,
        });
        doc.fillColor(THEME.mutedFooter);
        doc.text(`Exported ${exportDateDisplay}`, margin + usable * 0.33, textY, {
            width: usable * 0.34,
            align: "center",
        });
        doc.text(`Page ${i + 1} of ${totalPages}`, margin + usable * 0.66, textY, {
            width: usable * 0.34,
            align: "right",
        });
    }
}
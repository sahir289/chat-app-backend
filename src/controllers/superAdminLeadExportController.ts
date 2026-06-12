import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { leadRepository } from "../repositories/leadRepository";
import { companyRepository } from "../repositories/companyRepository";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { getCompanyLogoBuffer } from "../services/s3Service";
import {
    applyCrmLeadsReportFootersToAllPages,
    buildEqualGapColumnWidths,
    drawCrmLeadsReportHeader,
    drawCrmLeadsReportSummaryCards,
    renderCrmLeadsDataTable,
    type PdfColumnSpec,
} from "../utils/leadsExportPdfLayout";
import { getPlatformPdfLogoBuffer } from "../utils/platformPdfLogo";
import { extractIPAddress } from "../utils/requestMeta";
import { writeSecurityAuditLog } from "../services/securityAuditService";
import { AuditAction, ResourceType } from "@prisma/client";

function formatLeadDateOnly(value: string | Date): string {
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export async function exportSuperAdminLeadsHandler(
    req: AuthenticatedRequest,
    res: Response
) {
        const superAdminUserId = req.user?.id ?? null;
        const { format = "csv", companyId, propertyId, startDate, endDate } = req.query;
        const formatType = format as string;

        if (!["csv", "pdf", "excel"].includes(formatType)) {
            throw new AppError(400, "Invalid format. Supported formats: csv, pdf, excel");
        }

        const where: Prisma.LeadWhereInput = {};

        if (companyId) {
            where.companyId = typeof companyId === "string" ? companyId : Array.isArray(companyId) ? companyId[0] as string : String(companyId);
        }

        if (propertyId) {
            where.propertyId = typeof propertyId === "string" ? propertyId : Array.isArray(propertyId) ? propertyId[0] as string : String(propertyId);
        }

        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate ? { gte: new Date(startDate as string) } : {}),
                ...(endDate
                    ? { lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)) }
                    : {}),
            };
        }

        const leads = await leadRepository.findManyForExport(where, true);

        if (leads.length === 0 && formatType !== "pdf") {
            throw new AppError(404, "No leads found to export");
        }

        const timestamp = new Date().toISOString().split("T")[0];
        let filename = "leads";

        if (companyId) {
            const companySlug =
                leads[0]?.company?.name?.replace(/[^a-z0-9]/gi, "_") ?? "company";
            filename = `leads_${companySlug}`;
        }

        if (propertyId) {
            const propertySlug =
                leads[0]?.property?.name?.replace(/[^a-z0-9]/gi, "_") ?? "property";
            filename += `_${propertySlug}`;
        }

        filename += `_${timestamp}`;

        const scopedCompanyId =
            companyId === undefined || companyId === null
                ? null
                : typeof companyId === "string"
                  ? companyId
                  : Array.isArray(companyId)
                    ? String(companyId[0])
                    : String(companyId);

        void writeSecurityAuditLog({
            companyId: scopedCompanyId,
            userId: superAdminUserId,
            action: AuditAction.EXPORT,
            resourceType: ResourceType.LEAD,
            resourceId: scopedCompanyId ?? "all_companies",
            metadata: {
                format: formatType,
                rowCount: leads.length,
                propertyId:
                    propertyId === undefined || propertyId === null
                        ? null
                        : typeof propertyId === "string"
                          ? propertyId
                          : Array.isArray(propertyId)
                            ? String(propertyId[0])
                            : String(propertyId),
                filename,
                superAdmin: true,
            },
            ipAddress: extractIPAddress(req),
            userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
        });

        switch (formatType) {
            case "csv":
                return exportCSV(res, leads, filename);
            case "pdf":
                return await exportPDF(res, leads, filename, { scopedCompanyId });
            case "excel":
                return exportExcel(res, leads, filename);
            default:
                throw new AppError(400, "Unsupported format");
        }
    }

function exportCSV(res: Response, leads: any[], filename: string) {

    const headers = ["Company", "Property", "Name", "User ID", "Email", "Phone", "Status", "Source", "Date Created"];
    const rows = leads.map((lead) => [
        lead.company?.name || "",
        lead.property?.name || "",
        lead.fullName || "",
        lead.userId || "",
        lead.email || "",
        lead.phone || "",
        lead.status || "",
        lead.source || "",
        new Date(lead.createdAt).toLocaleString(),
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
    ].join("\n");

    const BOM = "\uFEFF";
    const csvWithBOM = BOM + csvContent;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.csv"`
    );
    res.send(csvWithBOM);
}

async function exportPDF(
    res: Response,
    leads: any[],
    filename: string,
    meta: { scopedCompanyId: string | null }
) {
    let headerCompanyName = "All companies";
    let logoBuffer: Buffer | null = null;

    if (leads.length > 0) {
        const companyForBrand =
            meta.scopedCompanyId && leads[0]?.company?.id === meta.scopedCompanyId
                ? leads[0].company
                : meta.scopedCompanyId
                  ? leads.find((l) => l.company?.id === meta.scopedCompanyId)?.company ?? null
                  : null;
        headerCompanyName = companyForBrand?.name ?? "All companies";
        logoBuffer =
            companyForBrand?.id && companyForBrand.logo
                ? await getCompanyLogoBuffer(companyForBrand.logo, companyForBrand.id)
                : null;
    } else if (meta.scopedCompanyId) {
        const company = await companyRepository.findById(meta.scopedCompanyId);
        headerCompanyName = company?.name ?? "Company";
        logoBuffer =
            company?.id && company.logo
                ? await getCompanyLogoBuffer(company.logo, company.id)
                : null;
    }

    const totalLeads = leads.length;
    const propertyCount = new Set(leads.map((l: any) => l.propertyId).filter(Boolean)).size;
    const firstLeadDateDisplay =
        leads.length === 0
            ? "—"
            : formatLeadDateOnly(
                  leads.reduce((earliest: any, l: any) =>
                      new Date(l.createdAt) < new Date(earliest.createdAt) ? l : earliest
                  ).createdAt
              );
    const lastLeadDateDisplay =
        leads.length === 0
            ? "—"
            : formatLeadDateOnly(
                  leads.reduce((latest: any, l: any) =>
                      new Date(l.createdAt) > new Date(latest.createdAt) ? l : latest
                  ).createdAt
              );

    const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: 0,
        bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.pdf"`
    );

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const usableWidth = pageWidth - margin * 2;
    const tableStartX = margin;
    const tableTotalWidth = usableWidth;

    const exportDateDisplay = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    const platformPdfLogo = await getPlatformPdfLogoBuffer();

    const afterHeaderY = drawCrmLeadsReportHeader(doc, pageWidth, margin, {
        companyName: headerCompanyName,
        totalLeads,
        propertyCount,
        exportDateDisplay,
        reportBadgeLabel: "ADMIN LEADS",
        logoBuffer,
        platformPdfLogoBuffer: platformPdfLogo,
    });

    const afterSummaryY = drawCrmLeadsReportSummaryCards(doc, pageWidth, margin, afterHeaderY, {
        totalLeads,
        propertyCount,
        firstLeadDateDisplay,
        lastLeadDateDisplay,
    });

    const colGap = 6;
    const fractions = [0.13, 0.19, 0.15, 0.28, 0.12, 0.13];
    const widths = buildEqualGapColumnWidths(usableWidth, fractions, colGap);
    const columns: PdfColumnSpec[] = [
        { header: "Company", width: widths[0] },
        { header: "Property", width: widths[1] },
        { header: "Name", width: widths[2] },
        { header: "Email", width: widths[3] },
        { header: "Phone", width: widths[4], align: "right", headerAlign: "right" },
        { header: "Created", width: widths[5], align: "right", headerAlign: "right" },
    ];

    const tableBodyTop = afterSummaryY;
    const subsequentPageTopY = margin + 8;

    const tableRows = leads.map((lead) => ({
        cells: [
            lead.company?.name || "—",
            lead.property?.name || "—",
            lead.fullName || "—",
            lead.email || "—",
            lead.phone || "—",
            formatLeadDateOnly(lead.createdAt),
        ],
        nameColumnIndex: 2,
        rightAlignIndices: new Set([4, 5]),
    }));

    renderCrmLeadsDataTable(
        doc,
        {
            margin,
            pageWidth,
            pageHeight,
            tableStartX,
            tableTotalWidth,
            columns,
            colGap,
            bodyStartY: tableBodyTop,
            subsequentPageTopY,
            dataFontSize: 7.5,
            dataLineGap: 1.12,
            dataVerticalPad: 8,
            minRowHeight: 20,
            cellPadX: 6,
            cellInnerTrim: 2,
        },
        tableRows
    );

    applyCrmLeadsReportFootersToAllPages(doc, margin, pageWidth, exportDateDisplay);

    doc.end();
}

async function exportExcel(res: Response, leads: any[], filename: string) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    // Set column headers
    worksheet.columns = [
        { header: "Company", key: "company", width: 20 },
        { header: "Property", key: "property", width: 20 },
        { header: "Name", key: "name", width: 25 },
        { header: "User ID", key: "userId", width: 20 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Source", key: "source", width: 15 },
        { header: "Date Created", key: "dateCreated", width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
    };

    // Add data rows
    leads.forEach((lead) => {
        worksheet.addRow({
            company: lead.company?.name || "",
            property: lead.property?.name || "",
            name: lead.fullName || "",
            userId: lead.userId || "",
            email: lead.email || "",
            phone: lead.phone || "",
            status: lead.status || "",
            source: lead.source || "",
            dateCreated: new Date(lead.createdAt).toLocaleString(),
        });
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
        if (column.width) {
            column.width = Math.max(column.width || 10, 10);
        }
    });

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
}


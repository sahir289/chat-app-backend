import type { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppError } from "../utils/appError";
import { leadRepository } from "../repositories/leadRepository";
import { companyRepository } from "../repositories/companyRepository";
import { featureAccessService } from "../services/featureAccessService";
import { getAgentPropertyFilter } from "../utils/agentPropertyFilter";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { getCompanyLogoBuffer } from "../services/s3Service";
import {
    applyCrmLeadsReportFootersToAllPages,
    applyFreePlanWatermarkToAllPages,
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

function formatLeadDateTime(value: string | Date): string {
    return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Date only — used for PDF export (no time). */
function formatLeadDateOnly(value: string | Date): string {
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export async function exportLeadsHandler(
    req: AuthenticatedRequest,
    res: Response
) {
        const userId = req.user?.id;
        const companyId = req.user?.companyId;
        if (!companyId) {
            throw new AppError(403, "Forbidden: Company context required");
        }
        if (!userId) {
            throw new AppError(401, "Unauthorized");
        }

        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw new AppError(404, "Company not found");
        }

        // Check if user is on free trial (not Pro)
        const isFreeTrial = !company.isPro;

        if (isFreeTrial) {
            // Free trial users get only ONE export with max 10 leads
            if (company.hasUsedFreeExport) {
                throw new AppError(403, "You have already used your free export. Please upgrade to Pro for unlimited exports.");
            }
        } else {
            // Pro users need feature access check
            const exportAccess = await featureAccessService.checkFeatureAccess(userId, "data_export");

            if (!exportAccess.allowed) {
                throw new AppError(403, exportAccess.reason || "Export feature requires Pro access. Please upgrade to Pro.");
            }
        }

        const { format = "csv", propertyId } = req.query;
        const formatType = format as string;

        if (!["csv", "pdf", "excel"].includes(formatType)) {
            throw new AppError(400, "Invalid format. Supported formats: csv, pdf, excel");
        }

        // Get agent property filter
        const propertyFilter = await getAgentPropertyFilter(userId);

        // Build where clause
        const where: Prisma.LeadWhereInput = {
            companyId,
            property: { deletedAt: null },
        };
        if (propertyId) {
            where.propertyId = typeof propertyId === "string" ? propertyId : Array.isArray(propertyId) ? propertyId[0] as string : String(propertyId);
        }

        // Apply property filter for agents
        if (propertyFilter.isFiltered && propertyFilter.propertyIds !== null) {
            if (propertyFilter.propertyIds.length === 0) {
                // Agent has no properties assigned, return empty
                throw new AppError(403, "No leads available for export");
            }
            // Filter by assigned properties
            if (propertyId) {
                // If specific property requested, check if agent has access
                if (!propertyFilter.propertyIds.includes(propertyId as string)) {
                    throw new AppError(403, "Access denied to this property");
                }
            } else {
                // Filter to only assigned properties
                where.propertyId = { in: propertyFilter.propertyIds };
            }
        }

        // Fetch leads for export
        let leads = await leadRepository.findManyForExport(where);

        if (leads.length === 0 && formatType !== "pdf") {
            throw new AppError(404, "No leads found to export");
        }

        // For free trial users, limit to 10 leads and mark export as used (non-empty exports only)
        if (leads.length > 0 && isFreeTrial) {
            leads = leads.slice(0, 10);
            await companyRepository.update(companyId, {
                hasUsedFreeExport: true,
            });
        }

        const propertyIdResolved =
            propertyId === undefined || propertyId === null
                ? null
                : typeof propertyId === "string"
                  ? propertyId
                  : Array.isArray(propertyId)
                    ? String(propertyId[0])
                    : String(propertyId);

        const propertyCount =
            propertyIdResolved && propertyIdResolved.length > 0
                ? 1
                : new Set(leads.map((l: { propertyId?: string | null }) => l.propertyId).filter(Boolean))
                      .size;

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

        // Generate filename
        const timestamp = new Date().toISOString().split("T")[0];
        const propertyName =
            propertyIdResolved && leads[0]?.property?.name
                ? leads[0].property.name.replace(/[^a-z0-9]/gi, "_")
                : propertyIdResolved
                  ? "property"
                  : "all";
        const filename = `leads_${propertyName}_${timestamp}`;

        void writeSecurityAuditLog({
            companyId,
            userId,
            action: AuditAction.EXPORT,
            resourceType: ResourceType.LEAD,
            resourceId: companyId,
            metadata: {
                format: formatType,
                rowCount: leads.length,
                propertyId: propertyIdResolved,
                filename,
            },
            ipAddress: extractIPAddress(req),
            userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
        });

        // Export based on format
        switch (formatType) {
            case "csv":
                return exportCSV(res, leads, filename);
            case "pdf":
                return await exportPDF(res, leads, filename, {
                    companyId,
                    companyName: company.name,
                    logoKey: company.logo,
                    totalLeads: leads.length,
                    propertyCount,
                    firstLeadDateDisplay,
                    lastLeadDateDisplay,
                    showFreePlanWatermark: isFreeTrial,
                });
            case "excel":
                return exportExcel(res, leads, filename);
            default:
                throw new AppError(400, "Unsupported format");
        }
    }

function exportCSV(res: Response, leads: any[], filename: string) {
    // CSV header
    const headers = ["Name", "User ID", "Email", "Phone", "Source", "Channel", "Status", "Property", "Date Created"];
    const rows = leads.map((lead) => [
        lead.fullName || "",
        lead.userId || "",
        lead.email || "",
        lead.phone || "",
        String(lead.source || "").toLowerCase(),
        lead.channel || "",
        lead.status || "",
        lead.property?.name || "",
        formatLeadDateTime(lead.createdAt),
    ]);

    // Create CSV content
    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
    ].join("\n");

    // Add BOM for Excel compatibility
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
    branding: {
        companyId: string;
        companyName: string;
        logoKey: string | null | undefined;
        totalLeads: number;
        propertyCount: number;
        firstLeadDateDisplay: string;
        lastLeadDateDisplay: string;
        /** Non-Pro companies: faint platform logo across each page */
        showFreePlanWatermark?: boolean;
    }
) {
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

    const logoBuffer = await getCompanyLogoBuffer(branding.logoKey, branding.companyId);
    const platformPdfLogo = await getPlatformPdfLogoBuffer();

    const exportDateDisplay = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    const afterHeaderY = drawCrmLeadsReportHeader(doc, pageWidth, margin, {
        companyName: branding.companyName,
        totalLeads: branding.totalLeads,
        propertyCount: branding.propertyCount,
        exportDateDisplay,
        reportBadgeLabel: "LEADS REPORT",
        logoBuffer,
        platformPdfLogoBuffer: platformPdfLogo,
    });

    const afterSummaryY = drawCrmLeadsReportSummaryCards(doc, pageWidth, margin, afterHeaderY, {
        totalLeads: branding.totalLeads,
        propertyCount: branding.propertyCount,
        firstLeadDateDisplay: branding.firstLeadDateDisplay,
        lastLeadDateDisplay: branding.lastLeadDateDisplay,
    });

    const colGap = 10;
    const fractions = [0.18, 0.22, 0.22, 0.18, 0.2];
    const widths = buildEqualGapColumnWidths(usableWidth, fractions, colGap);
    const columns: PdfColumnSpec[] = [
        { header: "Name", width: widths[0] },
        { header: "User ID", width: widths[1] },
        { header: "Email", width: widths[2] },
        { header: "Phone", width: widths[3], align: "right", headerAlign: "right" },
        { header: "Created", width: widths[4], align: "right", headerAlign: "right" },
    ];

    const tableBodyTop = afterSummaryY;
    const subsequentPageTopY = margin + 8;

    const tableRows = leads.map((lead) => ({
        cells: [
            lead.fullName || "—",
            lead.userId || "—",
            lead.email || "—",
            lead.phone || "—",
            formatLeadDateOnly(lead.createdAt),
        ],
        nameColumnIndex: 0,
        rightAlignIndices: new Set([3, 4]),
    }));

    renderCrmLeadsDataTable(doc, {
        margin,
        pageWidth,
        pageHeight,
        tableStartX,
        tableTotalWidth,
        columns,
        colGap,
        bodyStartY: tableBodyTop,
        subsequentPageTopY,
        dataFontSize: 9,
        dataLineGap: 1.22,
        dataVerticalPad: 10,
        minRowHeight: 24,
        cellPadX: 10,
        cellInnerTrim: 2,
    }, tableRows);

    applyFreePlanWatermarkToAllPages(
        doc,
        pageWidth,
        pageHeight,
        Boolean(branding.showFreePlanWatermark),
        platformPdfLogo
    );
    applyCrmLeadsReportFootersToAllPages(doc, margin, pageWidth, exportDateDisplay);

    doc.end();
}

async function exportExcel(res: Response, leads: any[], filename: string) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    // Set column headers
    worksheet.columns = [
        { header: "Name", key: "name", width: 25 },
        { header: "User ID", key: "userId", width: 20 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "Property", key: "property", width: 25 },
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
            name: lead.fullName || "",
            userId: lead.userId || "",
            email: lead.email || "",
            phone: lead.phone || "",
            property: lead.property?.name || "",
            dateCreated: formatLeadDateTime(lead.createdAt),
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


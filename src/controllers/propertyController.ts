import type { Request, Response } from "express";
import { propertyService } from "../services/propertyService";
import { getBackendBaseUrl } from "../utils/url";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { propertyRepository } from "../repositories/propertyRepository";
import { companyRepository } from "../repositories/companyRepository";
import { checkAgentPropertyAccess } from "../utils/agentPropertyFilter";
import prisma from "../lib/prisma";
import {
  uploadFileToS3ByKey,
  deleteFileFromS3,
  buildLogoS3Key
} from "../services/s3Service";
import { uploadMiddleware } from "../middlewares/uploadMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { errorResponse, successResponse } from "../utils/apiResponse";
import { Role } from "@prisma/client";
import {
  conversationRoutingService,
  type BusinessHoursPayload,
} from "../services/conversationRoutingService";

/**
 * Helper function to enforce strict companyId requirement.
 * NEVER fall back to user.companyId or headers - only trust req.companyId set by middleware.
 * @throws Returns 403 error response if companyId is missing
 */
function requireCompanyId(req: AuthenticatedRequest, res: Response): string | null {
  const companyId = req.companyId;
  if (!companyId) {
    errorResponse(res, {
      message: "Forbidden: Company context required",
      statusCode: 403,
    });
    return null;
  }
  return companyId;
}

export async function createPropertyHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { name, domain } = req.body ?? {};
  const backendBase = getBackendBaseUrl(req);

  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  const result = await propertyService.createPropertyWithSnippet({
    companyId,
    name,
    domain,
    backendBase,
    userId,
    userRole,
  });

  return successResponse(res, { data: result, statusCode: 201 });
}

export async function listPropertiesHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  const properties = await propertyService.listProperties(companyId, userId, userRole);

  return successResponse(res, { data: properties, statusCode: 200 });
}

export async function deletePropertyHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  await propertyService.deleteProperty(companyId, id, userId, userRole);
  return successResponse(res, { statusCode: 200 });
}

export async function updatePropertySettingsHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  const {
    chatbotName,
    chatbotLogo,
    launcherButtonColor,
    primaryColor,
    backgroundColor,
    textColor,
    leftMessageBackgroundColor,
    leftMessageTextColor,
    rightMessageBackgroundColor,
    rightMessageTextColor,
    welcomeMessage,
    position,
    aiEnabled,
    removeBranding,
    openAiChatModelId,
  } = req.body ?? {};

  // Normalize color values - convert empty strings to null
  const normalizeColor = (color: any): string | null => {
    if (color === null || color === undefined || color === "") return null;
    if (typeof color === "string") {
      const trimmed = color.trim();
      return trimmed === "" ? null : trimmed;
    }
    return null;
  };

  let chatbotLogoToUpdate: string | null | undefined = undefined;
  if (chatbotLogo === null || chatbotLogo === "") {
    chatbotLogoToUpdate = null;
  } else if (chatbotLogo && typeof chatbotLogo === 'string') {
    const isS3SignedUrl = chatbotLogo.includes('amazonaws.com') ||
      chatbotLogo.includes('s3.') ||
      chatbotLogo.includes('s3-');
    if (isS3SignedUrl) {
      // Presigned URL - don't update, backend already has the S3 key
      chatbotLogoToUpdate = undefined;
    } else {
      // Reject external URLs - only S3 keys are allowed
      // S3 keys don't start with http:// or https://
      const isExternalUrl = chatbotLogo.startsWith('http://') || chatbotLogo.startsWith('https://');
      if (isExternalUrl) {
        return errorResponse(res, {
          message: "External URLs are not allowed. Please upload a logo file instead.",
          statusCode: 400
        });
      }
      // Accept S3 key (stored in database)
      chatbotLogoToUpdate = chatbotLogo;
    }
  }

  const updated = await propertyService.updateSettings(companyId, id, {
    chatbotName: chatbotName ?? null,
    chatbotLogo: chatbotLogoToUpdate,
    launcherButtonColor: normalizeColor(launcherButtonColor),
    primaryColor: normalizeColor(primaryColor),
    backgroundColor: normalizeColor(backgroundColor),
    textColor: normalizeColor(textColor),
    leftMessageBackgroundColor: normalizeColor(leftMessageBackgroundColor),
    leftMessageTextColor: normalizeColor(leftMessageTextColor),
    rightMessageBackgroundColor: normalizeColor(rightMessageBackgroundColor),
    rightMessageTextColor: normalizeColor(rightMessageTextColor),
    welcomeMessage: welcomeMessage ?? null,
    position: position ?? null,
    aiEnabled,
    removeBranding,
    openAiChatModelId: openAiChatModelId !== undefined ? openAiChatModelId : undefined,
  }, userId, userRole);

  return successResponse(res, { data: updated, statusCode: 200 });
}

export async function getPropertyHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  const property = await propertyRepository.findById(id, companyId);
  if (!property) {
    return errorResponse(res, { message: "Property not found", statusCode: 404 });
  }

  if (userRole === Role.AGENT && userId) {
    const hasAccess = await checkAgentPropertyAccess(userId, id);
    if (!hasAccess) {
      return errorResponse(res, {
        message: "Access denied. You don't have permission to access this property.",
        statusCode: 403,
      });
    }
  }

  return successResponse(res, { data: property, statusCode: 200 });
}

export async function updatePropertyHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userRole = user?.role;

  const { name, domain } = req.body ?? {};

  const property = await propertyRepository.findById(id, companyId);
  if (!property) {
    return errorResponse(res, { message: "Property not found", statusCode: 404 });
  }

  if (userRole === Role.AGENT) {
    return errorResponse(res, {
      message: "Access denied. Agents cannot update property details.",
      statusCode: 403,
    });
  }
  const nextName =
    name === undefined ? property.name : String(name).trim();
  const nextDomain =
    domain === undefined
      ? property.domain
      : (() => {
          if (domain === null || domain === "") return null;
          const trimmed = String(domain).trim();
          return trimmed === "" ? null : trimmed;
        })();

  // Check if a property with the same name already exists (excluding current property)
  if (nextName !== property.name) {
    const existingPropertyWithName = await prisma.property.findFirst({
      where: {
        companyId,
        name: nextName,
        deletedAt: null,
        id: { not: id }, // Exclude current property
      },
    });

    if (existingPropertyWithName) {
      return errorResponse(res, {
        message: "Website name already exists",
        statusCode: 400,
      });
    }
  }

  const updated = await propertyRepository.update(id, companyId, {
    name: nextName,
    domain: nextDomain,
  });

  return successResponse(res, { data: updated, statusCode: 200 });
}

export async function getPropertyBusinessHoursHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  if (userRole === Role.AGENT && userId) {
    const hasAccess = await checkAgentPropertyAccess(userId, id);
    if (!hasAccess) {
      return errorResponse(res, { message: "Access denied", statusCode: 403 });
    }
  }

  const businessHours = await conversationRoutingService.getBusinessHours(id, companyId);
  if (!businessHours) {
    return errorResponse(res, { message: "Property not found", statusCode: 404 });
  }

  return successResponse(res, { data: businessHours, statusCode: 200 });
}

export async function updatePropertyBusinessHoursHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  if (req.user?.role === Role.AGENT) {
    return errorResponse(res, {
      message: "Access denied. Agents cannot update business hours.",
      statusCode: 403,
    });
  }

  const businessHours = await conversationRoutingService.upsertBusinessHours(
    id,
    companyId,
    req.body as BusinessHoursPayload
  );
  if (!businessHours) {
    return errorResponse(res, { message: "Property not found", statusCode: 404 });
  }

  return successResponse(res, { data: businessHours, statusCode: 200 });
}

export async function getPropertyCodeHandler(
  req: AuthenticatedRequest,
  res: Response
) {
  const companyId = requireCompanyId(req, res);
  if (!companyId) return;

  const { id } = req.params;
  const user = req.user;
  const userId = user?.id;
  const userRole = user?.role;

  const property = await propertyRepository.findById(id, companyId);
  if (!property) return errorResponse(res, { message: "Property not found", statusCode: 404 });

  if (userRole === Role.AGENT && userId) {
    const hasAccess = await checkAgentPropertyAccess(userId, id);
    if (!hasAccess) {
      return errorResponse(res, {
        message: "Access denied. You don't have permission to access this property.",
        statusCode: 403,
      });
    }
  }

  const backendBase = getBackendBaseUrl(req);
  const snippet = `\n<script>\n  (function () {\n    var s = document.createElement("script");\n    s.src = "${backendBase}/widget.js?widgetKey=${property.widgetKey}";\n    s.async = true;\n    document.head.appendChild(s);\n  })();\n</script>\n`.trim();

  return successResponse(res, { data: { snippet }, statusCode: 200 });
}

export async function getPropertySettingsByWidgetKeyHandler(
  req: Request,
  res: Response
) {
  const { widgetKey } = req.params;

  const settings = await propertyService.getSettingsByWidgetKey(widgetKey);
  if (!settings) {
    return errorResponse(res, { message: "Property not found", statusCode: 404 });
  }

  return successResponse(res, { data: settings, statusCode: 200 });
}

export const uploadLogoHandler = [
  uploadMiddleware.images.single("logo"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const { id } = req.params;
    const user = req.user;

    const file = req.file;
    if (!file) {
      return errorResponse(res, { message: "Logo file is required", statusCode: 400 });
    }

    const property = await propertyRepository.findById(id, companyId);
    if (!property) {
      return errorResponse(res, { message: "Property not found", statusCode: 404 });
    }

    const userId = user?.id;
    const userRole = user?.role;
    if (userRole === Role.AGENT && userId) {
      const hasAccess = await checkAgentPropertyAccess(userId, id);
      if (!hasAccess) {
        return errorResponse(res, { message: "Access denied", statusCode: 403 });
      }
    }

    if (property.chatbotLogo) {
      await deleteFileFromS3(property.chatbotLogo);
    }

    const company = await companyRepository.findById(companyId);

    const s3Key = buildLogoS3Key(companyId, file.originalname, new Date(), company?.name);

    const logoS3Key = await uploadFileToS3ByKey(
      file.buffer,
      s3Key,
      file.mimetype
    );

    const updated = await propertyService.updateSettings(companyId, id, {
      chatbotLogo: logoS3Key,
    }, userId, userRole);

    return successResponse(res, {
      data: updated,
      statusCode: 200
    });
  }),
];

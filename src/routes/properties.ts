import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requireModule } from "../middlewares/moduleAccessMiddleware";
import { authMiddleware, tenantMiddleware } from "../middlewares/authMiddleware";
import { companySuspensionMiddleware } from "../middlewares/companySuspensionMiddleware";
import { validate } from "../middlewares/validationMiddleware";
import { createPropertySchema, updatePropertySchema } from "../validations/propertyValidation";
import {
  createPropertyHandler,
  listPropertiesHandler,
  getPropertyHandler,
  deletePropertyHandler,
  updatePropertyHandler,
  updatePropertySettingsHandler,
  getPropertyCodeHandler,
  getPropertySettingsByWidgetKeyHandler,
  uploadLogoHandler,
} from "../controllers/propertyController";

const router = Router();

router.get("/widget/:widgetKey/settings",
  asyncHandler(getPropertySettingsByWidgetKeyHandler));

router.post("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  validate(createPropertySchema), 
  asyncHandler(createPropertyHandler));

router.get("/", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  asyncHandler(listPropertiesHandler));

router.get("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  asyncHandler(getPropertyHandler));

router.get("/:id/code", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  asyncHandler(getPropertyCodeHandler));

router.patch("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  validate(updatePropertySchema), 
  asyncHandler(updatePropertyHandler));

router.patch("/:id/settings", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  asyncHandler(updatePropertySettingsHandler));

router.post("/:id/logo", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  companySuspensionMiddleware, ...uploadLogoHandler);

router.delete("/:id", 
  authMiddleware, 
  tenantMiddleware, 
  requireModule("properties"), 
  asyncHandler(deletePropertyHandler));

export default router;

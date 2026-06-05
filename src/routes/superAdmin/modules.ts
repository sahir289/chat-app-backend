import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import {
  enableModuleHandler,
  disableModuleHandler,
  getCompanyModulesHandler,
  setMultipleModulesHandler,
  enableAllModulesHandler,
  disableAllModulesHandler,
} from "../../controllers/superAdminModuleController";

const router = Router();

router.get("/companies/:companyId", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(getCompanyModulesHandler));

router.post("/companies/:companyId/modules/:module/enable", 
  authMiddleware, superAdminOnly, asyncHandler(enableModuleHandler));

router.post("/companies/:companyId/modules/:module/disable", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(disableModuleHandler));

router.post("/companies/:companyId/modules/bulk", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(setMultipleModulesHandler));

router.post("/companies/:companyId/modules/enable-all", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(enableAllModulesHandler));

router.post("/companies/:companyId/modules/disable-all", 
  authMiddleware, 
  superAdminOnly, 
  asyncHandler(disableAllModulesHandler));

export default router;


import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { authMiddleware } from "../../middlewares/authMiddleware";
import { superAdminOnly } from "../../middlewares/roleMiddleware";
import { validatePasswordMiddleware } from "../../middlewares/passwordValidationMiddleware";
import {
    listAllUsersHandler,
    getUserByIdHandler,
    createAdminUserHandler,
    updateUserHandler,
    deleteUserHandler,
    activateUserHandler,
    deactivateUserHandler,
    resetPasswordHandler,
} from "../../controllers/superAdminUserController";

const router = Router();

router.get("/", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(listAllUsersHandler));

router.get("/:id", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(getUserByIdHandler));

router.post("/", 
    authMiddleware, 
    superAdminOnly, 
    validatePasswordMiddleware("password"), 
    asyncHandler(createAdminUserHandler));

router.put("/:id", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(updateUserHandler));

router.delete("/:id", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(deleteUserHandler));

router.post("/:id/activate", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(activateUserHandler));

router.post("/:id/deactivate", 
    authMiddleware, 
    superAdminOnly, 
    asyncHandler(deactivateUserHandler));

router.post("/:id/reset-password", 
    authMiddleware, 
    superAdminOnly, 
    validatePasswordMiddleware("newPassword"), 
    asyncHandler(resetPasswordHandler));

export default router;


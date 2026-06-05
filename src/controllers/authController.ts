import { Request, Response } from "express";
import { authService } from "../services/authService";
import { AppError } from "../utils/appError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { twoFactorService } from "../services/twoFactorService";
import { teamService } from "../services/teamService";
import {
    uploadFileToS3ByKey,
    deleteFileFromS3,
    buildAvatarS3Key,
    getPresignedUrl
} from "../services/s3Service";
import { userRepository } from "../repositories/userRepository";
import { companyRepository } from "../repositories/companyRepository";
import { uploadMiddleware } from "../middlewares/uploadMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { errorResponse, successResponse } from "../utils/apiResponse";
import { config } from "../config";
import { getModuleLogger } from "../utils/logger";
import {
    setAccessTokenCookie,
    setRefreshTokenCookie,
    clearAllAuthCookies
} from "../helpers/auth/cookieHelpers";
import { isValidHttpUrl, toErrorMessage } from "../helpers/auth/authHelpers";
import { Role } from "@prisma/client";

const log = getModuleLogger("authController");

async function resolveAvatarUrl(
    avatarKeyOrUrl: string | null | undefined,
    companyId: string | null | undefined,
    context: { userId: string; operation: "me" | "updateProfile" | "uploadAvatar" }
): Promise<string | null> {
    if (!avatarKeyOrUrl || !companyId) {
        return null;
    }

    try {
        const signedUrl = await getPresignedUrl(avatarKeyOrUrl, companyId, 3600);
        if (isValidHttpUrl(signedUrl)) {
            return signedUrl;
        }

        log.warn("Invalid avatar signed URL generated", {
            userId: context.userId,
            operation: context.operation,
            companyId,
            avatarKeyOrUrl,
        });
        return null;
    } catch (error) {
        log.warn("Failed to generate avatar signed URL", {
            userId: context.userId,
            operation: context.operation,
            companyId,
            avatarKeyOrUrl,
            error: toErrorMessage(error),
        });
        return null;
    }
}

export async function registerHandler(req: Request, res: Response) {
    const { fullName, email, phone, password, companyName, acceptedTerms } = req.body;

    const result = await authService.register({ fullName, email, phone, password, companyName, acceptedTerms });

    return successResponse(res, {
        statusCode: 201,
        message: "Account created successfully. Please check your email to verify your account.",
        data: {
            email: result.user.email,
        },
    });
}

export async function loginHandler(req: Request, res: Response) {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    if (result.requiresTwoFactor) {
        return successResponse(res, {
            statusCode: 200,
            message: "Two-factor authentication required",
            data: {
                requiresTwoFactor: true,
                challengeToken: result.challengeToken,
                user: result.user,
            },
        });
    }

    if (!result.tokens) {
        throw new AppError(500, "Login failed: tokens not generated");
    }

    // Set both tokens as HttpOnly cookies
    setAccessTokenCookie(res, result.tokens.accessToken);
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    return successResponse(res, {
        statusCode: 200,
        message: "Login successful",
        data: {
            // Remove accessToken from response body - it's in HttpOnly cookie
            user: {
                id: result.user.id,
                companyId: result.user.companyId,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                isOwner: result.user.isOwner,
            },
        },
    });
}

export async function completeLoginWith2FAHandler(req: Request, res: Response) {
    const { challengeToken, token } = req.body;

    if (!challengeToken) {
        throw new AppError(400, "2FA challenge token is required");
    }

    const result = await authService.completeLoginWith2FA(challengeToken, token);

    // Set both tokens as HttpOnly cookies
    setAccessTokenCookie(res, result.tokens.accessToken);
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    return successResponse(res, {
        statusCode: 200,
        message: "Login successful",
        data: {
            // Remove accessToken from response body - it's in HttpOnly cookie
            user: {
                id: result.user.id,
                companyId: result.user.companyId,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                isOwner: result.user.isOwner,
            },
        },
    });
}

export async function validateInviteTokenHandler(req: Request, res: Response) {
    const { token } = req.query;

    const result = await authService.validateInviteToken(token as string);

    return successResponse(res, {
        statusCode: 200,
        message: "Invite token validated successfully",
        data: result,
    });
}

export async function completeInviteHandler(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    await authService.completeInvite({ token, newPassword });

    return successResponse(res, {
        statusCode: 200,
        message: "Password set successfully. Please log in.",
    });
}

export async function meHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const user = await authService.getMe(userId);
    const userWith2FA = user as { twoFactorEnabled?: boolean };

    const avatarUrl = await resolveAvatarUrl(user.avatarUrl, user.companyId, {
        userId,
        operation: "me",
    });

    return successResponse(res, {
        statusCode: 200,
        message: "User profile fetched successfully",
        data: {
            id: user.id,
            companyId: user.companyId,
            email: user.email,
            name: user.name,
            role: user.role,
            isOwner: user.isOwner,
            isSuperAdmin: user.isSuperAdmin ?? false,
            avatarUrl,
            twoFactorEnabled: userWith2FA.twoFactorEnabled ?? false,
        },
    });
}

export async function updateProfileHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists

    const { name, avatarUrl } = req.body;

    let finalAvatarUrl: string | null | undefined = undefined;

    if (avatarUrl === null) {
        finalAvatarUrl = null;
    } else if (typeof avatarUrl === "string") {
        const cleanedAvatarUrl = avatarUrl.trim();
        if (cleanedAvatarUrl === "") {
            finalAvatarUrl = null;
        } else {
            let parsedAvatarUrl: URL;
            try {
                parsedAvatarUrl = new URL(cleanedAvatarUrl);
            } catch {
                throw new AppError(400, "Invalid avatar URL");
            }
            const s3BucketUrl = config.aws.s3BucketUrl;
            const backendPublicUrl = config.urls.backendPublicUrl;
            const isAwsHost = parsedAvatarUrl.hostname.includes("amazonaws.com") ||
                parsedAvatarUrl.hostname.includes("s3.");
            const isKnownTemporaryHost =
                (s3BucketUrl && cleanedAvatarUrl.includes(s3BucketUrl)) ||
                (backendPublicUrl && cleanedAvatarUrl.includes(backendPublicUrl));
            const hasSignedQuery = Array.from(parsedAvatarUrl.searchParams.keys()).some((key) =>
                key.toLowerCase().startsWith("x-amz-")
            );

            if (isAwsHost || isKnownTemporaryHost || hasSignedQuery) {
                throw new AppError(400, "Temporary or signed avatar URLs are not allowed");
            }

            finalAvatarUrl = cleanedAvatarUrl;
        }
    }

    const user = await authService.updateProfile({ userId, name, avatarUrl: finalAvatarUrl });

    const avatarUrlResponse = await resolveAvatarUrl(user.avatarUrl, user.companyId, {
        userId,
        operation: "updateProfile",
    });

    return successResponse(res, {
        statusCode: 200,
        message: "Profile updated successfully",
        data: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isOwner: user.isOwner,
            avatarUrl: avatarUrlResponse,
        },
    });
}

export async function changePasswordHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword({ userId, oldPassword, newPassword });

    return successResponse(res, {
        statusCode: 200,
        message: "Password changed successfully"
    });
}

export async function deleteAccountHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    await authService.deleteAccount(userId);

    return successResponse(res, {
        statusCode: 200,
        message: "Account deleted successfully"
    });
}

export async function refreshHandler(req: Request, res: Response) {
    const token = req.cookies?.refreshToken || (req.headers["x-refresh-token"] as string | undefined);
    if (!token) {
        throw new AppError(401, "Refresh token missing");
    }
    const result = await authService.refreshTokens(token);

    // Set both tokens as HttpOnly cookies
    setAccessTokenCookie(res, result.tokens.accessToken);
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    return successResponse(res, {
        statusCode: 200,
        message: "Token refreshed successfully",
        data: {
            user: {
                id: result.user.id,
                companyId: result.user.companyId,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                isOwner: result.user.isOwner,
                isSuperAdmin: result.user.isSuperAdmin ?? false,
                avatarUrl: result.user.avatarUrl ?? null,
                companyName: null, // Company name not included in basic user query
                twoFactorEnabled: result.user.twoFactorEnabled ?? false,
            },
        },
    });
}

export async function logoutHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id;

    if (userId) {
        await authService.logout(userId);
    }

    // Clear all auth cookies (access and refresh tokens from all possible paths)
    clearAllAuthCookies(res);

    return successResponse(res, {
        statusCode: 200,
        message: "Logout successful"
    });
}

export async function getSettingsHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const settings = await authService.getSettings(userId);
    return successResponse(res, {
        statusCode: 200,
        message: "User settings fetched successfully",
        data: settings,
    });
}

export async function inviteHandler(
    req: AuthenticatedRequest,
    res: Response
) {
    // tenantMiddleware ensures companyId exists for non-super-admin users
    const companyId = req.user!.companyId!;

    const { email, name, role } = req.body ?? {};

    if (role && role !== Role.AGENT) {
        throw new AppError(400, "Only AGENT role can be invited");
    }

    const result = await teamService.inviteAgent(companyId, email, name || email.split("@")[0], Role.AGENT);

    return successResponse(res, {
        statusCode: 201,
        message: "Invitation sent successfully",
        data: result,
    });
}

export async function acceptInviteHandler(
    req: Request,
    res: Response
) {
    const { token, password } = req.body ?? {};

    await authService.completeInvite({ token, newPassword: password });

    return successResponse(res, {
        statusCode: 200,
        message: "Password set successfully. Please log in.",
    });
}

export async function updateSettingsHandler(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id; // authMiddleware ensures req.user exists
    const { notificationsEnabled, chatSound, theme, browserAlerts } = req.body;
    const settings = await authService.updateSettings(userId, {
        notificationsEnabled,
        chatSound,
        theme,
        browserAlerts,
    });
    return successResponse(res, {
        statusCode: 200,
        message: "User settings updated successfully",
        data: settings,
    });
}

export async function verifyEmailHandler(req: Request, res: Response) {
    const { token } = req.query;

    await authService.verifyEmail(token as string);

    return successResponse(res, {
        statusCode: 200,
        message: "Email verified successfully. You can now log in.",
    });
}

export async function resendVerificationEmailHandler(req: Request, res: Response) {
    const { email } = req.body;

    const result = await authService.resendVerificationEmail(email);

    return successResponse(res, {
        statusCode: 200,
        message: result.message,
    });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
    const { email } = req.body;

    const result = await authService.forgotPassword(email);

    return successResponse(res, {
        statusCode: 200,
        message: result.message,
    });
}

export async function resetPasswordHandler(req: Request, res: Response) {
    const { token, newPassword } = req.body;

    const result = await authService.resetPassword(token, newPassword);

    return successResponse(res, {
        statusCode: 200,
        message: result.message,
    });
}

export const uploadAvatarHandler = [
    uploadMiddleware.images.single("avatar"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user!.id; // authMiddleware ensures req.user exists
        const companyId = req.user!.companyId; // authMiddleware ensures companyId exists for non-super-admin

        const file = req.file;
        if (!file) {
            return errorResponse(res, {
                statusCode: 400,
                message: "Avatar file is required",
            });
        }

        // Validate companyId exists (super-admin users don't have companyId)
        if (!companyId) {
            throw new AppError(400, "User must belong to a company");
        }

        // Fetch user for avatarUrl and other properties (middleware already validated user exists)
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (user.avatarUrl) {
            await deleteFileFromS3(user.avatarUrl);
        }

        const company = await companyRepository.findById(companyId);

        const s3Key = buildAvatarS3Key(companyId, userId, file.originalname, new Date(), company?.name);
        const avatarS3Key = await uploadFileToS3ByKey(
            file.buffer,
            s3Key,
            file.mimetype
        );

        const updatedUser = await authService.updateProfile({
            userId,
            name: user.name ?? undefined,
            avatarUrl: avatarS3Key
        });

        const avatarUrl = await resolveAvatarUrl(updatedUser.avatarUrl, companyId, {
            userId,
            operation: "uploadAvatar",
        });

        return successResponse(res, {
            statusCode: 200,
            message: "Avatar uploaded successfully",
            data: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                isOwner: updatedUser.isOwner,
                avatarUrl,
            },
        });
    }),
];

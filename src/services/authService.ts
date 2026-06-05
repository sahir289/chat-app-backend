import crypto from "crypto";
import { Role, ChatSound, Theme } from "@prisma/client";
import { AppError } from "../utils/appError";
import { comparePassword, compareToken, hashPassword, hashInviteToken, hashVerificationToken, hashPasswordResetToken } from "../utils/hash";
import { signTwoFactorChallenge, verifyRefreshToken, verifyTwoFactorChallenge } from "../utils/token";
import { sendEmail } from "./emailService";
import { userRepository } from "../repositories/userRepository";
import { companyRepository } from "../repositories/companyRepository";
import { refreshTokenRepository } from "../repositories/refreshTokenRepository";
import { userSettingsRepository } from "../repositories/userSettingsRepository";
import type {
    RegisterInput,
    LoginInput,
    CompleteInviteInput,
    ChangePasswordInput,
    UpdateProfileInput,
    UserWith2FA,
} from "../types/authTypes";
import {
    getInviteExpiryDate,
    getEmailVerificationExpiryDate,
    getPasswordResetExpiryDate,
    isSmtpConfigured,
    issueTokens,
} from "../utils/authHelpers";
import { enforceFreePlanAgentLimit } from "../helpers/agentLimitEnforcement";
import {
    sendVerificationEmailAsync,
    sendWelcomeEmailAsync,
    sendNewUserNotificationAsync,
    sendEmailAsync,
} from "../email/authEmailHelpers";
import { passwordChangedTemplate } from "../email/templates/auth/passwordChangedTemplate";
import { resetPasswordTemplate } from "../email/templates/auth/resetPasswordTemplate";
import { runRegistrationWorkflow } from "../helpers/auth/registerWorkflow";
import { config } from "../config";
import { kylasLeadService } from "./kylasLeadService";
import { twoFactorService } from "./twoFactorService";
import prisma from "../lib/prisma";
import { validatePasswordStrength } from "../utils/passwordValidation";
import { getModuleLogger } from "../utils/logger";
import { toErrorMessage, transformSettingsForApi } from "../helpers/auth/authHelpers";

const log = getModuleLogger("authService");

async function assertUserCompanyCanLogin(user: { companyId: string | null; role: Role; isSuperAdmin?: boolean | null }) {
    if (user.role === Role.SUPER_ADMIN || user.isSuperAdmin || !user.companyId) {
        return;
    }

    const company = await companyRepository.findById(user.companyId);
    if (!company) {
        throw new AppError(403, "Your company account is not available. Please contact support.");
    }

    if (company.deletedAt) {
        throw new AppError(403, "Your company account is deleted. Please contact your administrator.");
    }

    if (!company.isActive) {
        throw new AppError(403, "Your company account is inactive. Please contact your administrator.");
    }

    if (company.isSuspended) {
        throw new AppError(403, "Your company account is suspended. Please contact your administrator.", {
            code: "COMPANY_SUSPENDED",
            reason: company.suspensionReason || "Account suspended by administrator",
        });
    }
}

export const authService = {

    async register(input: RegisterInput) {
        const { fullName, phone, companyName } = input;

        const {
            user,
            property,
            companyId,
            normalizedEmail,
            verificationTokenRaw,
        } = await runRegistrationWorkflow(input);

        // Use companyName from input directly - workflow already creates company with same logic
        const finalCompanyName = companyName || "Default Company";

        const registrationDate = new Date();

        const verificationLink = `${config.urls.frontendUrl}/verify-email?token=${verificationTokenRaw}`;

        if (isSmtpConfigured()) {
            void (async () => {
                await sendVerificationEmailAsync(normalizedEmail, fullName, verificationLink);

                const superAdmins = await userRepository.findSuperAdmins();
                const superAdminEmails = superAdmins.map((admin) => admin.email);
                await sendNewUserNotificationAsync(superAdminEmails, {
                    name: fullName,
                    email: normalizedEmail,
                    companyName: finalCompanyName,
                    registrationDate,
                });
            })().catch((error) => {
                log.warn("Non-blocking registration emails failed", {
                    email: normalizedEmail,
                    error: toErrorMessage(error),
                });
            });
        }

        if (config.kylas.accountLeadSyncEnabled) {
            void kylasLeadService.createAccountLead({
                fullName,
                email: normalizedEmail,
                phone,
                companyName: finalCompanyName,
            }).catch((error) => {
                log.warn("Non-blocking Kylas lead sync failed", {
                    email: normalizedEmail,
                    error: toErrorMessage(error),
                });
            });
        }

        return { user, property, companyId };
    },

    async login(input: LoginInput) {
        const { email, password } = input;

        const normalizedEmail = email.toLowerCase().trim();
        const user = await userRepository.findByEmail(normalizedEmail);

        if (!user) {
            throw new AppError(400, "Invalid email or password. Please check your credentials and try again.");
        }

        if (!user.password) {
            throw new AppError(400, "Account setup incomplete. Please complete your invite or contact support.");
        }

        if (!user.isActive) {
            // If user has a password, they completed their invite and were deactivated by admin
            // If user has no password, they haven't completed their invite yet (but this case is already handled above)
            throw new AppError(403, "Your account has been deactivated. Please contact your administrator.");
        }

        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
            throw new AppError(400, "Invalid email or password. Please check your credentials and try again.");
        }

        await assertUserCompanyCanLogin(user);

        // User requirement: Always send email when trying to login (if not verified), up to 2 times per 15 minutes
        if (!user.emailVerified) {
            // This ensures user gets a fresh link every time (up to rate limit enforced by middleware)
            const verificationTokenRaw = crypto.randomBytes(32).toString("hex");
            const verificationTokenHashed = hashVerificationToken(verificationTokenRaw);
            const verificationExpires = getEmailVerificationExpiryDate();

            // Update user with new token
            await userRepository.update(user.id, {
                emailVerificationToken: verificationTokenHashed,
                emailVerificationExpires: verificationExpires,
            });

            const baseUrl = config.urls.frontendUrl;
            const verificationLink = `${baseUrl}/verify-email?token=${verificationTokenRaw}`;

            // If email fails, we still throw the error but log the failure
            await sendVerificationEmailAsync(normalizedEmail, user.name || "User", verificationLink);

            throw new AppError(403, "Your email is not verified. Check your email, we have sent a verification link. Please verify.", {
                code: "EMAIL_NOT_VERIFIED",
                email: normalizedEmail,
            });
        }

        // If 2FA is enabled, require OTP verification
        const userWith2FA = user as UserWith2FA;
        if (userWith2FA.twoFactorEnabled) {
            return {
                requiresTwoFactor: true,
                challengeToken: signTwoFactorChallenge(user.id),
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                },
            };
        }

        // No 2FA - issue tokens directly
        const tokens = await issueTokens(user);

        return { tokens, user, requiresTwoFactor: false };
    },

    async completeLoginWith2FA(challengeToken: string, token: string) {
        const challenge = verifyTwoFactorChallenge(challengeToken);
        const user = await userRepository.findById(challenge.userId) as UserWith2FA | null;
        if (!user) {
            throw new AppError(404, "User not found");
        }

        if (!user.isActive) {
            throw new AppError(403, "Account is not active");
        }

        await assertUserCompanyCanLogin(user);

        if (!user.twoFactorEnabled) {
            throw new AppError(400, "2FA is not enabled for this account");
        }

        await twoFactorService.verify(user.id, token);

        const tokens = await issueTokens(user);

        return { tokens, user };
    },

    async validateInviteToken(token: string) {
        const hashedToken = hashInviteToken(token);
        const matchedUser = await userRepository.findFirstByInviteToken(hashedToken);

        if (!matchedUser) {
            throw new AppError(400, "Invalid or expired invite token");
        }

        return {
            email: matchedUser.email,
            name: matchedUser.name,
        };
    },

    async completeInvite(input: CompleteInviteInput) {

        const { token, newPassword } = input;

        const hashedPassword = await hashPassword(newPassword);

        // Use transaction to prevent race conditions
        const updated = await prisma.$transaction(async (tx) => {
            // Hash the token and find user with matching invite token within transaction
            const hashedToken = hashInviteToken(token);
            const matchedUser = await tx.user.findFirst({
                where: {
                    inviteToken: hashedToken,
                    inviteExpires: { gt: new Date() },
                    isActive: false,
                    role: Role.AGENT,
                },
            });

            if (!matchedUser) {
                throw new AppError(400, "Invalid or expired invite token");
            }

            // Atomically update user - this prevents race conditions
            // If another request already activated this user, the update will still succeed
            // but we check if inviteToken is still set to detect concurrent activations
            const existingUser = await tx.user.findUnique({
                where: { id: matchedUser.id },
                select: { inviteToken: true, isActive: true },
            });

            if (!existingUser) {
                throw new AppError(404, "User not found");
            }

            // Check if token was already used (race condition detection)
            if (!existingUser.inviteToken) {
                throw new AppError(400, "Invite token has already been used");
            }

            // Enforce free plan agent limit before activation
            // Only check for AGENT role users
            if (matchedUser.role === Role.AGENT && matchedUser.companyId) {
                await enforceFreePlanAgentLimit(matchedUser.companyId, tx, matchedUser.id);
            }

            // Update user atomically
            const updated = await tx.user.update({
                where: { id: matchedUser.id },
                data: {
                    password: hashedPassword,
                    isActive: true,
                    emailVerified: true,
                    inviteToken: null,
                    inviteExpires: null,
                },
            });

            return updated;
        }, {
            maxWait: 5000,
            timeout: 10000,
        });

        return { user: updated };
    },

    async createInviteToken(): Promise<{ raw: string; hashed: string; expiresAt: Date }> {
        const raw = crypto.randomBytes(32).toString("hex");
        const hashed = hashInviteToken(raw);
        const expiresAt = getInviteExpiryDate();
        return { raw, hashed, expiresAt };
    },

    async getMe(userId: string) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AppError(404, "User not found");
        }
        return user;
    },

    async updateProfile(input: UpdateProfileInput & { avatarUrl?: string | null }) {
        const { userId, name, avatarUrl } = input;
        const user = await userRepository.update(userId, { name, avatarUrl });
        return user;
    },

    async changePassword(input: ChangePasswordInput) {
        const { userId, oldPassword, newPassword } = input;
        const user = await userRepository.findById(userId);
        if (!user?.password) {
            throw new AppError(400, "Invalid account");
        }
        const valid = await comparePassword(oldPassword, user.password);
        if (!valid) {
            throw new AppError(400, "Old password is incorrect");
        }

        // Password strength validation and new password !== old password check are handled by middleware
        const hashed = await hashPassword(newPassword);
        await userRepository.update(userId, { password: hashed });
    },

    async deleteAccount(userId: string) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AppError(404, "User not found");
        }

        await prisma.$transaction(async (tx) => {
            const deletedAt = new Date();
            // Delete upgrade requests for the user's company
            if (user.companyId) {
                await tx.upgradeRequest.deleteMany({
                    where: { companyId: user.companyId },
                });
            }

            // Soft delete user and set isActive to false
            await tx.user.update({
                where: { id: userId },
                data: {
                    isActive: false,
                    deletedAt,
                },
            });

            // Check if there are any active users left in the company
            if (user.companyId) {
                const activeUsersCount = await tx.user.count({
                    where: {
                        companyId: user.companyId,
                        deletedAt: null,
                        isActive: true,
                    },
                });

                // If no active users remain, deactivate the company.
                // Only the owner deleting their own account archives the whole company account.
                if (activeUsersCount === 0) {
                    const shouldArchiveCompany = user.isOwner;
                    await tx.company.update({
                        where: { id: user.companyId },
                        data: {
                            isActive: false,
                            ...(shouldArchiveCompany ? { deletedAt } : {}),
                        },
                    });

                    if (shouldArchiveCompany) {
                        await tx.auditLog.create({
                            data: {
                                companyId: user.companyId,
                                userId: user.id,
                                action: "DELETE",
                                resourceType: "COMPANY",
                                resourceId: user.companyId,
                                metadata: {
                                    action: "COMPANY_ARCHIVE",
                                    reason: "OWNER_ACCOUNT_DELETED",
                                    archivedAt: deletedAt.toISOString(),
                                    archivedUsers: [
                                        {
                                            id: user.id,
                                            role: user.role,
                                            isOwner: user.isOwner,
                                        },
                                    ],
                                },
                            },
                        });
                    }
                }
            }
        });

        await refreshTokenRepository.deleteByUserId(userId);
    },

    async refreshTokens(refreshToken: string) {
        const payload = verifyRefreshToken(refreshToken);

        // Get all refresh tokens for this user
        const records = await refreshTokenRepository.findByUserId(payload.userId);

        // Compare the provided token against each stored hash
        // bcrypt uses random salts, so we can't hash and compare directly
        let matchedRecord: typeof records[0] | null = null;
        for (const record of records) {
            const match = await compareToken(refreshToken, record.tokenHash);
            if (match) {
                matchedRecord = record;
                break;
            }
        }

        if (!matchedRecord) {
            throw new AppError(401, "Invalid refresh token");
        }

        // Fetch current user state from database (refresh token only contains userId)
        const user = await userRepository.findById(payload.userId);
        if (!user || !user.isActive || user.deletedAt !== null) {
            throw new AppError(401, "User inactive or not found");
        }

        await assertUserCompanyCanLogin(user);

        // Issue new tokens based on current user state from database
        await refreshTokenRepository.deleteByUserId(user.id);
        const tokens = await issueTokens(user);
        return { tokens, user };
    },

    async logout(userId: string) {
        await refreshTokenRepository.deleteByUserId(userId);
    },

    async getSettings(userId: string) {
        let settings = await userSettingsRepository.findByUserId(userId);
        settings ??= await userSettingsRepository.create({ userId });
        return transformSettingsForApi(settings);
    },

    async updateSettings(userId: string, data: Partial<{ notificationsEnabled: boolean; chatSound: string | ChatSound; theme: string | Theme; browserAlerts: boolean; }>) {
        // Convert string values to enums if needed
        const updateData: Partial<{ notificationsEnabled: boolean; chatSound: ChatSound; theme: Theme; browserAlerts: boolean; }> = {
            ...(data.notificationsEnabled !== undefined && { notificationsEnabled: data.notificationsEnabled }),
            ...(data.browserAlerts !== undefined && { browserAlerts: data.browserAlerts }),
        };

        if (data.chatSound !== undefined) {
            if (typeof data.chatSound === "string") {
                updateData.chatSound = data.chatSound.toUpperCase() as ChatSound;
            } else {
                updateData.chatSound = data.chatSound;
            }
        }

        if (data.theme !== undefined) {
            if (typeof data.theme === "string") {
                updateData.theme = data.theme.toUpperCase() as Theme;
            } else {
                updateData.theme = data.theme;
            }
        }

        const settings = await userSettingsRepository.upsert(userId, updateData);
        return transformSettingsForApi(settings);
    },

    async initializeSuperAdmin(email: string, password: string, name?: string) {
        const existingSuperAdmin = await userRepository.findSuperAdminByRole();

        if (existingSuperAdmin) {
            throw new AppError(400, "SUPER_ADMIN already exists. Only one SUPER_ADMIN is allowed.");
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await userRepository.findByEmail(email);

        if (existingUser) {
            throw new AppError(400, "User with this email already exists");
        }

        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            throw new AppError(400, passwordValidation.errors.join(". "));
        }

        const hashedPassword = await hashPassword(password);

        const superAdmin = await userRepository.create({
            email: normalizedEmail,
            name: name || "Super Admin",
            password: hashedPassword,
            role: Role.SUPER_ADMIN,
            isSuperAdmin: true,
            isActive: true,
            companyId: null,
            emailVerified: true,
            isOwner: false,
        });

        await userSettingsRepository.create({
            userId: superAdmin.id,
        });

        return superAdmin;
    },

    async verifyEmail(token: string) {
        // Hash the token using SHA-256 for direct database lookup
        const hashedToken = hashVerificationToken(token);
        const matchedUser = await userRepository.findFirstByVerificationToken(hashedToken);

        if (!matchedUser) {
            // Check if token exists but is expired
            const expiredUser = await userRepository.findFirstByExpiredVerificationToken(hashedToken);
            if (expiredUser) {
                throw new AppError(400, "Verification token has expired. Please request a new verification email.");
            } else {
                throw new AppError(400, "Invalid verification token. Please check your email and try again, or request a new verification link.");
            }
        }

        const verifiedUser = matchedUser;

        const updated = await userRepository.update(verifiedUser.id, {
            emailVerified: true,
            isActive: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
        });

        // Company info already included in the query above, no need for separate query
        const companyName = verifiedUser.company?.name || "Default Company";
        const isPro = verifiedUser.company?.isPro || false;

        // Send welcome email asynchronously (non-blocking) but handle errors
        sendWelcomeEmailAsync(
            verifiedUser.email,
            verifiedUser.name || "User",
            companyName,
            isPro
        ).catch((error) => {
            log.warn("Non-blocking welcome email failed", {
                userId: verifiedUser.id,
                email: verifiedUser.email,
                error: toErrorMessage(error),
            });
        });

        return { user: updated };
    },

    async resendVerificationEmail(email: string) {
        const normalizedEmail = email.toLowerCase().trim();

        const user = await userRepository.findByEmail(normalizedEmail);
        if (!user) {
            return { message: "If an account exists with this email, a verification link has been sent." };
        }

        if (user.emailVerified) {
            return { message: "Email is already verified." };
        }

        const verificationTokenRaw = crypto.randomBytes(32).toString("hex");
        const verificationTokenHashed = hashVerificationToken(verificationTokenRaw);
        const verificationExpires = getEmailVerificationExpiryDate();

        await userRepository.update(user.id, {
            emailVerificationToken: verificationTokenHashed,
            emailVerificationExpires: verificationExpires,
        });

        const baseUrl = config.urls.frontendUrl;
        const verificationLink = `${baseUrl}/verify-email?token=${verificationTokenRaw}`;

        // Await email sending to ensure it completes
        await sendVerificationEmailAsync(normalizedEmail, user.name || "User", verificationLink);

        return { message: "If an account exists with this email, a verification link has been sent." };
    },

    async forgotPassword(email: string) {

        const normalizedEmail = email.toLowerCase().trim();

        const user = await userRepository.findByEmail(normalizedEmail);

        if (!user || !user.password) {
            return { message: "If an account exists with this email, a password reset link has been sent." };
        }

        const resetTokenRaw = crypto.randomBytes(32).toString("hex");
        const resetTokenHashed = hashPasswordResetToken(resetTokenRaw);
        const resetExpires = getPasswordResetExpiryDate();

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetTokenHashed,
                passwordResetExpires: resetExpires,
            },
        });

        const resetLink = `${config.urls.frontendUrl}/auth/reset-password?token=${encodeURIComponent(resetTokenRaw)}`;

        // Await email sending to ensure it completes
        await sendEmailAsync(
            async () => {
                const template = resetPasswordTemplate({
                    name: user.name || "User",
                    resetLink,
                });
                return await sendEmail({
                    to: normalizedEmail,
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                });
            },
            `Password reset email sent to ${normalizedEmail}`,
            "send password reset email"
        );

        return { message: "If an account exists with this email, a password reset link has been sent." };
    },

    async resetPassword(token: string, newPassword: string) {
        // Password strength validation is handled by middleware

        // Normalize token: decode URI component (hex tokens are URL-safe, but may be encoded in URL)
        let tokenToHash = token;
        try {
            tokenToHash = decodeURIComponent(token);
        } catch {
            // If decoding fails, use original token (shouldn't happen with hex tokens)
        }

        // Hash the token using SHA-256 for direct database lookup
        const hashedToken = hashPasswordResetToken(tokenToHash);
        const matchedUser = await userRepository.findFirstByPasswordResetToken(hashedToken);

        if (!matchedUser) {
            throw new AppError(400, "Invalid or expired reset token. Please request a new password reset link.");
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update the user's password and clear the reset token
        await userRepository.update(matchedUser.id, {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null,
        });

        // Revoke all existing sessions by deleting refresh tokens
        await refreshTokenRepository.deleteByUserId(matchedUser.id);

        // Send password changed notification email (non-blocking)
        if (isSmtpConfigured()) {
            void (async () => {
                try {
                    const template = passwordChangedTemplate({
                        name: matchedUser.name || "User",
                    });
                    await sendEmail({
                        to: matchedUser.email,
                        subject: template.subject,
                        html: template.html,
                        text: template.text,
                    });
                } catch (error) {
                    log.warn("Non-blocking password changed email failed", {
                        userId: matchedUser.id,
                        email: matchedUser.email,
                        error: toErrorMessage(error),
                    });
                }
            })();
        }

        return { message: "Password has been reset successfully. You can now log in with your new password." };

    },
};

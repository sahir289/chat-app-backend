import type { User } from "@prisma/client";

export type RegisterInput = {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    companyName?: string;
    acceptedTerms: true;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type CompleteInviteInput = {
    token: string;
    newPassword: string;
};

export type ChangePasswordInput = {
    userId: string;
    oldPassword: string;
    newPassword: string;
};

export type UpdateProfileInput = {
    userId: string;
    name?: string | null;
};

export interface UserWith2FA extends User {
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    twoFactorBackupCodes: string[];
};

export interface TokenPayload {
    userId: string;
    companyId: string | null;
    role: string;
    isOwner: boolean;
}

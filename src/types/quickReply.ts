import type { Role } from "@prisma/client";

export interface QuickReplyDTO {
    id: string;
    companyId: string;
    propertyId: string;
    label: string;
    message: string;
    order: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateQuickReplyParams {
    userId: string;
    companyId: string;
    propertyId: string;
    label: string;
    message: string;
    order?: number;
    isActive?: boolean;
    userRole?: Role;
}

export interface UpdateQuickReplyParams {
    userId: string;
    companyId: string;
    quickReplyId: string;
    label?: string;
    message?: string;
    order?: number;
    isActive?: boolean;
    userRole?: Role;
}

export interface CreateQuickReplyData {
    companyId: string;
    propertyId: string;
    label: string;
    message: string;
    order?: number;
    isActive?: boolean;
}

export interface UpdateQuickReplyData {
    label?: string;
    message?: string;
    order?: number;
    isActive?: boolean;
}
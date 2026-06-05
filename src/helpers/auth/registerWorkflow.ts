import crypto from "node:crypto";
import { Prisma, type Property, type User } from "@prisma/client";
import { nanoid } from "nanoid";
import { Role } from "@prisma/client";
import type { RegisterInput } from "../../types/authTypes";
import { AppError } from "../../utils/appError";
import { getEmailVerificationExpiryDate } from "../../utils/authHelpers";
import { hashPassword, hashVerificationToken } from "../../utils/hash";
import prisma from "../../lib/prisma";

interface RegistrationEntities {
    user: User;
    property: Property;
    companyId: string;
}

export interface RegisterWorkflowResult extends RegistrationEntities {
    normalizedEmail: string;
    verificationTokenRaw: string;
}

function resolveName(defaultValue: string, name?: string): string {
    const trimmedName = name?.trim();
    return trimmedName && trimmedName.length > 0 ? trimmedName : defaultValue;
}

function getInitialAiCreditsResetAt(): Date {
    const nextResetAt = new Date();
    nextResetAt.setMonth(nextResetAt.getMonth() + 1);
    return nextResetAt;
}

async function resolveCompanyId(
    tx: Prisma.TransactionClient,
    companyName?: string,
    phone?: string
): Promise<string> {
    const company = await tx.company.create({
        data: {
            name: resolveName("Default Company", companyName),
            phone: phone?.trim() || null,
            aiCreditsResetAt: getInitialAiCreditsResetAt(),
        },
        select: { id: true },
    });
    return company.id;
}

async function createRegistrationEntities(
    tx: Prisma.TransactionClient,
    input: RegisterInput,
    normalizedEmail: string,
    hashedPassword: string,
    verificationTokenHashed: string,
    verificationExpires: Date
): Promise<RegistrationEntities> {

    const companyId = await resolveCompanyId(tx, input.companyName, input.phone);

    const existingOwner = await tx.user.findFirst({
        where: { companyId, isOwner: true },
    });
    const isOwner = !existingOwner;

    const property = await tx.property.create({
        data: {
            companyId,
            name: resolveName("Default Property", input.companyName),
            widgetKey: nanoid(16),
        },
    });

    const user = await tx.user.create({
        data: {
            companyId,
            email: normalizedEmail,
            name: input.fullName,
            password: hashedPassword,
            role: Role.ADMIN,
            isOwner,
            isActive: true,
            emailVerified: false,
            emailVerificationToken: verificationTokenHashed,
            emailVerificationExpires: verificationExpires,
        },
    });

    await tx.userSettings.create({
        data: { userId: user.id },
    });

    return { user, property, companyId };
}

export async function runRegistrationWorkflow(input: RegisterInput): Promise<RegisterWorkflowResult> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const hashedPassword = await hashPassword(input.password);
    const verificationTokenRaw = crypto.randomBytes(32).toString("hex");
    const verificationTokenHashed = hashVerificationToken(verificationTokenRaw);
    const verificationExpires = getEmailVerificationExpiryDate();

    try {
        const entities = await prisma.$transaction(async (tx) => {
            const existing = await tx.user.findFirst({
                where: {
                    email: {
                        equals: normalizedEmail,
                        mode: "insensitive",
                    },
                },
                select: { id: true },
            });
            if (existing) {
                throw new AppError(400, "User with this email already exists");
            }

            return createRegistrationEntities(
                tx,
                input,
                normalizedEmail,
                hashedPassword,
                verificationTokenHashed,
                verificationExpires
            );
        }, {
            maxWait: 5000,
            timeout: 10000,
        });

        return {
            ...entities,
            normalizedEmail,
            verificationTokenRaw,
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const target = String(error.meta?.target || "");
            if (target.includes("email")) {
                throw new AppError(400, "User with this email already exists");
            }
        }

        throw error;
    }
}

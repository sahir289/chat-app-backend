import prisma from "../lib/prisma";
import type { RefreshToken } from "@prisma/client";

export const refreshTokenRepository = {
    async create(data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }): Promise<RefreshToken> {
        return prisma.refreshToken.create({
            data,
        });
    },

    async findByUserIdAndHash(
        userId: string,
        tokenHash: string
    ): Promise<RefreshToken | null> {
        return prisma.refreshToken.findFirst({
            where: {
                userId,
                tokenHash,
                expiresAt: { gt: new Date() },
                revokedAt: null,
            },
        });
    },

    async findByUserId(userId: string): Promise<RefreshToken[]> {
        return prisma.refreshToken.findMany({
            where: {
                userId,
                expiresAt: { gt: new Date() },
                revokedAt: null,
            },
        });
    },

    async deleteByUserId(userId: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: { userId },
        });
    },

    async deleteById(id: string): Promise<void> {
        await prisma.refreshToken.delete({
            where: { id },
        });
    },
};


export const socketConfig = {
    cors: {
        methods: ["GET", "POST"] as const,
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    },
} as const;


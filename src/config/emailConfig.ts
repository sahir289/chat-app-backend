export const emailConfig = {
    smtp: {
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
        secure: process.env.SMTP_PORT === "465",
    },
    from: process.env.INVITE_FROM_EMAIL || "",
    retry: {
        maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || "3", 10),
        initialDelay: parseInt(process.env.EMAIL_INITIAL_DELAY || "1000", 10),
    },
    verboseLogs: process.env.VERBOSE_EMAIL_LOGS === "true",
} as const;


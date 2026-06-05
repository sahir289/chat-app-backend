export const serverConfig = {
    port: parseInt(process.env.PORT || "4000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV !== "production",
    trustProxy:
        process.env.TRUST_PROXY === "true" ||
        (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY !== "false"),
    version: process.env.NPM_VERSION || "1.0.0",
    isCrossSite: process.env.IS_CROSS_SITE === "true",
} as const;


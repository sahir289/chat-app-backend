export const expressConfig = {
    jsonLimit: process.env.JSON_LIMIT || "25mb",
    bodyLimit: process.env.BODY_LIMIT || "25mb",
    staticPath: process.env.STATIC_PATH || "uploads",
} as const;


import { createHmac } from "crypto";

export class IpHashConfigError extends Error {
    constructor() {
        super("IP_HASH_SALT environment variable is not set");
        this.name = "IpHashConfigError";
    }
}

export function hashIp(ip: string): string {
    const salt = process.env.IP_HASH_SALT;

    if (!salt) {
        throw new IpHashConfigError();
    }

    return createHmac("sha256", salt).update(ip).digest("hex");
}

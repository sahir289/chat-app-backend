import { serverConfig } from "../config/serverConfig";

export const INVITE_EXPIRY_HOURS = 24;
export const REFRESH_DAYS = 7;
export const EMAIL_VERIFICATION_EXPIRY_HOURS = 12;
export const PASSWORD_RESET_EXPIRY_HOURS = 1;
export const TWO_FACTOR_CHALLENGE_PURPOSE = "login_2fa";
export const TWO_FACTOR_CHALLENGE_EXPIRES_IN = "5m";

export const isProd = serverConfig.isProduction;

export const REFRESH_COOKIE_NAME = "refreshToken";
export const ACCESS_COOKIE_NAME = "accessToken";

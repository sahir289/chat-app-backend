// import { config } from "../config";
// import { toErrorMessage } from "../helpers/auth/authHelpers";
// import { getModuleLogger } from "../utils/logger";

// type CreateAccountLeadInput = {
//     fullName: string;
//     email: string;
//     phone: string;
//     companyName?: string | null;
// };

// type KylasEntityRef = { id: number };

// type KylasLeadPayload = {
//     firstName: string;
//     lastName?: string;
//     emails: Array<{
//         type: "OFFICE";
//         value: string;
//         primary: boolean;
//     }>;
//     phoneNumbers?: Array<{
//         type: "MOBILE";
//         value: string;
//         primary: boolean;
//     }>;
//     companyName?: string;
//     pipeline: KylasEntityRef;
//     pipelineStage: KylasEntityRef;
//     cfProjectTitle?: KylasEntityRef;
//     subSource?: string;
//     utmSource?: string;
//     utmMedium?: string;
//     utmCampaign?: string;
// };

// const log = getModuleLogger("kylasLeadService");
// const E164_PHONE_REGEX = /^\+[1-9]\d{9,14}$/;

// function splitFullName(fullName: string): Pick<KylasLeadPayload, "firstName" | "lastName"> {
//     const parts = fullName.trim().split(/\s+/).filter(Boolean);
//     const firstName = parts.shift() || fullName.trim();
//     const lastName = parts.join(" ");

//     return {
//         firstName,
//         ...(lastName ? { lastName } : {}),
//     };
// }

// function normalizeLeadEndpoint(rawBaseUrl: string): string {
//     const baseUrl = rawBaseUrl.trim().replace(/\/+$/, "");

//     if (!baseUrl) {
//         return "";
//     }

//     if (baseUrl.toLowerCase().endsWith("/leads")) {
//         return `${baseUrl}/`;
//     }

//     return `${baseUrl}/leads/`;
// }

// function normalizePhoneForKylas(phoneRaw: string): string | null {
//     const trimmed = phoneRaw.trim();
//     if (!trimmed) {
//         return null;
//     }

//     const compact = trimmed.replace(/[\s()-]/g, "");
//     if (E164_PHONE_REGEX.test(compact)) {
//         return compact;
//     }

//     return null;
// }

// // function buildPayload(input: CreateAccountLeadInput): KylasLeadPayload {
// //     // const kylas = config.kylas;
// //     const name = splitFullName(input.fullName);
// //     const companyName = input.companyName?.trim();
// //     const phone = normalizePhoneForKylas(input.phone);

// //     // return {
// //     //     ...name,
// //     //     emails: [
// //     //         {
// //     //             type: "OFFICE",
// //     //             value: input.email.toLowerCase().trim(),
// //     //             primary: true,
// //     //         },
// //     //     ],
// //     //     ...(phone
// //     //         ? {
// //     //             phoneNumbers: [
// //     //                 {
// //     //                     type: "MOBILE",
// //     //                     value: phone,
// //     //                     primary: true,
// //     //                 },
// //     //             ],
// //     //         }
// //     //         : {}),
// //     //     ...(companyName ? { companyName } : {}),
// //     //     // pipeline: { id: kylas.pipelineId },
// //     //     // pipelineStage: { id: kylas.pipelineStageId },
// //     //     // ...(kylas.projectTitleId ? { cfProjectTitle: { id: kylas.projectTitleId } } : {}),
// //     //     // subSource: kylas.subSource,
// //     //     // utmSource: kylas.utmSource,
// //     //     // utmMedium: kylas.utmMedium,
// //     //     // utmCampaign: kylas.utmCampaign,
// //     // };
// // }

// // async function readResponseBody(response: Response): Promise<string> {
// //     try {
// //         return await response.text();
// //     } catch {
// //         return "";
// //     }
// // }

// export const kylasLeadService = {
//     async createAccountLead(input: CreateAccountLeadInput): Promise<void> {
//         // if (!config.kylas.accountLeadSyncEnabled) {
//         //     log.info("Kylas lead sync skipped (KYLAS_ACCOUNT_LEAD_SYNC_ENABLED is off)", {
//         //         nodeEnv: config.server.nodeEnv,
//         //     });
//         //     return;
//         // }

//         // const { apiKey, baseUrl, timeoutMs } = config.kylas;
//         // const endpoint = normalizeLeadEndpoint(baseUrl);

//         // if (!apiKey || !endpoint) {
//         //     log.warn("Kylas lead sync skipped (set KYLAS_API_KEY and KYLAS_API_BASE_URL)");
//         //     return;
//         // }

//         // let endpointUrl: URL;
//         // try {
//         //     endpointUrl = new URL(endpoint);
//         // } catch (error) {
//         //     log.warn("Kylas lead sync skipped because base URL is invalid", {
//         //         error: toErrorMessage(error),
//         //     });
//         //     return;
//         // }

//         const payload = buildPayload(input);

//         if (!payload.phoneNumbers?.length && input.phone.trim()) {
//             log.warn("Kylas lead sync omitting invalid mobile number", {
//                 email: input.email.toLowerCase().trim(),
//                 phone: input.phone,
//             });
//         }

//         // const response = await fetch(endpointUrl.toString(), {
//         //     method: "POST",
//         //     headers: {
//         //         "Content-Type": "application/json",
//         //         Accept: "application/json",
//         //         "api-key": apiKey,
//         //     },
//         //     body: JSON.stringify(payload),
//         //     signal: AbortSignal.timeout(timeoutMs),
//         // });

//         // if (!response.ok) {
//         //     const responseBody = await readResponseBody(response);
//         //     if (response.status === 400 && responseBody.includes("002020")) {
//         //         log.info("Kylas lead already exists for this email or phone", {
//         //             email: payload.emails[0]?.value,
//         //         });
//         //         return;
//         //     }
//         //     throw new Error(
//         //         `Kylas lead create failed with status ${response.status}: ${responseBody.slice(0, 500)}`
//         //     );
//         // }

//         // log.info("Kylas lead created for registered account", {
//         //     email: payload.emails[0]?.value,
//         //     phone: payload.phoneNumbers?.[0]?.value,
//         //     companyName: payload.companyName,
//         //     pipelineId: payload.pipeline.id,
//         //     pipelineStageId: payload.pipelineStage.id,
//         // });
//     },
// };

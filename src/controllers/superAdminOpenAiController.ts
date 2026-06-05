import type { Request, Response } from "express";
import { errorResponse, successResponse } from "../utils/apiResponse";
import { listOpenAiModelsForSuperAdminCatalog } from "../services/openAiModelsCatalogService";

export async function listOpenAiModelsCatalogHandler(_req: Request, res: Response) {
    try {
        const models = await listOpenAiModelsForSuperAdminCatalog();
        return successResponse(res, { data: { models }, statusCode: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to list OpenAI models";
        return errorResponse(res, { message, statusCode: 503 });
    }
}

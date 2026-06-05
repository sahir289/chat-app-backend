import type { Request, Response } from "express";
import { errorResponse } from "../utils/apiResponse";

export function notFoundHandler(_req: Request, res: Response) {
    return errorResponse(res, { statusCode: 404, message: "Route not found" });
}



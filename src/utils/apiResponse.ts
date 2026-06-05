import { Response } from "express";

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface SuccessResponseOptions {
    data?: any;
    message?: string;
    statusCode?: number;
    pagination?: Pagination;
}

interface ErrorResponseOptions {
    message?: string;
    statusCode?: number;
    errors?: any;
}

export const successResponse = (
    res: Response,
    {
        data = null,
        message = "Success",
        statusCode = 200,
        pagination,
    }: SuccessResponseOptions
) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        ...(pagination && { pagination }),
        timestamp: new Date().toISOString(),
    });
};

export const errorResponse = (
    res: Response,
    {
        message = "Something went wrong",
        statusCode = 500,
        errors,
    }: ErrorResponseOptions
) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors }),
        timestamp: new Date().toISOString(),
    });
};

export type ApiSuccess<T> = {
    success: true;
    message: string;
    data: T;
};

export type ApiError = {
    success: false;
    message: string;
    errors?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;



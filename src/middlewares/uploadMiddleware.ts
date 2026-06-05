import multer from "multer";
import { AppError } from "../utils/appError";
import {
    ALLOWED_TYPES,
    MAX_FILE_SIZE,
    MAX_PDF_SIZE,
    MAX_TOTAL_FILES_PER_MESSAGE,
} from "../constants/attachmentsConstants";

export interface MulterConfig {
    maxFileSize?: number;
    allowedTypes?: string[];
    errorMessage?: string;
}

export function createMulterUpload(config: MulterConfig = {}) {
    const {
        maxFileSize = 2 * 1024 * 1024,
        allowedTypes = [],
        errorMessage = "File type not allowed",
    } = config;

    return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxFileSize },
        fileFilter: (req, file, cb) => {
            if (allowedTypes.length === 0 || allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new AppError(400, errorMessage));
            }
        },
    });
}

export const uploadMiddleware = {

    attachments: createMulterUpload({
        // Keep this in sync with attachmentValidationMiddleware and frontend limits.
        maxFileSize: MAX_FILE_SIZE,
        allowedTypes: [...ALLOWED_TYPES],
        errorMessage: "File type not allowed. Only images (JPG, JPEG, PNG, WebP) and PDFs are supported.",
    }),

    images: createMulterUpload({
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ["image/jpg", "image/jpeg", "image/png", "image/webp", "image/gif"],
        errorMessage: "Only image files (JPG, JPEG, PNG, WebP, GIF) are allowed",
    }),

    pdfs: createMulterUpload({
        maxFileSize: MAX_PDF_SIZE,
        allowedTypes: ["application/pdf"],
        errorMessage: "Only PDF files are allowed",
    }),

    csv: createMulterUpload({
        maxFileSize: 2 * 1024 * 1024,
        allowedTypes: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
        errorMessage: "Only CSV files are allowed",
    }),
};

// Attachment upload middleware configured for multiple files
export const attachmentUploadMiddleware = uploadMiddleware.attachments.array("files", MAX_TOTAL_FILES_PER_MESSAGE);


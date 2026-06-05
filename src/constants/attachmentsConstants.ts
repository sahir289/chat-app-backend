export const MAX_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_PDF_SIZE = 2 * 1024 * 1024; // 2MB for PDFs
export const ALLOWED_TYPES: string[] = [
    "image/jpg",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
];
export const MAX_IMAGES_PER_MESSAGE = 3;
export const MAX_PDFS_PER_MESSAGE = 1;
export const MAX_TOTAL_FILES_PER_MESSAGE = 4;
export const MAX_TOTAL_UPLOAD_SIZE = MAX_TOTAL_FILES_PER_MESSAGE * MAX_FILE_SIZE; // 8MB per send


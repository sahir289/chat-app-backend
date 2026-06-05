import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../utils/appError";
import { config } from "../config";
import path from "node:path";
import crypto from "node:crypto";
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
    if (!s3Client) {
        const { accessKeyId, secretAccessKey, region, s3BucketName } = config.aws;

        if (!accessKeyId || !secretAccessKey || !s3BucketName) {
            throw new AppError(
                500,
                "AWS S3 is not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET_NAME environment variables."
            );
        }

        s3Client = new S3Client({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
    }
    return s3Client;
}

export type FileCategory = "attachments" | "logos" | "avatars";

function sanitizeCompanyNameForPath(companyName: string): string {
    const sanitized = companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^((-)+)|((-)+)$/g, '')
        .substring(0, 50);

    return sanitized || 'company';
}

function sanitizeFileNameForPath(fileName: string): string {
    const nameWithoutExt = path.basename(fileName, path.extname(fileName));

    const sanitized = nameWithoutExt
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^((-)+)|((-)+)$/g, '')
        .substring(0, 100);

    return sanitized || 'file';
}

export function buildAttachmentS3Key(
    companyId: string,
    chatId: string,
    messageId: string,
    originalFileName: string,
    messageCreatedAt?: Date | number,
    companyName?: string
): string {
    const fileExt = path.extname(originalFileName);
    const sanitizedFileName = sanitizeFileNameForPath(originalFileName);

    const timestamp = messageCreatedAt
        ? (typeof messageCreatedAt === 'number' ? messageCreatedAt : messageCreatedAt.getTime())
        : Date.now();

    const companyFolder = companyName ? sanitizeCompanyNameForPath(companyName) : 'companies';

    return `${companyFolder}/attachments/${companyId}/chats/${chatId}/messages/${messageId}/${sanitizedFileName}_${timestamp}${fileExt}`;
}

export function buildAvatarS3Key(
    companyId: string,
    userId: string,
    originalFileName: string,
    uploadDate?: Date,
    companyName?: string
): string {
    const fileExt = path.extname(originalFileName);

    const date = uploadDate || new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const companyFolder = companyName ? sanitizeCompanyNameForPath(companyName) : 'companies';

    return `${companyFolder}/avatars/${companyId}/users/${userId}/avatar_${dateStr}${fileExt}`;
}

export function buildLogoS3Key(
    companyId: string,
    originalFileName: string,
    uploadDate?: Date,
    companyName?: string
): string {
    const fileExt = path.extname(originalFileName);

    const date = uploadDate || new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const companyFolder = companyName ? sanitizeCompanyNameForPath(companyName) : 'companies';

    return `${companyFolder}/logos/${companyId}/logo_${dateStr}${fileExt}`;
}

export function extractS3Key(input: string): string {
    if (!input.startsWith("http://") && !input.startsWith("https://")) {
        return input;
    }

    const { s3BucketUrl, s3BucketName, region } = config.aws;
    let s3Key: string | null = null;

    if (s3BucketUrl && input.startsWith(s3BucketUrl)) {
        s3Key = input.replace(s3BucketUrl.replace(/\/+$/, "") + "/", "");
    } else if (input.includes(`s3.${region}.amazonaws.com/`)) {
        const urlParts = input.split(`s3.${region}.amazonaws.com/`);
        if (urlParts.length > 1) {
            s3Key = urlParts[1];
        }
    } else if (s3BucketName && input.includes(`s3.amazonaws.com/${s3BucketName}/`)) {
        s3Key = input.split(`s3.amazonaws.com/${s3BucketName}/`)[1];
    } else if (s3BucketName && input.includes(`${s3BucketName}.s3.${region}.amazonaws.com/`)) {
        s3Key = input.split(`${s3BucketName}.s3.${region}.amazonaws.com/`)[1];
    }

    if (!s3Key) {
        throw new AppError(400, "Could not extract S3 key from URL or input");
    }

    return s3Key;
}

export async function uploadFileToS3ByKey(
    fileBuffer: Buffer,
    s3Key: string,
    mimeType: string,
    contentDisposition?: string
): Promise<string> {
    try {
        const client = getS3Client();

        const putObjectParams: any = {
            Bucket: config.aws.s3BucketName!,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: mimeType,
        };

        if (contentDisposition) {
            putObjectParams.ContentDisposition = contentDisposition;
        }

        const command = new PutObjectCommand(putObjectParams);
        await client.send(command);

        return s3Key;
    } catch (error: any) {

        if (error.name === "AccessDenied" || error.Code === "AccessDenied") {
            const errorMessage = error.message || "";
            if (errorMessage.includes("s3:PutObject") && errorMessage.includes("not authorized")) {
                throw new AppError(
                    500,
                    "S3 upload failed: The AWS IAM user does not have permission to upload files. " +
                    "Please ensure the IAM user has 's3:PutObject' permission for the bucket. " +
                    "Contact your AWS administrator to update the IAM policy."
                );
            }
        }

        throw new AppError(500, `Failed to upload file to S3: ${error.message || "Unknown error"}`);
    }
}

export async function uploadFileToS3(
    fileBuffer: Buffer,
    originalFileName: string,
    mimeType: string,
    category: FileCategory,
    contentDisposition?: string
): Promise<string> {
    const fileExt = path.extname(originalFileName);
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const fileName = `${uniqueId}${fileExt}`;
    const s3Key = `${category}/${fileName}`;

    await uploadFileToS3ByKey(fileBuffer, s3Key, mimeType, contentDisposition);

    const { s3BucketUrl, s3BucketName, region } = config.aws;
    if (s3BucketUrl) {
        return `${s3BucketUrl.replace(/\/+$/, "")}/${s3Key}`;
    } else {
        return `https://${s3BucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    }
}

export async function deleteFileFromS3(s3KeyOrUrl: string): Promise<void> {
    try {
        let s3Key: string;
        try {
            s3Key = extractS3Key(s3KeyOrUrl);
        } catch (error) {
            return;
        }

        const client = getS3Client();
        const command = new DeleteObjectCommand({
            Bucket: config.aws.s3BucketName!,
            Key: s3Key,
        });

        await client.send(command);
    } catch (error: any) {
    }
}

/** Load logo bytes for embedding in PDFs; returns null if missing, invalid, or S3 unavailable. */
export async function getCompanyLogoBuffer(
    logoS3Key: string | null | undefined,
    companyId: string
): Promise<Buffer | null> {
    if (!logoS3Key || !String(logoS3Key).trim()) {
        return null;
    }
    try {
        const key = extractS3Key(String(logoS3Key).trim());
        if (!validateCompanyOwnership(key, companyId)) {
            return null;
        }
        const client = getS3Client();
        const command = new GetObjectCommand({
            Bucket: config.aws.s3BucketName!,
            Key: key,
        });
        const response = await client.send(command);
        if (!response.Body) {
            return null;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    } catch {
        return null;
    }
}

export async function getPresignedUrl(
    s3KeyOrUrl: string,
    companyId: string,
    expiresIn: number = 3600
): Promise<string> {
    try {
        const s3Key = extractS3Key(s3KeyOrUrl);

        if (!validateCompanyOwnership(s3Key, companyId)) {
            throw new AppError(403, "Access denied: File does not belong to your company");
        }

        const client = getS3Client();
        const command = new GetObjectCommand({
            Bucket: config.aws.s3BucketName!,
            Key: s3Key,
        });

        const presignedUrl = await getSignedUrl(client, command, { expiresIn });
        return presignedUrl;
    } catch (error: any) {
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError(500, `Failed to generate presigned URL: ${error.message || "Unknown error"}`);
    }
}

export function validateCompanyOwnership(s3Key: string, companyId: string): boolean {

    const newPattern = new RegExp(`^[^/]+/(attachments|avatars|logos)/${companyId}/`);

    const legacyPattern = new RegExp(`^companies/(attachments|avatars|logos)/${companyId}/`);

    const oldPattern = new RegExp(`^(attachments|avatars|logos)/companies/${companyId}/`);

    return newPattern.test(s3Key) || legacyPattern.test(s3Key) || oldPattern.test(s3Key);
}


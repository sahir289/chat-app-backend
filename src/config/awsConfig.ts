export const awsConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "ap-south-1",
    s3BucketName: process.env.AWS_S3_BUCKET_NAME || "",
    s3BucketUrl: process.env.AWS_S3_BUCKET_URL || "",
} as const;


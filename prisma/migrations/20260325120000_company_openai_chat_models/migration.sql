-- AlterTable
ALTER TABLE "Company" ADD COLUMN "allowedOpenAiChatModels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "openAiChatModelId" TEXT;

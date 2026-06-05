-- AlterTable
ALTER TABLE "AiTokenUsage" ADD COLUMN     "creditsConsumedMilli" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyCreditsConsumedMilli" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "topupCreditsConsumedMilli" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AiTopup" ADD COLUMN     "creditsAddedMilli" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditsRemainingMilli" INTEGER NOT NULL DEFAULT 0;

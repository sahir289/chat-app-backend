-- AlterTable: make email optional and add userId for widget lead capture
ALTER TABLE "Lead" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "Lead" ADD COLUMN "userId" TEXT;

CREATE INDEX "Lead_userId_idx" ON "Lead"("userId");

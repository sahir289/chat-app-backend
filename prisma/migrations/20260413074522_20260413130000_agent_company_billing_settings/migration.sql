/*
  Warnings:

  - You are about to drop the column `countryCode` on the `Visitor` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `Visitor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Visitor" DROP COLUMN "countryCode",
DROP COLUMN "region";

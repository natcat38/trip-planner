-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiKeyCiphertext" TEXT,
ADD COLUMN     "aiKeyIv" TEXT,
ADD COLUMN     "aiKeyTag" TEXT,
ADD COLUMN     "aiKeyUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiProvider" TEXT;

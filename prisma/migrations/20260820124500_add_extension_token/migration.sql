-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extensionTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN     "extensionTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_extensionTokenHash_key" ON "User"("extensionTokenHash");


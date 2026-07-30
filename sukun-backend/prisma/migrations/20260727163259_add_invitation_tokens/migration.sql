-- CreateEnum
CREATE TYPE "InvitationPurpose" AS ENUM ('TECHNICIAN_ACTIVATION');

-- CreateTable
CREATE TABLE "invitation_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "InvitationPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_token_hash_key" ON "invitation_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "invitation_tokens_user_id_idx" ON "invitation_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

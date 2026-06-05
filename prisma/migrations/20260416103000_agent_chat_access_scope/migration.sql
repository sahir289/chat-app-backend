-- Track whether an agent can view all chats on assigned properties
-- or only chats explicitly assigned to them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AgentChatAccessScope'
  ) THEN
    CREATE TYPE "AgentChatAccessScope" AS ENUM ('ALL_CHATS', 'ONLY_ASSIGNED_CHATS');
  END IF;
END $$;

ALTER TABLE "AgentModuleAccess"
ADD COLUMN IF NOT EXISTS "chatAccessScope" "AgentChatAccessScope" NOT NULL DEFAULT 'ALL_CHATS';

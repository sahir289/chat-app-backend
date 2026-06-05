-- Add optional custom system prompt for a property/widget.
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "customSystemPrompt" TEXT;


ALTER TABLE "drivers" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "suspend_reason" text;
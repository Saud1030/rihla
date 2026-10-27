CREATE TYPE "public"."refund_status" AS ENUM('none', 'pending_approval', 'requested', 'manual', 'failed');--> statement-breakpoint
ALTER TYPE "public"."pricing_mode" ADD VALUE 'hourly';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "hours" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_status" "refund_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_reference" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_error" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "hourly_6" integer DEFAULT 35000 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "hourly_12" integer DEFAULT 60000 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "hourly_24" integer DEFAULT 100000 NOT NULL;
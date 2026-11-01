ALTER TYPE "public"."driver_doc_kind" ADD VALUE 'iban';--> statement-breakpoint
ALTER TABLE "driver_payouts" ADD COLUMN "method" text DEFAULT 'transfer' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_payouts" ADD COLUMN "receipt" "bytea";--> statement-breakpoint
ALTER TABLE "driver_payouts" ADD COLUMN "receipt_mime" text;
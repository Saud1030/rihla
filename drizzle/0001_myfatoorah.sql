ALTER TABLE "bookings" ADD COLUMN "invoice_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_id" text;
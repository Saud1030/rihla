CREATE SEQUENCE "public"."invoice_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."receipt_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "receipt_no" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "receipt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "invoice_no" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "invoice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_receipt_no_unique" UNIQUE("receipt_no");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_invoice_no_unique" UNIQUE("invoice_no");--> statement-breakpoint
-- bookings paid before this version get their voucher (and finished trips their invoice), in date order
UPDATE "bookings" b SET "receipt_no" = n.no, "receipt_at" = coalesce(b."paid_at", b."created_at")
FROM (SELECT id, nextval('receipt_no_seq') AS no FROM (SELECT id FROM "bookings" WHERE "payment_id" IS NOT NULL AND "paid_at" IS NOT NULL ORDER BY "paid_at", "created_at") o) n
WHERE b.id = n.id;--> statement-breakpoint
UPDATE "bookings" b SET "invoice_no" = n.no, "invoice_at" = coalesce(b."completed_at", b."updated_at")
FROM (SELECT id, nextval('invoice_no_seq') AS no FROM (SELECT id FROM "bookings" WHERE "status" = 'completed' ORDER BY "completed_at", "created_at") o) n
WHERE b.id = n.id;

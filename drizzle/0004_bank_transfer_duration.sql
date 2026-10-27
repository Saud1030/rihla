CREATE TYPE "public"."payment_method" AS ENUM('myfatoorah', 'bank_transfer');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "duration_min" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
UPDATE "bookings" SET "duration_min" = "hours" * 60 WHERE "hours" IS NOT NULL;--> statement-breakpoint
UPDATE "bookings" b SET "duration_min" = r."duration_min" FROM "trips" t JOIN "routes" r ON r."id" = t."route_id" WHERE b."trip_id" = t."id" AND b."duration_min" IS NULL;--> statement-breakpoint
UPDATE "bookings" SET "payment_method" = 'myfatoorah' WHERE "payment_id" IS NOT NULL OR "invoice_id" IS NOT NULL;

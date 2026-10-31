ALTER TYPE "public"."pricing_mode" ADD VALUE 'multi';--> statement-breakpoint
CREATE TABLE "driver_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "stops" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driver_fare" integer;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "bank_account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_payouts_driver_idx" ON "driver_payouts" USING btree ("driver_id");
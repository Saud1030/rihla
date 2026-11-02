CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"percent" integer NOT NULL,
	"bookings_count" integer NOT NULL,
	"earned_booking_id" uuid,
	"used_at" timestamp with time zone,
	"used_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_earned_booking_id_bookings_id_fk" FOREIGN KEY ("earned_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_used_booking_id_bookings_id_fk" FOREIGN KEY ("used_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_customer_count" ON "promo_codes" USING btree ("customer_phone","bookings_count");
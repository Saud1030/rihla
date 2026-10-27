CREATE TYPE "public"."location_kind" AS ENUM('airport', 'station', 'city', 'hotels', 'religious', 'landmark', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('fixed', 'distance');--> statement-breakpoint
CREATE TABLE "assets" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"region" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pricing_mode" "pricing_mode" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "from_location_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "to_location_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vehicle_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "distance_km" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "subtotal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vat_rate" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vat_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "kind" "location_kind" DEFAULT 'city' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "base_fare" integer DEFAULT 6000 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "per_km" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "min_fare" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_city_idx" ON "locations" USING btree ("city");--> statement-breakpoint
-- existing bookings were charged without VAT: their subtotal is the full amount
UPDATE "bookings" SET "subtotal" = "amount" WHERE "subtotal" = 0;

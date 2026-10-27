CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'paid', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'paid', 'failed', 'authorized', 'captured', 'refunded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."route_kind" AS ENUM('transfer', 'ziyarat');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('sedan', 'suv', 'van', 'coaster', 'bus');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"trip_id" integer,
	"route_title" text NOT NULL,
	"vehicle_name" text NOT NULL,
	"reversed" boolean DEFAULT false NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"passengers" integer NOT NULL,
	"bags" integer DEFAULT 0 NOT NULL,
	"pickup_date" date NOT NULL,
	"pickup_time" text NOT NULL,
	"pickup_address" text NOT NULL,
	"dropoff_address" text,
	"flight_number" text,
	"notes" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_id" text,
	"paid_at" timestamp with time zone,
	"locale" text DEFAULT 'ar' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ref_unique" UNIQUE("ref"),
	CONSTRAINT "bookings_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"city" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" uuid,
	"status" "payment_status" NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"source" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" "route_kind" DEFAULT 'transfer' NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_id" integer,
	"bidirectional" boolean DEFAULT true NOT NULL,
	"distance_km" integer,
	"duration_min" integer,
	"title_ar" text,
	"title_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "routes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"passengers" integer NOT NULL,
	"bags" integer NOT NULL,
	"image_url" text,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vehicles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bookings_pickup_idx" ON "bookings" USING btree ("pickup_date");--> statement-breakpoint
CREATE INDEX "routes_from_idx" ON "routes" USING btree ("from_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_route_vehicle_uq" ON "trips" USING btree ("route_id","vehicle_id");
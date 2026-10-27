CREATE TYPE "public"."notify_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."notify_status" AS ENUM('pending', 'sent', 'failed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'staff', 'driver');--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"plate_number" text NOT NULL,
	"car_type" text NOT NULL,
	"car_model" text DEFAULT '' NOT NULL,
	"car_color" text DEFAULT '' NOT NULL,
	"photo_mime" text,
	"photo" "bytea",
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" uuid,
	"channel" "notify_channel" NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"recipient_name" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "notify_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"driver_id" integer,
	"driver_stars" integer NOT NULL,
	"company_stars" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "role" "user_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "driver_id" integer;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driver_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driver_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rating_token_hash" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rating_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_booking_idx" ON "notifications" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ratings_driver_idx" ON "ratings" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "ratings_created_idx" ON "ratings" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_driver_idx" ON "bookings" USING btree ("driver_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rating_token_hash_unique" UNIQUE("rating_token_hash");
ALTER TYPE "public"."pricing_mode" ADD VALUE 'package';--> statement-breakpoint
CREATE TABLE "installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"amount" integer NOT NULL,
	"token" text NOT NULL,
	"invoice_id" text,
	"payment_id" text,
	"method" text,
	"paid_at" timestamp with time zone,
	"link_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_token_unique" UNIQUE("token"),
	CONSTRAINT "installments_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"details_ar" text DEFAULT '' NOT NULL,
	"details_en" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"installments" integer DEFAULT 2 NOT NULL,
	"vehicle_id" integer,
	"passengers" integer DEFAULT 4 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "package_id" integer;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "installments_booking_seq" ON "installments" USING btree ("booking_id","seq");
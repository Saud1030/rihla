CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"percent" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "price_adjust" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "price_adjust_note" text DEFAULT '' NOT NULL;
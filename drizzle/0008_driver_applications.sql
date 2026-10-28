CREATE TYPE "public"."driver_doc_kind" AS ENUM('id_card', 'registration', 'car_inside', 'car_outside');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"kind" "driver_doc_kind" NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "vehicle_id" integer;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "status" "driver_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_documents_driver_kind_uq" ON "driver_documents" USING btree ("driver_id","kind");--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
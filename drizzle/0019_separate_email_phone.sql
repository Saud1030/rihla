ALTER TYPE "public"."driver_doc_kind" ADD VALUE 'car_outside_back';--> statement-breakpoint
ALTER TYPE "public"."driver_doc_kind" ADD VALUE 'car_outside_side';--> statement-breakpoint
ALTER TYPE "public"."driver_doc_kind" ADD VALUE 'car_inside_back';--> statement-breakpoint
ALTER TYPE "public"."driver_doc_kind" ADD VALUE 'car_inside_dash';--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_phone_unique" UNIQUE("phone");--> statement-breakpoint
UPDATE "admin_users" SET "phone" = "email", "email" = NULL WHERE "email" LIKE '+%';

ALTER TABLE "installments" ADD COLUMN "due" text DEFAULT 'before' NOT NULL;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "after_trip" integer DEFAULT 0 NOT NULL;
ALTER TABLE "banners" ADD COLUMN "layout" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "tone" text DEFAULT 'dark' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "cta_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "cta_en" text DEFAULT '' NOT NULL;
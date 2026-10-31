ALTER TABLE "vehicles" RENAME COLUMN "hourly_6" TO "hourly_10";--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "hourly_10" SET DEFAULT 55000;--> statement-breakpoint
-- the short package is now 10 hours instead of 6: its prices grow in proportion, rounded up to 10 SAR
UPDATE "vehicles" SET "hourly_10" = ceil("hourly_10" * 10 / 6.0 / 1000) * 1000;

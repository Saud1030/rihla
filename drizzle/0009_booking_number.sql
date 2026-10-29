ALTER TABLE "bookings" ADD COLUMN "number" serial NOT NULL;--> statement-breakpoint
-- existing bookings are numbered in the order they were made, and new ones continue from there
UPDATE "bookings" b SET "number" = o.n FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM "bookings") o WHERE o.id = b.id;--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('bookings', 'number'), COALESCE((SELECT max("number") FROM "bookings"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_number_unique" UNIQUE("number");

CREATE TABLE "city_hourly_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"vehicle_id" integer NOT NULL,
	"hours" integer NOT NULL,
	"price" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "legs" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "hourly_city" text;--> statement-breakpoint
ALTER TABLE "city_hourly_prices" ADD CONSTRAINT "city_hourly_prices_city_cities_slug_fk" FOREIGN KEY ("city") REFERENCES "public"."cities"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "city_hourly_prices" ADD CONSTRAINT "city_hourly_prices_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "city_hourly_prices_uq" ON "city_hourly_prices" USING btree ("city","vehicle_id","hours");
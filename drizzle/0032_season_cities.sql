CREATE TABLE "season_cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"city" text NOT NULL,
	"percent" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_cities" ADD CONSTRAINT "season_cities_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_cities" ADD CONSTRAINT "season_cities_city_cities_slug_fk" FOREIGN KEY ("city") REFERENCES "public"."cities"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "season_cities_uq" ON "season_cities" USING btree ("season_id","city");
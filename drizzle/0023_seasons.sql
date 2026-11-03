CREATE TABLE "seasons" (
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
INSERT INTO "seasons" ("name_ar", "name_en", "percent", "start_date", "end_date", "active") VALUES
  ('موسم رمضان والعمرة', 'Ramadan & Umrah season', 0, '2027-02-08', '2027-03-13', true),
  ('موسم الحج', 'Hajj season', 0, '2027-04-22', '2027-05-26', true);

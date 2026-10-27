CREATE TYPE "public"."chat_sender" AS ENUM('customer', 'bot', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_status" AS ENUM('bot', 'waiting', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"text_ar" text DEFAULT '' NOT NULL,
	"text_en" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"status" "chat_status" DEFAULT 'bot' NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"booking_ref" text,
	"unread_admin" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "chat_faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_ar" text NOT NULL,
	"question_en" text DEFAULT '' NOT NULL,
	"answer_ar" text NOT NULL,
	"answer_en" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" "chat_sender" NOT NULL,
	"body" text NOT NULL,
	"staff_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"file_name" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_status_idx" ON "chat_conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "receipts_booking_idx" ON "receipts" USING btree ("booking_id");
-- The old online gateway is gone. Keep its payments, but under a neutral name.
ALTER TYPE "public"."payment_method" RENAME VALUE 'myfatoorah' TO 'online';--> statement-breakpoint
UPDATE "installments" SET "method" = 'online' WHERE "method" = 'myfatoorah';--> statement-breakpoint
UPDATE "settings" SET "value" = '' WHERE "key" = 'pay_gateway' AND "value" = 'myfatoorah';

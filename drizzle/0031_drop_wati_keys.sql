-- WATI was removed: WhatsApp goes straight through Meta. Drop its saved endpoint and token.
DELETE FROM "settings" WHERE "key" IN ('wati_endpoint', 'wati_token');

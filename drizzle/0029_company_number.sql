-- The company's own number for calls and the WhatsApp button, replacing the sample number (a number already changed in the panel stays).
UPDATE "settings" SET "value" = '+966557002715' WHERE "key" = 'phone' AND "value" = '+966500000000';
UPDATE "settings" SET "value" = '966557002715' WHERE "key" = 'whatsapp' AND "value" = '966500000000';

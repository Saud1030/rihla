-- Payment gateways and invoicing platforms start switched off (Admin -> Payment gateways & invoicing).
-- Saved keys stay; only the choice of the active one is cleared.
UPDATE "settings" SET "value" = '' WHERE "key" IN ('einv_provider', 'pay_gateway');

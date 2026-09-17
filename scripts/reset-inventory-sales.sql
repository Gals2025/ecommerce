-- ============================================================================
-- FRESH INVENTORY + SALES (INCLUDING CATALOG)
-- Scope:  wipes transactions + catalog. Keeps users/customers, tiers, promos
--         config, locations, shipping, settings, brands, categories,
--         email_logs, audit_logs.
-- Safety: pg_dump BEFORE running. Dev database only. Single transaction —
--         any error rolls everything back. Dry-run first with ROLLBACK
--         (see bottom), then re-run ending in COMMIT.
-- Run:    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reset-inventory-sales.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- Step 0 ---
-- Pre-flight: confirm what you're about to delete. Eyeball before proceeding.
SELECT 'carts' AS t, COUNT(*) FROM carts
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'returns', COUNT(*) FROM returns
UNION ALL SELECT 'refunds', COUNT(*) FROM refunds
UNION ALL SELECT 'promotion_usage', COUNT(*) FROM promotion_usage
UNION ALL SELECT 'memberships', COUNT(*) FROM memberships
UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
UNION ALL SELECT 'inventory_balances', COUNT(*) FROM inventory_balances
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'products', COUNT(*) FROM products;

-- ---------------------------------------------------------------- Step 1 ---
-- SALES PIPELINE, child → parent. Order is load-bearing:
--   return_items must precede order_items (no cascade on order_item_id),
--   refunds must precede returns (no cascade on return_id),
--   returns + refunds must precede orders (no cascade on order_id).
-- Deleting orders cascades: order_items, payments, shipments,
-- order_status_history, order_notes, order_promotions.
DELETE FROM return_items;
DELETE FROM refunds;
DELETE FROM returns;
DELETE FROM promotion_usage;          -- no FK; independent
DELETE FROM cart_items;
DELETE FROM carts;                    -- (cart_items already gone; belt + suspenders)
DELETE FROM orders;                   -- cascades items/payments/shipments/history/notes/promos

-- ---------------------------------------------------------------- Step 2 ---
-- MEMBERSHIP SALES (config table membership_tiers is kept).
DELETE FROM memberships;              -- paid memberships
DELETE FROM customer_memberships;     -- spend-based tier trail

-- ---------------------------------------------------------------- Step 3 ---
-- DERIVED COUNTERS: keep rows, zero the numbers.
UPDATE customers SET lifetime_spend = 0, updated_at = NOW();
UPDATE promotion_codes SET used_count = 0, updated_at = NOW();

-- ---------------------------------------------------------------- Step 4 ---
-- INVENTORY. movements.variant_id has NO cascade → movements before variants.
-- (Balances would cascade from variants, but explicit is safer.)
DELETE FROM inventory_movements;
DELETE FROM inventory_balances;

-- ---------------------------------------------------------------- Step 5 ---
-- CATALOG. Explicit child-first; cascades (images/attrs/variants ← products,
-- member_prices + promotion scopes ← variants/products) back this up.
-- NOTE: member_prices rows die here via cascade — re-seed tier prices after.
DELETE FROM variant_attribute_values;
DELETE FROM product_attribute_values;
DELETE FROM product_attributes;
DELETE FROM product_images;
DELETE FROM product_variants;
DELETE FROM products;
-- brands + categories intentionally KEPT (taxonomy; category self-FK makes
-- deletion fiddly, and seed is idempotent via onConflictDoNothing).
-- email_logs intentionally KEPT per owner decision (order_id SET NULLs safely).
-- audit_logs intentionally KEPT per owner decision (accountability trail —
-- it will record this reset if the app audit path is used).

-- ---------------------------------------------------------------- Step 6 ---
-- Post-flight: every cleared table must read 0.
SELECT 'carts' AS t, COUNT(*) FROM carts
UNION ALL SELECT 'cart_items', COUNT(*) FROM cart_items
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'shipments', COUNT(*) FROM shipments
UNION ALL SELECT 'order_status_history', COUNT(*) FROM order_status_history
UNION ALL SELECT 'order_notes', COUNT(*) FROM order_notes
UNION ALL SELECT 'order_promotions', COUNT(*) FROM order_promotions
UNION ALL SELECT 'returns', COUNT(*) FROM returns
UNION ALL SELECT 'return_items', COUNT(*) FROM return_items
UNION ALL SELECT 'refunds', COUNT(*) FROM refunds
UNION ALL SELECT 'promotion_usage', COUNT(*) FROM promotion_usage
UNION ALL SELECT 'memberships', COUNT(*) FROM memberships
UNION ALL SELECT 'customer_memberships', COUNT(*) FROM customer_memberships
UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
UNION ALL SELECT 'inventory_balances', COUNT(*) FROM inventory_balances
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_images', COUNT(*) FROM product_images
UNION ALL SELECT 'member_prices (cascaded)', COUNT(*) FROM member_prices;

-- Kept-table sanity (should be unchanged from Step 0 / your backup):
-- SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM customers;
-- SELECT COUNT(*) FROM membership_tiers; SELECT COUNT(*) FROM promotions;
-- SELECT COUNT(*) FROM inventory_locations; SELECT COUNT(*) FROM settings;
-- SELECT COUNT(*) FROM email_logs; SELECT COUNT(*) FROM audit_logs;

COMMIT;
-- For a dry run: replace COMMIT with ROLLBACK, run, inspect output, then
-- re-run the file with COMMIT once Step 6 reads all zeros.

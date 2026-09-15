-- CHECKPOINT 02 verification protocol. Run in Neon SQL editor after
-- `npm run db:push && npm run db:seed`.
-- Every query below must return the expected result noted in its comment.

-- 1. Table count: expect 43
SELECT count(*) AS tables FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. FK count on core tables: expect > 50
SELECT count(*) AS foreign_keys FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY';

-- 3. CHECK constraints present (money guards, status whitelists): expect >= 20
SELECT count(*) AS checks FROM information_schema.table_constraints
WHERE constraint_type = 'CHECK';

-- 4. No negative balances: expect 0 rows
SELECT * FROM inventory_balances WHERE on_hand < 0 OR reserved < 0 OR reserved > on_hand;

-- 5. Every balance row has an opening movement: expect 0 orphans
SELECT b.* FROM inventory_balances b
LEFT JOIN inventory_movements m
  ON m.variant_id = b.variant_id
  AND (m.to_location_id = b.location_id OR m.from_location_id = b.location_id)
WHERE m.id IS NULL;

-- 6. Order items fully snapshotted: expect 0 rows
SELECT * FROM order_items
WHERE product_name IS NULL OR sku IS NULL
   OR original_unit_price IS NULL OR effective_unit_price IS NULL
   OR quantity IS NULL OR line_total IS NULL;

-- 7. Every order has status history: expect 0 rows
SELECT o.* FROM orders o
LEFT JOIN order_status_history h ON h.order_id = o.id
WHERE h.id IS NULL;

-- 8. Promotion usage traceable to orders: expect usage rows for seed order
SELECT p.name, u.discount, u.order_id FROM promotion_usage u
JOIN promotions p ON p.id = u.promotion_id;

-- 9. Roles seeded (6) and admin granted: expect 6 / >= 1
SELECT count(*) AS roles FROM roles;
SELECT u.email, r.name FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id;

-- 10. Unique guards work (each must FAIL):
-- INSERT INTO promotion_codes (promotion_id, code) SELECT id, 'WELCOME10' FROM promotions LIMIT 1;
-- INSERT INTO inventory_balances (variant_id, location_id) SELECT variant_id, location_id FROM inventory_balances LIMIT 1;

-- 11. FK guards work (must FAIL):
-- INSERT INTO order_items (order_id, product_name, sku, original_unit_price, effective_unit_price, quantity, line_total)
-- VALUES ('00000000-0000-0000-0000-000000000000','x','x',1,1,1,1);

-- 12. Soft-delete partial index allows slug reuse (informational):
SELECT indexname FROM pg_indexes WHERE tablename = 'products';

-- Data contoh untuk database pengembangan baru.
INSERT INTO brand(brand_name) VALUES ('Contoh');
INSERT INTO product(product_name, brand_id, price_product, sell_price, stok)
SELECT 'Air Mineral', brand_id, 3000, 0, 100 FROM brand WHERE brand_name = 'Contoh';
INSERT INTO plastik(plastik_name, stok) VALUES ('PET',1000),('PP',800),('Bodong',500);
INSERT INTO metode_bayar(payment_method) VALUES ('Cash'),('Transfer')
ON CONFLICT (payment_method) DO NOTHING;

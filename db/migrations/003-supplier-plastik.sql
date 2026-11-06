-- Daftar supplier dan relasi opsional dari transaksi lama.
CREATE TABLE IF NOT EXISTS supplier (
 supplier_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 supplier_name VARCHAR(160) NOT NULL UNIQUE
);
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES supplier(supplier_id);

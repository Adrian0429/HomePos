-- Catat pabrik tujuan pada pengiriman plastik.
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS factory_name VARCHAR(160);

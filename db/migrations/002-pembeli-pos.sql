-- Nama pembeli opsional pada transaksi POS; aman dijalankan berulang kali.
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160);

-- Aman dijalankan berulang: nama metode memiliki constraint UNIQUE.
-- Metode yang sudah ada tetap dipertahankan untuk riwayat transaksi.
BEGIN;
INSERT INTO metode_bayar (payment_method)
VALUES ('Cash'), ('Transfer')
ON CONFLICT (payment_method) DO NOTHING;
COMMIT;

-- Penambahan enum aman dijalankan ulang; tidak mengubah transaksi lama.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'Restok Minuman';

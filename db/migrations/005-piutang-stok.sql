-- Piutang penjualan dan restok, beserta pelacakan stok berdasarkan lot.
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS debt_kind VARCHAR(20);
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS debt_paid NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS debt_due_date DATE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transaksi_debt_kind_check') THEN
    ALTER TABLE transaksi ADD CONSTRAINT transaksi_debt_kind_check
      CHECK (debt_kind IS NULL OR debt_kind IN ('restock','customer'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS transaksi_piutang_idx ON transaksi(debt_kind, debt_due_date, transaksi_id)
  WHERE debt_kind IS NOT NULL;

CREATE TABLE IF NOT EXISTS product_stock_lot (
  lot_id BIGSERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  restock_transaction_id INTEGER REFERENCES transaksi(transaksi_id) ON DELETE SET NULL,
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_stock_lot_fifo_idx ON product_stock_lot(product_id, lot_id);

-- Stok yang sudah ada saat migrasi dianggap stok non-piutang (stok awal).
INSERT INTO product_stock_lot(product_id, restock_transaction_id, initial_quantity, remaining_quantity)
SELECT p.product_id, NULL, p.stok, p.stok FROM product p
WHERE NOT EXISTS (SELECT 1 FROM product_stock_lot l WHERE l.product_id=p.product_id);

CREATE TABLE IF NOT EXISTS transaksi_debt_payment (
  payment_id BIGSERIAL PRIMARY KEY,
  transaksi_id INTEGER NOT NULL REFERENCES transaksi(transaksi_id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transaksi_debt_payment_tx_idx ON transaksi_debt_payment(transaksi_id, paid_at);

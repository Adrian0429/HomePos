BEGIN;
-- snake_case memetakan nama kolom rancangan; uang 2 desimal, berat 3 desimal.
CREATE TYPE transaction_type AS ENUM ('Jual Minuman', 'Beli Plastik', 'Kirim Pabrik', 'Restok Minuman');
CREATE TYPE transaction_status AS ENUM ('Selesai', 'Menunggu Pabrik', 'Batal');
CREATE TABLE brand (
 brand_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 brand_name VARCHAR(120) NOT NULL UNIQUE
);
CREATE TABLE product (
 product_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_name VARCHAR(160) NOT NULL,
 brand_id INT NOT NULL REFERENCES brand(brand_id),
 price_product NUMERIC(18,2) NOT NULL CHECK (price_product >= 0),
 -- Kolom legacy tetap ada untuk kompatibilitas; harga jual dicatat per detail transaksi.
 sell_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
 stok INT NOT NULL DEFAULT 0 CHECK (stok >= 0)
);
CREATE TABLE plastik (
 plastik_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 plastik_name VARCHAR(120) NOT NULL UNIQUE,
 stok NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (stok >= 0)
);
CREATE TABLE metode_bayar (
 method_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_method VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE supplier (
 supplier_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 supplier_name VARCHAR(160) NOT NULL UNIQUE
);
CREATE TABLE transaksi (
 transaksi_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 transaction_date DATE NOT NULL,
 selesai_date DATE,
 total_nominal NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_nominal >= 0),
 method_id INT REFERENCES metode_bayar(method_id),
 customer_name VARCHAR(160),
 supplier_id INT REFERENCES supplier(supplier_id),
 type transaction_type NOT NULL,
 status transaction_status NOT NULL,
 CHECK (selesai_date IS NULL OR selesai_date >= transaction_date),
 CHECK (status <> 'Selesai' OR selesai_date IS NOT NULL),
 CHECK (status <> 'Menunggu Pabrik' OR
   (type = 'Kirim Pabrik' AND selesai_date IS NULL AND total_nominal = 0 AND method_id IS NULL))
);
CREATE TABLE detail_transaksi_product (
 detail_transaksi_product_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 transaksi_id INT NOT NULL REFERENCES transaksi(transaksi_id),
 product_id INT NOT NULL REFERENCES product(product_id),
 jumlah INT NOT NULL CHECK (jumlah > 0),
 harga_satuan NUMERIC(18,2) NOT NULL CHECK (harga_satuan >= 0),
 subtotal NUMERIC(18,2) GENERATED ALWAYS AS (jumlah * harga_satuan) STORED,
 UNIQUE(transaksi_id, product_id)
);
CREATE TABLE detail_transaksi_plastik (
 detail_transaksi_plastik_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 transaksi_id INT NOT NULL REFERENCES transaksi(transaksi_id),
 plastik_id INT NOT NULL REFERENCES plastik(plastik_id),
 berat_kirim NUMERIC(18,3) NOT NULL CHECK (berat_kirim > 0),
 berat_diterima NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (berat_diterima >= 0),
 harga_satuan NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (harga_satuan >= 0),
 subtotal NUMERIC(18,2) GENERATED ALWAYS AS (round(berat_diterima * harga_satuan, 2)) STORED,
 UNIQUE(transaksi_id, plastik_id)
);
CREATE INDEX transaksi_date_idx ON transaksi(transaction_date);
CREATE INDEX transaksi_pending_idx ON transaksi(transaksi_id) WHERE status = 'Menunggu Pabrik';
CREATE INDEX product_brand_idx ON product(brand_id);
CREATE INDEX transaksi_method_idx ON transaksi(method_id);
CREATE INDEX detail_product_product_idx ON detail_transaksi_product(product_id);
CREATE INDEX detail_plastik_plastik_idx ON detail_transaksi_plastik(plastik_id);
CREATE TABLE app_user (
 user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username VARCHAR(80) NOT NULL UNIQUE,
 password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE app_session (
 session_hash TEXT PRIMARY KEY,
 user_id INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX app_session_expiry_idx ON app_session(expires_at);
COMMIT;

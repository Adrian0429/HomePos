# HomePOS

Seeder khusus metode pembayaran Cash dan Transfer (tanpa data contoh barang):

```bash
psql -h localhost -p 5432 -U homepos_app -d homepos -W -v ON_ERROR_STOP=1 -f db/seed-payment-methods.sql
```

Seeder ini aman dijalankan berulang dan mempertahankan metode lain yang sudah ada. Muat ulang halaman aplikasi setelah menjalankannya.

Kerangka Next.js App Router + TypeScript + Tailwind CSS + PostgreSQL. Backend menggunakan Route Handlers; Go tidak diperlukan untuk cakupan ini.

## Menjalankan

1. Gunakan Node.js >= 20.9 dan PostgreSQL >= 14.
2. `npm install`
3. Buat database kosong: `createdb homepos`
4. `psql -h localhost -p 5432 -U homepos_app -d homepos \ -W -v ON_ERROR_STOP=1 -f db/schema.sql`
5. Opsional untuk pengembangan: `psql -d homepos -v ON_ERROR_STOP=1 -f db/seed.sql`
6. Salin `.env.example` menjadi `.env.local` lalu sesuaikan `DATABASE_URL`.
7. `npm run dev`, buka http://localhost:3000.

Skema dijalankan sekali pada database baru. Nama tabel/kolom menggunakan snake_case dengan pemetaan langsung ke rancangan awal. Primary key memakai identity. Jangan menjalankan seed contoh ke database bisnis aktif.

## Deploy otomatis

Workflow `.github/workflows/deploy.yml` menjalankan deploy pada setiap push ke branch `main`. Repository GitHub perlu memiliki Actions Secrets `HOMEPOS_DEPLOY_HOST`, `HOMEPOS_DEPLOY_USER`, `HOMEPOS_DEPLOY_SSH_KEY`, dan `HOMEPOS_DEPLOY_KNOWN_HOSTS`. Server perlu menyiapkan aplikasi di `/opt/homepos/app`, environment production, service systemd bernama `homepos`, serta script `scripts/deploy-server.sh` dipasang sebagai `/opt/homepos/deploy.sh`.

## API

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/catalog` | Produk minuman, plastik, stok, metode bayar |
| GET | `/api/transactions` | Maksimal 100 pengiriman menunggu nota terbaru beserta detail |
| POST | `/api/transactions` | Jual minuman, beli plastik, atau kirim pabrik |
| PATCH | `/api/transactions/:id/settle` | Selesaikan seluruh detail nota pabrik |

Nilai desimal wajib berupa string bertitik (bukan koma). Uang 2 desimal, berat kg maksimal 2 desimal. Input dibatasi maksimal 9 digit sebelum titik; total dihitung PostgreSQL, bukan JavaScript. Harga jual minuman diisi per item pada saat transaksi POS. Nama pembeli opsional. Maksimal 100 baris unik per transaksi.

Jual minuman:

```json
{"type":"Jual Minuman","transactionDate":"2026-10-10","methodId":1,"customerName":"Budi","items":[{"productId":1,"jumlah":2,"hargaSatuan":"5000.00"}]}
```

Beli plastik: supplier dapat dipilih dari nama yang pernah digunakan atau diketik langsung pada field yang sama. Nama baru disimpan ketika transaksi berhasil. Stok bertambah **90.500 kg**, nominal **Rp 362000.00**.

```json
{"type":"Beli Plastik","transactionDate":"2026-10-10","methodId":1,"supplierName":"Pengepul Contoh","items":[{"plastikId":1,"berat":"90.500","hargaSatuan":"4000.00"}]}
```

Tahap 1: stok berkurang **100 kg**, total nol, status Menunggu Pabrik.

```json
{"type":"Kirim Pabrik","transactionDate":"2026-10-10","items":[{"plastikId":1,"beratKirim":"100.000"}]}
```

Ambil ID transaksi dan `detail_transaksi_plastik_id` dari GET `/api/transactions`. Tahap 2 (ganti ID sesuai respons):

```json
{"methodId":1,"items":[{"detailId":2,"beratDiterima":"95.000","hargaSatuan":"6000.00"}]}
```

Hasil: status Selesai, total **Rp 570000.00**, tanggal selesai hari ini Asia/Jayapura. Stok tidak berubah lagi; penyusutan 5 kg dapat dihitung sebagai berat_kirim - berat_diterima. Berat diterima nol diperbolehkan untuk penolakan seluruh muatan. Berat pabrik boleh lebih besar dari berat kirim untuk mencatat perbedaan timbangan; pembelian dari pengepul memakai satu nilai berat.

## Jaminan logika

- Semua perubahan induk, detail, dan stok berada dalam satu BEGIN/COMMIT pada koneksi yang sama. Kegagalan satu item membatalkan semuanya.
- Pengurangan stok bersyarat `stok >= jumlah/berat` mencegah stok negatif saat request bersamaan.
- Penguncian induk `FOR UPDATE` dan pemeriksaan status mencegah penyelesaian nota berulang. Percobaan kedua mendapatkan HTTP 409.
- Penyelesaian wajib membawa tepat seluruh ID detail transaksi, tanpa duplikasi atau detail milik transaksi lain.
- Harga dan subtotal historis tersimpan; subtotal generated dan total SUM dihitung dengan NUMERIC. Pembulatan per baris menjadi 2 desimal.
- Input SQL menggunakan parameter `$1`, `$2`, dst. Satu nama tabel dinamis berasal dari dua konstanta internal, bukan input pengguna.
- HTTP 400 untuk input tidak valid, 404 transaksi hilang, 409 konflik status/stok; error internal tidak dibocorkan ke klien.

## Batas kerangka

Ini contoh lokal, belum aplikasi produksi lengkap. Tambahkan autentikasi dan otorisasi kasir/admin sebelum membuka API ke jaringan publik. Belum ada fitur hapus master, pembatalan, laporan, ; form POS, pembelian, dan pengiriman tersedia. Status Batal dicadangkan, jangan mengubahnya langsung tanpa alur pembalikan stok dan audit.

POST pembuatan belum memakai idempotency key: jika koneksi putus setelah commit, periksa transaksi di database sebelum mencoba ulang. Tombol form dinonaktifkan selama request tetapi tidak menggantikan deduplikasi server. Untuk produksi tambahkan request key unik persisten dan audit pengguna. GET daftar ini dibatasi 100; tambahkan pagination sebelum volume besar.

Selesai pada pengiriman berarti nota pabrik turun, bukan otomatis piutang sudah lunas. `methodId` wajib dipilih saat menyelesaikan nota; akuntansi pembayaran terpisah membutuhkan tabel pembayaran/piutang tambahan. Tidak ada `cabang_id` karena dua cabang pada spesifikasi dimodelkan sebagai dua jenis operasional, bukan lokasi dengan stok terpisah.

Semua penulisan transaksi harus melalui service ini. Constraint SQL menjaga nilai/relasi, sedangkan kesesuaian tipe induk-detail dan rekonsiliasi stok dijaga service, bukan trigger untuk penulisan SQL manual.

## Pemeriksaan

- `npm run typecheck`
- `npm run build`

## Referensi

- https://nextjs.org/docs/app/getting-started/route-handlers
- https://node-postgres.com/features/queries
- https://node-postgres.com/features/transactions

Tes integrasi: buat database **khusus tes** dengan schema dan seed baru, jalankan aplikasi dengan `DATABASE_URL` tersebut, lalu jalankan `DATABASE_URL=... node tests/integration.mjs`. Jangan arahkan tes ke database operasional karena tes membuat transaksi dan mengubah stok. `TEST_BASE_URL` opsional (default http://127.0.0.1:3000).

Verifikasi implementasi: schema dan seed berhasil di PostgreSQL 16; typecheck dan build produksi Webpack lulus; tes integrasi lulus untuk POS, pembelian, pengiriman, nota simultan, rollback, stok simultan, duplikasi item dan input tidak valid. Script dev/build memakai Webpack karena Turbopack mengalami pembatasan proses CSS pada lingkungan pengujian.

## Modul antarmuka

Navigasi di bagian atas menghubungkan `/pos` (Kasir Minuman), `/beli-plastik` (pembelian dari pengepul), dan `/` (Kirim Pabrik). POS menampilkan produk dari database, pencarian, keranjang, batas jumlah sesuai stok, total dan metode pembayaran. Pembelian menggunakan tabel per baris dengan jenis plastik, berat, harga per kg, dan subtotal. Preview subtotal menggunakan integer berskala agar pembulatan sesuai NUMERIC database. Stok katalog diperbarui setelah penyimpanan. Master data kosong ditampilkan sebagai pesan; isi master terlebih dahulu (seed hanya untuk database contoh baru).

## Master barang

Buka `/master` untuk menambah dan mengedit produk minuman (nama, merek, harga modal, stok unit) serta plastik (nama dan stok kg). Merek baru otomatis dibuat dari form produk. Data dibaca dan disimpan melalui GET/POST/PATCH `/api/master`; harga jual produk diatur pada setiap transaksi POS. Tidak perlu migrasi tambahan.

Stok pada form edit merupakan saldo absolut, bukan penambahan. Perubahan stok atau data sejak form dibuka akan menghasilkan HTTP 409, menggunakan versi baris PostgreSQL (`xmin`). Muat ulang daftar lalu buka Edit kembali agar tidak menimpa transaksi baru. Penyesuaian manual stok belum memiliki jurnal audit.

Tes master: arahkan server ke database sementara berisi schema, lalu jalankan `TEST_BASE_URL=http://127.0.0.1:3001 node tests/master.mjs`. Tes menambah data dan mensimulasikan pengiriman, sehingga tidak boleh dijalankan pada database bisnis.

## Pembelian satu berat dan TablePlus

API Beli Plastik sekarang menerima `berat` (string kg, maksimal 2 desimal) dan `hargaSatuan`. Stok bertambah sebesar berat, subtotal = berat × harga. Kolom database `berat_kirim` dan `berat_diterima` tetap ada untuk kompatibilitas riwayat dan pengiriman pabrik; pada pembelian baru keduanya diisi nilai berat yang sama. Tidak perlu migrasi skema.

Koneksi TablePlus lokal: pilih PostgreSQL; Name `HomePOS`, Host `127.0.0.1`, Port `5432`, User `homepos_app`, Database `homepos`, Password sesuai `.env`, SSL mode `PREFERRED`, tanpa SSH. Klik Test lalu Connect. `homepos_app` adalah role, bukan nama database.

## Rekap barang dan uang

Halaman `/rekap` dan GET `/api/rekap?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1` menampilkan agregat seluruh periode (inklusif) dan riwayat 50 kejadian per halaman. POS selesai dihitung sebagai uang masuk; pembelian selesai sebagai uang keluar, dikelompokkan per metode bayar. Nota pabrik selesai ikut pendapatan pada tanggal selesai, termasuk data lama yang belum memiliki metode bayar. Kartu nilai nota merupakan rincian dari pendapatan, bukan tambahan. Selisih bukan saldo akhir kas atau laba.

Pergerakan barang memakai tanggal transaksi: minuman keluar berdasarkan jumlah, plastik masuk berdasarkan berat pembelian, plastik keluar berdasarkan berat kirim (termasuk pengiriman yang menunggu nota). Nota memakai tanggal selesai dan tidak menimbulkan arus stok baru. Transaksi batal dikecualikan. Stok awal dan edit stok manual tidak dapat direkonstruksi karena belum ada jurnal mutasi; rekap ini hanya mencakup transaksi. Jumlah pengiriman menunggu merupakan status saat ini untuk pengiriman yang berangkat dalam periode terpilih, bukan status historis di akhir periode.

Metode pembayaran wajib dipilih untuk POS, pembelian plastik, dan penyelesaian nota pabrik. UI dan API menolak nilai kosong/null/0. Tahap truk berangkat tetap tanpa metode bayar karena belum ada pembayaran atau nota. Data historis tidak diubah.

Semua tampilan berat/stok plastik menggunakan dua desimal (contoh `500,00 kg`); input berat dan stok plastik baru maksimal dua desimal. Penyimpanan historis NUMERIC(18,3) tetap dipertahankan untuk menghindari pembulatan massal data lama.

## Restok minuman

Halaman `/restok` mencatat pembelian produk minuman dalam tabel. Metode pembayaran tidak dicatat, jumlah unit bilangan bulat positif, harga beli maksimal dua desimal. POST `/api/transactions` memakai `type: "Restok Minuman"` dan items `{productId, jumlah, hargaSatuan}`. Penyimpanan atomik menambah stok, memperbarui harga modal ke harga beli terakhir, dan menyimpan rincian harga historis. Harga jual tidak tersimpan di master; POS menyimpan harga jual pada rincian tiap transaksi. Rekap menghitung restok sebagai barang masuk dan uang keluar pada tanggal transaksi.

Database yang sudah ada membutuhkan migrasi (aman diulang): `npm run db:migrate`. Perintah membaca DATABASE_URL dari env, menambahkan enum restok, kolom opsional customer_name, tabel supplier, dan relasi supplier transaksi tanpa mengubah transaksi lama. Database baru sudah mencakup semuanya dalam schema.sql. Tes khusus: `TEST_DATABASE_URL=... TEST_BASE_URL=... node tests/restok.mjs`, hanya untuk database sementara.

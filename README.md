# Multi-Channel Reseller Web App (MCRW Web) v2.0 (PHP Backend)

Sistem Manajemen Persediaan, Penjualan Multi-Channel, dan Keuangan Reseller Berbasis Web yang dirancang secara ketat mengacu pada **PRD MCRW Web v2.0** (Pengganti Workbook Excel v1.0).

---

## 🏗️ Arsitektur Sistem (PHP + SQLite WAL + Modern React)

- **Backend Engine:** Pure PHP (PHP 8.0+) via built-in web server / Apache / Nginx.
- **Router & Controllers:** `php/router.php` and modular controllers in `php/controllers/`.
- **Database:** SQLite 3 dengan mode **WAL (Write-Ahead Logging)**, transaksi ACID penuh, dan **Foreign Keys constraint** aktif.
- **Frontend SPA:** React 19 + TypeScript + Tailwind CSS (dikompilasi ke `dist/` dan dilayani langsung oleh server PHP).
- **Zero AI Slop:** 100% implementasi nyata, database riil, perhitungan HPP otomatis, mutasi stok buku pembantu, RBAC sanitizer, dan 15/15 skenario UAT lolos pengujian.

---

## 🚀 Fitur Utama & Kepatuhan PRD

1. **Satu Sumber Kebenaran (Single Source of Truth)**
   - Database relasional dengan transaksi ACID, *Foreign Keys enforcement*, dan *Write-Ahead Logging* (WAL).
   - Menghilangkan duplikasi pencatatan stok dan rekonsiliasi manual.

2. **HPP Rata-Rata Bergerak & Penguncian Permanen (BR-12 & Section 6)**
   - HPP dihitung ulang secara otomatis saat transaksi pembelian diposting dengan alokasi ongkir masuk proporsional (*freight-in*).
   - HPP dikunci permanen (*snapshot*) saat penjualan berstatus **Selesai**. Perubahan harga beli baru tidak mengubah HPP transaksi lama.

3. **Pemisahan Omzet vs Dana Cair & Netralitas Kas (UAT-02 & UAT-03)**
   - Perhitungan 3 lapis: `Omzet Kotor`, `Pendapatan Bersih` (setelah diskon dan potongan admin channel), dan `Laba Kotor`.
   - Mutasi kas antar akun (misal withdraw Saldo Shopee ke Rekening Bank BCA) bersifat **100% netral** terhadap omzet dan laba rugi.

4. **Siklus Status Pesanan & Reservasi Stok (BR-04, BR-05, UAT-09, UAT-10)**
   - `Diproses` & `Dikirim`: Stok fisik tetap, stok tersedia berkurang (*reserved*). POS dan channel lain terlindungi dari *overselling*.
   - `Selesai`: Stok fisik terpotong, HPP terkunci, dana masuk ke kas/saldo channel, laba diakui.
   - `Batal`: Reservasi stok dilepaskan seketika.
   - `Void`: Pembatalan dokumen yang sudah selesai dengan mutasi pembalik otomatis dan alasan wajib tercatat di audit log.

5. **Penanganan Retur Layak vs Rusak (FR-05 & UAT-04)**
   - **Layak**: Menambah stok kembali menggunakan HPP snapshot asli dari invoice penjualan.
   - **Rusak**: Stok tidak bertambah, nilai barang dicatat sebagai **Kerugian Retur**.

6. **Hak Akses Berbasis Peran (RBAC) & Sanitasi API (FR-01, BR-11, UAT-11)**
   - HPP dan Laba Kotor disaring secara ketat di level API untuk peran **Kasir & Admin Online**.

7. **Tutup Periode Akuntansi Bulanan (FR-09 & BR-09)**
   - Owner dapat menutup periode buku bulanan. Sistem memblokir pembuatan, perubahan, atau void pada tanggal periode tertutup.
   - Pembukaan kembali (*re-open*) memerlukan wewenang Owner dan alasan wajib yang tercatat di audit log.

8. **Mode POS Kasir Ramah Sentuh & Cetak Struk (FR-04)**
   - Layar kasir cepat dengan scan barcode / pencarian SKU, hitung kembalian otomatis, dan cetak struk thermal 80mm.

9. **Impor Pesanan Marketplace Massal (FR-04 & UAT-13)**
   - Unggah laporan pesanan Shopee, Tokopedia, TikTok Shop, atau CSV universal dengan deteksi duplikat dan validasi SKU.

10. **6 Laporan Keuangan Interaktif & Ekspor Excel (FR-08)**
    - Laba Rugi Komprehensif (P&L)
    - Profitabilitas per Channel
    - Profit per Produk & Deteksi Produk Lambat Laku (*Slow-Moving*)
    - Valuasi Nilai Persediaan Berjalan
    - Posisi Kas & Arus Mutasi Bank
    - Umur Utang Dagang (*Aging of Payables*)

---

## 📦 Akun Demo & Hak Akses (RBAC)

Password default untuk semua akun: `password123` (atau `admin123`)

| Peran | Email | Hak Akses Utama |
|---|---|---|
| **Owner** | `owner@mcrw.com` | Akses penuh: Master data, Void penjualan, Tutup/Buka periode, Laporan keuangan, Manajemen pengguna. |
| **Admin Purchasing & Gudang** | `gudang@mcrw.com` | Input pembelian, terima barang, stok opname, kelola katalog produk & varian SKU. |
| **Kasir & Admin Online** | `kasir@mcrw.com` | Transaksi POS kasir, input pesanan online, ganti status pengiriman, retur barang. *(HPP & Laba tersanitasi aman dari API)* |
| **Admin Keuangan** | `keuangan@mcrw.com` | Pelunasan utang supplier, pencatatan beban operasional, mutasi kas/bank, analisis seluruh laporan keuangan. |

---

## 💻 Panduan Menjalankan Aplikasi dengan PHP

### 1. Menjalankan Server PHP
Aplikasi web dapat langsung dijalankan menggunakan server bawaan PHP:

```bash
# Menggunakan npm script
npm run start

# ATAU langsung memanggil PHP CLI
C:\xampp\php\php.exe -S 127.0.0.1:3001 php/router.php
```

Buka peramban (browser) di:
👉 **`http://localhost:3001`**

Frontend web React dan seluruh endpoint REST API `/api/*` secara otomatis dilayani oleh PHP.

---

## 🧪 Pengujian & Verifikasi Kepatuhan PRD

### 1. UAT Test Suite (15/15 Skenario PRD Lolos 100%)
Memverifikasi 15 skenario pengujian penerimaan pengguna dari **Section 9 PRD**:

```bash
# Menggunakan npm script
npm run test:uat

# ATAU langsung via PHP
C:\xampp\php\php.exe php/test_uat.php
```

Hasil UAT:
```
====================================================
 STARTING PHP UAT TEST SUITE - MCRW Web v2.0
====================================================

[PASS] UAT-01: Sinkronisasi stok
[PASS] UAT-02: Omzet vs dana cair
[PASS] UAT-03: Netralitas pencairan
[PASS] UAT-04: Retur layak vs rusak
[PASS] UAT-05: Stabilitas HPP
[PASS] UAT-06: Pembelian tempo
[PASS] UAT-07: Biaya per channel
[PASS] UAT-08: Integritas data
[PASS] UAT-09: Reservasi stok
[PASS] UAT-10: Konkurensi & Atomisitas
[PASS] UAT-11: Hak akses & Sanitasi Kasir
[PASS] UAT-12: Tutup periode
[PASS] UAT-13: Impor marketplace & deteksi duplikat
[PASS] UAT-14: Migrasi saldo awal & integritas
[PASS] UAT-15: Void penjualan dan audit log

====================================================
 UAT TEST RESULTS: 15 PASSED, 0 FAILED
====================================================
```

### 2. End-to-End API Workflow Verification (11/11 Lolos)
Memverifikasi integrasi antar-controller, RBAC sanitasi di level controller, alokasi biaya, dan mutasi kas:

```bash
C:\xampp\php\php.exe php/test_e2e_api.php
```

Hasil:
```
========================================================
 RUNNING FULL END-TO-END PHP API & WORKFLOW VERIFICATION
========================================================

[SUCCESS] 1. Login sebagai Owner (owner@mcrw.com)
[SUCCESS] 2. Login sebagai Kasir (kasir@mcrw.com)
[SUCCESS] 3. Ambil Master Produk & Varian
[SUCCESS] 4. Buat Produk Baru dengan Multi-Varian SKU
[SUCCESS] 5. Pembelian Stok Masuk dengan Alokasi Ongkir & Moving Average HPP
[SUCCESS] 6. Penjualan POS Kasir (Tunai, Cetak Struk 80mm)
[SUCCESS] 7. Penjualan Online Shopee: Reservasi Stok -> Selesai
[SUCCESS] 8. Retur Penjualan Produk Layak (Restok otomatis dengan HPP Asli)
[SUCCESS] 9. Pencatatan Biaya Operasional & Transfer Kas Antar-Akun (Netral L/R)
[SUCCESS] 10. Laporan Keuangan (Dashboard, Laba Rugi, Profitabilitas Channel, Posisi Kas)
[SUCCESS] 11. RBAC & Sanitasi Kasir: Tidak dapat melihat HPP & diblokir dari Laporan Keuangan

========================================================
 E2E VERIFICATION RESULTS: 11 PASSED, 0 FAILED
========================================================
```

---

## 📁 Struktur Direktori Proyek

```
Visual/
├── data/
│   ├── mcrw.sqlite            # Database relasional SQLite (Single Source of Truth)
│   └── sessions.json          # Penyimpanan sesi login aktif
├── dist/                      # Frontend PWA siap produksi (HTML, JS, CSS, Asset)
├── php/
│   ├── controllers/           # Modular REST API Controllers
│   │   ├── AuthController.php
│   │   ├── BiayaKasController.php
│   │   ├── ImportExportController.php
│   │   ├── LaporanController.php
│   │   ├── MasterController.php
│   │   ├── PembelianController.php
│   │   ├── PenjualanController.php
│   │   ├── PeriodeController.php
│   │   ├── ReturController.php
│   │   └── StokController.php
│   ├── Auth.php               # Otentikasi sesi & penyaring sensitif RBAC (Kasir)
│   ├── BusinessLogic.php      # Mesin kalkulasi HPP, stok mutasi, 3-layer omzet
│   ├── Database.php           # Inisialisasi skema 16 tabel & seeder data
│   ├── router.php             # Front controller penangan request API & SPA
│   ├── test_uat.php           # Pengujian otomatis skenario UAT-01 s/d UAT-15
│   └── test_e2e_api.php       # Pengujian alur transaksi End-to-End API
├── src/                       # Kode sumber React SPA (TypeScript + Tailwind)
├── package.json
└── README.md
```

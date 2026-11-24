const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles } = require('../auth');

// Block Kasir & Admin Online from all financial reporting endpoints (BR-11, UAT-11)
router.use(authMiddleware, requireRoles('Owner', 'Admin Keuangan'));

// GET /api/laporan/dashboard (Summary Dashboard)
router.get('/dashboard', (req, res) => {
  const { channel_id, tgl_mulai, tgl_selesai } = req.query;

  // Filter conditions for sales
  let salesWhere = "status = 'Selesai'";
  const salesParams = [];
  if (channel_id) {
    salesWhere += ' AND channel_id = ?';
    salesParams.push(channel_id);
  }
  if (tgl_mulai) {
    salesWhere += ' AND tanggal >= ?';
    salesParams.push(tgl_mulai);
  }
  if (tgl_selesai) {
    salesWhere += ' AND tanggal <= ?';
    salesParams.push(tgl_selesai);
  }

  // Sales totals
  const salesSummary = db.prepare(`
    SELECT
      COALESCE(SUM(omzet_kotor), 0) as total_omzet,
      COALESCE(SUM(diskon_total), 0) as total_diskon,
      COALESCE(SUM(potongan_admin), 0) as total_potongan_admin,
      COALESCE(SUM(pendapatan_bersih), 0) as total_pendapatan_bersih,
      COALESCE(SUM(total_hpp), 0) as total_hpp,
      COALESCE(SUM(laba_kotor), 0) as total_laba_kotor,
      COUNT(id) as total_transaksi
    FROM penjualan
    WHERE ${salesWhere}
  `).get(...salesParams);

  // Operational expenses totals
  let biayaWhere = "status = 'Posted'";
  const biayaParams = [];
  if (channel_id) {
    biayaWhere += ' AND (channel_id = ? OR channel_id IS NULL)';
    biayaParams.push(channel_id);
  }
  if (tgl_mulai) {
    biayaWhere += ' AND tanggal >= ?';
    biayaParams.push(tgl_mulai);
  }
  if (tgl_selesai) {
    biayaWhere += ' AND tanggal <= ?';
    biayaParams.push(tgl_selesai);
  }

  const expenseSummary = db.prepare(`
    SELECT COALESCE(SUM(nominal), 0) as total_biaya
    FROM biaya_operasional
    WHERE ${biayaWhere}
  `).get(...biayaParams);

  // Return losses
  const returSummary = db.prepare(`
    SELECT
      COALESCE(SUM(total_refund), 0) as total_refund,
      COALESCE(SUM(kerugian_retur), 0) as total_kerugian_retur
    FROM retur_penjualan
  `).get();

  // Net Profit
  const labaBersih = salesSummary.total_laba_kotor - expenseSummary.total_biaya - returSummary.total_kerugian_retur;

  // Total cash in all accounts
  const totalKas = db.prepare('SELECT COALESCE(SUM(saldo_saat_ini), 0) as total FROM akun_kas_bank WHERE aktif = 1').get().total;

  // Total Accounts Payable (Utang Dagang)
  const totalUtang = db.prepare("SELECT COALESCE(SUM(sisa_utang), 0) as total FROM pembelian WHERE status = 'Posted' AND status_bayar = 'Utang'").get().total;

  // SKU alerts (HABIS & RESTOCK count)
  const skuCounts = db.prepare(`
    SELECT
      COUNT(CASE WHEN (stok_on_hand - stok_reserved) <= 0 THEN 1 END) as count_habis,
      COUNT(CASE WHEN (stok_on_hand - stok_reserved) > 0 AND (stok_on_hand - stok_reserved) <= stok_min THEN 1 END) as count_restock,
      COUNT(CASE WHEN (stok_on_hand - stok_reserved) > stok_min THEN 1 END) as count_aman
    FROM varian_produk
    WHERE aktif = 1
  `).get();

  // Daily trend (last 14 days)
  const dailyTrend = db.prepare(`
    SELECT
      tanggal,
      COALESCE(SUM(pendapatan_bersih), 0) as omzet_bersih,
      COALESCE(SUM(laba_kotor), 0) as laba_kotor,
      COUNT(id) as transaksi_count
    FROM penjualan
    WHERE status = 'Selesai'
    GROUP BY tanggal
    ORDER BY tanggal DESC
    LIMIT 14
  `).all().reverse();

  res.json({
    kpi: {
      total_omzet: salesSummary.total_omzet,
      pendapatan_bersih: salesSummary.total_pendapatan_bersih,
      total_hpp: salesSummary.total_hpp,
      laba_kotor: salesSummary.total_laba_kotor,
      total_biaya_operasional: expenseSummary.total_biaya,
      total_kerugian_retur: returSummary.total_kerugian_retur,
      laba_bersih: labaBersih,
      total_kas: totalKas,
      total_utang: totalUtang,
      count_habis: skuCounts.count_habis,
      count_restock: skuCounts.count_restock,
      count_aman: skuCounts.count_aman,
      total_transaksi: salesSummary.total_transaksi
    },
    dailyTrend
  });
});

// GET /api/laporan/laba-rugi (Profit and Loss Statement)
router.get('/laba-rugi', (req, res) => {
  const { bulan, tahun, tgl_mulai, tgl_selesai } = req.query;

  let salesCondition = "status = 'Selesai'";
  let expenseCondition = "status = 'Posted'";
  const sParams = [];
  const eParams = [];

  if (bulan && tahun) {
    const padBulan = String(bulan).padStart(2, '0');
    salesCondition += ' AND strftime("%Y-%m", tanggal) = ?';
    sParams.push(`${tahun}-${padBulan}`);
    expenseCondition += ' AND strftime("%Y-%m", tanggal) = ?';
    eParams.push(`${tahun}-${padBulan}`);
  } else {
    if (tgl_mulai) {
      salesCondition += ' AND tanggal >= ?';
      sParams.push(tgl_mulai);
      expenseCondition += ' AND tanggal >= ?';
      eParams.push(tgl_mulai);
    }
    if (tgl_selesai) {
      salesCondition += ' AND tanggal <= ?';
      sParams.push(tgl_selesai);
      expenseCondition += ' AND tanggal <= ?';
      eParams.push(tgl_selesai);
    }
  }

  // Sales and Gross Revenue
  const salesData = db.prepare(`
    SELECT
      COALESCE(SUM(omzet_kotor), 0) as omzet_kotor,
      COALESCE(SUM(diskon_total), 0) as diskon_penjualan,
      COALESCE(SUM(potongan_admin), 0) as potongan_admin,
      COALESCE(SUM(pendapatan_bersih), 0) as pendapatan_bersih,
      COALESCE(SUM(total_hpp), 0) as total_hpp,
      COALESCE(SUM(laba_kotor), 0) as laba_kotor
    FROM penjualan
    WHERE ${salesCondition}
  `).get(...sParams);

  // Return losses
  const returData = db.prepare(`
    SELECT
      COALESCE(SUM(total_refund), 0) as refund_retur,
      COALESCE(SUM(kerugian_retur), 0) as rugi_retur_rusak
    FROM retur_penjualan
  `).get();

  // Expenses grouped by kelompok_laporan
  const expenseRows = db.prepare(`
    SELECT
      k.kelompok_laporan,
      k.nama as nama_kategori,
      k.kode_akun,
      COALESCE(SUM(b.nominal), 0) as subtotal
    FROM biaya_operasional b
    JOIN kategori_biaya k ON b.kategori_id = k.id
    WHERE ${expenseCondition}
    GROUP BY k.id
    ORDER BY k.kelompok_laporan ASC, k.kode_akun ASC
  `).all(...eParams);

  const bebanByKelompok = {};
  let totalBeban = 0;

  for (const row of expenseRows) {
    if (!bebanByKelompok[row.kelompok_laporan]) {
      bebanByKelompok[row.kelompok_laporan] = {
        kelompok: row.kelompok_laporan,
        total: 0,
        items: []
      };
    }
    bebanByKelompok[row.kelompok_laporan].total += row.subtotal;
    bebanByKelompok[row.kelompok_laporan].items.push(row);
    totalBeban += row.subtotal;
  }

  const labaOperasional = salesData.laba_kotor - totalBeban - returData.rugi_retur_rusak;

  res.json({
    periode: { bulan, tahun, tgl_mulai, tgl_selesai },
    pendapatan: {
      omzet_kotor: salesData.omzet_kotor,
      diskon_penjualan: salesData.diskon_penjualan,
      potongan_admin: salesData.potongan_admin,
      pendapatan_bersih: salesData.pendapatan_bersih
    },
    hpp: salesData.total_hpp,
    laba_kotor: salesData.laba_kotor,
    rugi_retur_rusak: returData.rugi_retur_rusak,
    beban_operasional: Object.values(bebanByKelompok),
    total_beban_operasional: totalBeban,
    laba_bersih: labaOperasional
  });
});

// GET /api/laporan/profitabilitas-channel (Channel Profitability)
router.get('/profitabilitas-channel', (req, res) => {
  const { tgl_mulai, tgl_selesai } = req.query;

  let salesCondition = "pj.status = 'Selesai'";
  let expenseCondition = "b.status = 'Posted'";
  const sParams = [];
  const eParams = [];

  if (tgl_mulai) {
    salesCondition += ' AND pj.tanggal >= ?';
    sParams.push(tgl_mulai);
    expenseCondition += ' AND b.tanggal >= ?';
    eParams.push(tgl_mulai);
  }
  if (tgl_selesai) {
    salesCondition += ' AND pj.tanggal <= ?';
    sParams.push(tgl_selesai);
    expenseCondition += ' AND b.tanggal <= ?';
    eParams.push(tgl_selesai);
  }

  const channels = db.prepare('SELECT id, nama, tipe FROM channel_penjualan ORDER BY id ASC').all();

  const report = channels.map(ch => {
    const saleRow = db.prepare(`
      SELECT
        COALESCE(SUM(pj.omzet_kotor), 0) as omzet_kotor,
        COALESCE(SUM(pj.diskon_total), 0) as diskon_total,
        COALESCE(SUM(pj.potongan_admin), 0) as potongan_admin,
        COALESCE(SUM(pj.pendapatan_bersih), 0) as pendapatan_bersih,
        COALESCE(SUM(pj.total_hpp), 0) as total_hpp,
        COALESCE(SUM(pj.laba_kotor), 0) as laba_kotor,
        COUNT(pj.id) as transaksi_count
      FROM penjualan pj
      WHERE pj.channel_id = ? AND ${salesCondition}
    `).get(ch.id, ...sParams);

    // Channel-specific operational expenses (e.g. Shopee Ads, TikTok Ads)
    const expRow = db.prepare(`
      SELECT COALESCE(SUM(b.nominal), 0) as biaya_channel
      FROM biaya_operasional b
      WHERE b.channel_id = ? AND ${expenseCondition}
    `).get(ch.id, ...eParams);

    const biayaChannel = expRow.biaya_channel;
    const labaKontribusi = saleRow.laba_kotor - biayaChannel;
    const marginKontribusi = saleRow.pendapatan_bersih > 0
      ? ((labaKontribusi / saleRow.pendapatan_bersih) * 100)
      : 0;

    return {
      channel_id: ch.id,
      nama_channel: ch.nama,
      tipe: ch.tipe,
      omzet_kotor: saleRow.omzet_kotor,
      potongan_admin: saleRow.potongan_admin,
      diskon: saleRow.diskon_total,
      pendapatan_bersih: saleRow.pendapatan_bersih,
      hpp: saleRow.total_hpp,
      laba_kotor: saleRow.laba_kotor,
      biaya_channel: biayaChannel,
      laba_kontribusi: labaKontribusi,
      margin_persen: Number(marginKontribusi.toFixed(2)),
      transaksi_count: saleRow.transaksi_count
    };
  });

  // Calculate General (Umum) expenses not allocated to any channel
  const umumExpRow = db.prepare(`
    SELECT COALESCE(SUM(b.nominal), 0) as biaya_umum
    FROM biaya_operasional b
    WHERE b.channel_id IS NULL AND ${expenseCondition}
  `).get(...eParams);

  res.json({
    channels: report,
    biaya_umum: umumExpRow.biaya_umum
  });
});

// GET /api/laporan/profit-produk (Product Profit & Slow-Moving Detection)
router.get('/profit-produk', (req, res) => {
  const { tgl_mulai, tgl_selesai, kategori } = req.query;

  let condition = "pj.status = 'Selesai'";
  const params = [];

  if (tgl_mulai) {
    condition += ' AND pj.tanggal >= ?';
    params.push(tgl_mulai);
  }
  if (tgl_selesai) {
    condition += ' AND pj.tanggal <= ?';
    params.push(tgl_selesai);
  }

  const rows = db.prepare(`
    SELECT
      v.id as varian_id,
      v.sku,
      v.nama_varian,
      v.satuan,
      v.stok_on_hand,
      v.hpp_rata_rata,
      p.nama as nama_produk,
      p.kategori,
      COALESCE(SUM(dp.qty), 0) as qty_terjual,
      COALESCE(SUM(dp.qty * dp.harga), 0) as total_omzet,
      COALESCE(SUM(dp.pendapatan_bersih), 0) as pendapatan_bersih,
      COALESCE(SUM(dp.qty * dp.hpp_snapshot), 0) as total_hpp,
      COALESCE(SUM(dp.laba_kotor), 0) as laba_kotor
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    LEFT JOIN detail_penjualan dp ON dp.varian_id = v.id
    LEFT JOIN penjualan pj ON dp.penjualan_id = pj.id AND ${condition}
    WHERE v.aktif = 1
    GROUP BY v.id
    ORDER BY qty_terjual DESC, laba_kotor DESC
  `).all(...params);

  const evaluated = rows.map(r => {
    const marginPersen = r.pendapatan_bersih > 0 ? (r.laba_kotor / r.pendapatan_bersih) * 100 : 0;
    // Slow moving if on hand > 5 and qty_terjual == 0 in period
    const isSlowMoving = r.stok_on_hand > 5 && r.qty_terjual === 0;

    return {
      ...r,
      margin_persen: Number(marginPersen.toFixed(2)),
      is_slow_moving: isSlowMoving
    };
  });

  const filtered = kategori ? evaluated.filter(r => r.kategori === kategori) : evaluated;
  res.json(filtered);
});

// GET /api/laporan/nilai-persediaan (Inventory Valuation)
router.get('/nilai-persediaan', (req, res) => {
  const varians = db.prepare(`
    SELECT
      v.id, v.sku, v.nama_varian, v.satuan, v.stok_on_hand, v.hpp_rata_rata,
      (v.stok_on_hand * v.hpp_rata_rata) as total_nilai,
      p.nama as nama_produk, p.kategori
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    WHERE v.aktif = 1 AND p.aktif = 1
    ORDER BY p.kategori ASC, p.nama ASC, v.nama_varian ASC
  `).all();

  const grandTotal = varians.reduce((sum, v) => sum + v.total_nilai, 0);
  const totalQty = varians.reduce((sum, v) => sum + v.stok_on_hand, 0);

  res.json({
    varians,
    grandTotalNilai: grandTotal,
    grandTotalQty: totalQty
  });
});

// GET /api/laporan/posisi-kas (Cash Flow & Balances per Account)
router.get('/posisi-kas', (req, res) => {
  const { tgl_mulai, tgl_selesai } = req.query;

  const akuns = db.prepare('SELECT * FROM akun_kas_bank WHERE aktif = 1 ORDER BY id ASC').all();

  const report = akuns.map(akun => {
    // Sales inflows
    let salesWhere = "status = 'Selesai' AND akun_kas_id = ?";
    const sParams = [akun.id];
    if (tgl_mulai) { salesWhere += ' AND tanggal >= ?'; sParams.push(tgl_mulai); }
    if (tgl_selesai) { salesWhere += ' AND tanggal <= ?'; sParams.push(tgl_selesai); }

    const salesInflow = db.prepare(`
      SELECT COALESCE(SUM(pendapatan_bersih), 0) as total
      FROM penjualan WHERE ${salesWhere}
    `).get(...sParams).total;

    // Direct Cash Purchase outflows
    let buyWhere = "status = 'Posted' AND status_bayar = 'Lunas' AND akun_kas_id = ?";
    const bParams = [akun.id];
    if (tgl_mulai) { buyWhere += ' AND tanggal >= ?'; bParams.push(tgl_mulai); }
    if (tgl_selesai) { buyWhere += ' AND tanggal <= ?'; bParams.push(tgl_selesai); }

    const buyOutflow = db.prepare(`
      SELECT COALESCE(SUM(total_biaya), 0) as total
      FROM pembelian WHERE ${buyWhere}
    `).get(...bParams).total;

    // Debt settlements
    let debtWhere = "akun_kas_id = ?";
    const dParams = [akun.id];
    if (tgl_mulai) { debtWhere += ' AND tanggal >= ?'; dParams.push(tgl_mulai); }
    if (tgl_selesai) { debtWhere += ' AND tanggal <= ?'; dParams.push(tgl_selesai); }

    const debtOutflow = db.prepare(`
      SELECT COALESCE(SUM(nominal), 0) as total
      FROM pelunasan_utang WHERE ${debtWhere}
    `).get(...dParams).total;

    // Operational expenses
    let expWhere = "status = 'Posted' AND akun_kas_id = ?";
    const eParams = [akun.id];
    if (tgl_mulai) { expWhere += ' AND tanggal >= ?'; eParams.push(tgl_mulai); }
    if (tgl_selesai) { expWhere += ' AND tanggal <= ?'; eParams.push(tgl_selesai); }

    const expOutflow = db.prepare(`
      SELECT COALESCE(SUM(nominal), 0) as total
      FROM biaya_operasional WHERE ${expWhere}
    `).get(...eParams).total;

    // Refunds
    let retWhere = "akun_kas_id = ?";
    const rParams = [akun.id];
    if (tgl_mulai) { retWhere += ' AND tanggal >= ?'; rParams.push(tgl_mulai); }
    if (tgl_selesai) { retWhere += ' AND tanggal <= ?'; rParams.push(tgl_selesai); }

    const refundOutflow = db.prepare(`
      SELECT COALESCE(SUM(total_refund), 0) as total
      FROM retur_penjualan WHERE ${retWhere}
    `).get(...rParams).total;

    // Mutation inflow (transferred into this account)
    let mutInWhere = "status = 'Posted' AND akun_tujuan_id = ?";
    const miParams = [akun.id];
    if (tgl_mulai) { mutInWhere += ' AND tanggal >= ?'; miParams.push(tgl_mulai); }
    if (tgl_selesai) { mutInWhere += ' AND tanggal <= ?'; miParams.push(tgl_selesai); }

    const mutasiMasuk = db.prepare(`
      SELECT COALESCE(SUM(nominal), 0) as total
      FROM mutasi_kas WHERE ${mutInWhere}
    `).get(...miParams).total;

    // Mutation outflow (transferred out of this account)
    let mutOutWhere = "status = 'Posted' AND akun_asal_id = ?";
    const moParams = [akun.id];
    if (tgl_mulai) { mutOutWhere += ' AND tanggal >= ?'; moParams.push(tgl_mulai); }
    if (tgl_selesai) { mutOutWhere += ' AND tanggal <= ?'; moParams.push(tgl_selesai); }

    const mutasiKeluar = db.prepare(`
      SELECT COALESCE(SUM(nominal), 0) as total
      FROM mutasi_kas WHERE ${mutOutWhere}
    `).get(...moParams).total;

    const totalPenerimaan = salesInflow + mutasiMasuk;
    const totalPengeluaran = buyOutflow + debtOutflow + expOutflow + refundOutflow + mutasiKeluar;

    return {
      akun_id: akun.id,
      nama_akun: akun.nama,
      tipe_akun: akun.tipe_akun,
      saldo_awal: akun.saldo_awal,
      penerimaan: totalPenerimaan,
      pengeluaran: totalPengeluaran,
      saldo_akhir: akun.saldo_saat_ini
    };
  });

  const grandSaldo = report.reduce((sum, a) => sum + a.saldo_akhir, 0);

  res.json({
    akuns: report,
    grandTotalKas: grandSaldo
  });
});

module.exports = router;

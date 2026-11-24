const { db } = require('./db');

/**
 * Audit log helper
 */
function logAudit(pengguna, entitas, entitas_id, aksi, nilai_sebelum, nilai_sesudah) {
  const waktu = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_log (waktu, pengguna_id, nama_pengguna, peran, entitas, entitas_id, aksi, nilai_sebelum, nilai_sesudah)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    waktu,
    pengguna?.id || null,
    pengguna?.nama || 'Sistem',
    pengguna?.peran || 'System',
    entitas,
    String(entitas_id || ''),
    aksi,
    nilai_sebelum ? JSON.stringify(nilai_sebelum) : null,
    nilai_sesudah ? JSON.stringify(nilai_sesudah) : null
  );
}

/**
 * Check if a date falls into a closed accounting period (BR-09)
 */
function assertOpenPeriod(dateString) {
  const d = new Date(dateString);
  const bulan = d.getMonth() + 1;
  const tahun = d.getFullYear();

  const closed = db.prepare(`
    SELECT * FROM periode_akuntansi
    WHERE bulan = ? AND tahun = ? AND status = 'Tutup'
  `).get(bulan, tahun);

  if (closed) {
    throw new Error(`Periode akuntansi ${bulan}/${tahun} telah ditutup. Transaksi pada tanggal ini tidak dapat dibuat, diubah, atau dibatalkan.`);
  }
}

/**
 * Helper to check system settings
 */
function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT nilai FROM pengaturan_sistem WHERE kunci = ?').get(key);
  return row ? row.nilai : defaultValue;
}

/**
 * Post a purchase and calculate Moving Average HPP (FR-03, FR-07, BR-12)
 */
function postPembelian({
  no_faktur,
  supplier_id,
  tanggal,
  items,
  ongkir = 0,
  metode_alokasi_ongkir = 'nilai',
  status_bayar = 'Lunas',
  termin_hari = 0,
  akun_kas_id = null,
  catatan = '',
  user
}) {
  assertOpenPeriod(tanggal);

  // Validate supplier
  const supplier = db.prepare('SELECT * FROM supplier WHERE id = ?').get(supplier_id);
  if (!supplier) throw new Error('Supplier tidak ditemukan');

  // Validate unique no_faktur (BR-01)
  const existing = db.prepare('SELECT id FROM pembelian WHERE no_faktur = ?').get(no_faktur);
  if (existing) throw new Error(`Nomor faktur "${no_faktur}" sudah digunakan.`);

  if (!items || items.length === 0) throw new Error('Detail item pembelian tidak boleh kosong.');

  // Validate cash account if Lunas
  let akunKas = null;
  if (status_bayar === 'Lunas') {
    if (!akun_kas_id) throw new Error('Akun kas wajib dipilih untuk pembelian Lunas.');
    akunKas = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_kas_id);
    if (!akunKas) throw new Error('Akun kas tidak ditemukan.');
  }

  // Calculate subtotal
  let totalSubtotal = 0;
  let totalQty = 0;
  for (const it of items) {
    const qty = Number(it.qty);
    const hargaBeli = Number(it.harga_beli);
    if (qty <= 0) throw new Error(`Qty untuk SKU ${it.sku || it.varian_id} harus lebih dari 0.`);
    if (hargaBeli < 0) throw new Error(`Harga beli tidak boleh negatif.`);
    totalSubtotal += qty * hargaBeli;
    totalQty += qty;
  }

  const ongkirNum = Number(ongkir) || 0;
  const totalBiaya = totalSubtotal + ongkirNum;

  // Check cash balance if non-bank and Lunas
  if (status_bayar === 'Lunas' && akunKas.tipe_akun !== 'Rekening Bank') {
    if (akunKas.saldo_saat_ini < totalBiaya) {
      throw new Error(`Saldo akun "${akunKas.nama}" tidak mencukupi (Tersedia: Rp ${akunKas.saldo_saat_ini.toLocaleString('id-ID')}, Dibutuhkan: Rp ${totalBiaya.toLocaleString('id-ID')}).`);
    }
  }

  // Calculate due date if Utang
  let jatuhTempo = null;
  let sisaUtang = 0;
  if (status_bayar === 'Utang') {
    sisaUtang = totalBiaya;
    const days = Number(termin_hari) || supplier.termin_hari || 30;
    const d = new Date(tanggal);
    d.setDate(d.getDate() + days);
    jatuhTempo = d.toISOString().split('T')[0];
  }

  // Execute in SQLite transaction
  const insertPembelian = db.prepare(`
    INSERT INTO pembelian (
      no_faktur, supplier_id, tanggal, total_subtotal, ongkir, total_biaya,
      metode_alokasi_ongkir, status_bayar, termin_hari, jatuh_tempo,
      akun_kas_id, sisa_utang, status, catatan, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)
  `);

  const insertDetail = db.prepare(`
    INSERT INTO detail_pembelian (
      pembelian_id, varian_id, qty, harga_beli, subtotal,
      ongkir_alokasi, hpp_beli_per_unit, total_item
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMutasiStok = db.prepare(`
    INSERT INTO mutasi_stok (
      waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
      saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
    ) VALUES (?, ?, 'MASUK_BELI', ?, 0, ?, ?, ?, ?, ?, ?)
  `);

  const updateVarian = db.prepare(`
    UPDATE varian_produk
    SET stok_on_hand = ?, hpp_rata_rata = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();

  // BEGIN TRANSACTION
  db.exec('BEGIN IMMEDIATE;');
  try {
    const resPembelian = insertPembelian.run(
      no_faktur,
      supplier_id,
      tanggal,
      totalSubtotal,
      ongkirNum,
      totalBiaya,
      metode_alokasi_ongkir,
      status_bayar,
      status_bayar === 'Utang' ? (Number(termin_hari) || supplier.termin_hari || 0) : 0,
      jatuhTempo,
      akun_kas_id,
      sisaUtang,
      catatan,
      user?.nama || 'Admin',
      now
    );

    const pembelianId = resPembelian.lastInsertRowid;

    // Process each item and recalculate moving average HPP
    for (const it of items) {
      const varianId = it.varian_id;
      const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(varianId);
      if (!varian) throw new Error(`Varian dengan ID ${varianId} tidak ditemukan.`);

      const qty = Number(it.qty);
      const hargaBeli = Number(it.harga_beli);
      const subtotal = qty * hargaBeli;

      // Allocate shipping
      let ongkirAlokasi = 0;
      if (ongkirNum > 0) {
        if (metode_alokasi_ongkir === 'qty' && totalQty > 0) {
          ongkirAlokasi = (qty / totalQty) * ongkirNum;
        } else if (totalSubtotal > 0) {
          ongkirAlokasi = (subtotal / totalSubtotal) * ongkirNum;
        }
      }

      const totalItemBiaya = subtotal + ongkirAlokasi;
      const hppBeliPerUnit = totalItemBiaya / qty;

      insertDetail.run(
        pembelianId,
        varianId,
        qty,
        hargaBeli,
        subtotal,
        ongkirAlokasi,
        hppBeliPerUnit,
        totalItemBiaya
      );

      // Moving Average Calculation
      const existingOnHand = Number(varian.stok_on_hand) || 0;
      const existingHpp = Number(varian.hpp_rata_rata) || 0;
      const newOnHand = existingOnHand + qty;

      let newHppAverage = hppBeliPerUnit;
      if (existingOnHand > 0) {
        newHppAverage = ((existingOnHand * existingHpp) + (qty * hppBeliPerUnit)) / newOnHand;
      }

      const nilaiPersediaanAkhir = newOnHand * newHppAverage;

      // Record stock ledger
      insertMutasiStok.run(
        now,
        varianId,
        qty,
        hppBeliPerUnit,
        newOnHand,
        nilaiPersediaanAkhir,
        no_faktur,
        `Pembelian dari ${supplier.nama} (${no_faktur})`,
        user?.nama || 'Admin'
      );

      // Update variant stock & average HPP
      updateVarian.run(newOnHand, newHppAverage, varianId);
    }

    // Deduct cash if Lunas (BR-03)
    if (status_bayar === 'Lunas' && akun_kas_id) {
      db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
        .run(totalBiaya, akun_kas_id);
    }

    db.exec('COMMIT;');

    logAudit(user, 'pembelian', pembelianId, 'CREATE', null, { no_faktur, totalBiaya, status_bayar });

    return { success: true, pembelianId, no_faktur };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Settle Accounts Payable (Pelunasan Utang)
 */
function settleUtang({ pembelian_id, nominal, akun_kas_id, tanggal, catatan = '', user }) {
  assertOpenPeriod(tanggal);

  const pembelian = db.prepare('SELECT * FROM pembelian WHERE id = ?').get(pembelian_id);
  if (!pembelian) throw new Error('Data pembelian tidak ditemukan.');
  if (pembelian.status === 'Void') throw new Error('Pembelian sudah berstatus Void.');
  if (pembelian.status_bayar !== 'Utang') throw new Error('Pembelian ini bukan pembelian utang.');
  if (pembelian.sisa_utang <= 0) throw new Error('Utang untuk pembelian ini sudah lunas.');

  const nom = Number(nominal);
  if (nom <= 0) throw new Error('Nominal pelunasan harus lebih dari 0.');
  if (nom > pembelian.sisa_utang) {
    throw new Error(`Nominal pelunasan (Rp ${nom.toLocaleString('id-ID')}) melebihi sisa utang (Rp ${pembelian.sisa_utang.toLocaleString('id-ID')}).`);
  }

  const akunKas = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_kas_id);
  if (!akunKas) throw new Error('Akun kas tidak ditemukan.');

  if (akunKas.tipe_akun !== 'Rekening Bank' && akunKas.saldo_saat_ini < nom) {
    throw new Error(`Saldo akun kas "${akunKas.nama}" tidak mencukupi untuk pembayaran.`);
  }

  const noTransaksi = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO pelunasan_utang (pembelian_id, no_transaksi, tanggal, nominal, akun_kas_id, catatan, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pembelian_id, noTransaksi, tanggal, nom, akun_kas_id, catatan, user?.nama || 'Admin', now);

    const sisaBaru = pembelian.sisa_utang - nom;
    db.prepare('UPDATE pembelian SET sisa_utang = ? WHERE id = ?').run(sisaBaru, pembelian_id);
    db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nom, akun_kas_id);

    db.exec('COMMIT;');

    logAudit(user, 'pelunasan_utang', noTransaksi, 'CREATE', { sisa_sebelum: pembelian.sisa_utang }, { nominal: nom, sisa_sesudah: sisaBaru });

    return { success: true, noTransaksi, sisa_utang: sisaBaru };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Post Sales (POS or Online) (FR-04, BR-04, BR-05, BR-10)
 */
function createPenjualan({
  no_invoice,
  tipe = 'POS', // 'POS' or 'Online'
  channel_id,
  no_pesanan = null,
  tanggal,
  pelanggan_id = null,
  nama_pelanggan = '',
  metode_bayar = 'Tunai',
  akun_kas_id = null,
  status = 'Selesai', // 'Diproses', 'Dikirim', 'Selesai'
  diskon_total = 0,
  kurir = '',
  no_resi = '',
  catatan = '',
  items, // [{ varian_id, qty, harga, diskon, potongan_admin }]
  user
}) {
  assertOpenPeriod(tanggal);

  // Validate channel (BR-02)
  const channel = db.prepare('SELECT * FROM channel_penjualan WHERE id = ?').get(channel_id);
  if (!channel) throw new Error('Channel penjualan tidak ditemukan.');

  // Validate unique invoice
  const existingInv = db.prepare('SELECT id FROM penjualan WHERE no_invoice = ?').get(no_invoice);
  if (existingInv) throw new Error(`Nomor invoice "${no_invoice}" sudah terdaftar.`);

  // If online with order number, check duplicate
  if (no_pesanan) {
    const existingOrder = db.prepare("SELECT id FROM penjualan WHERE no_pesanan = ? AND channel_id = ? AND status != 'Void' AND status != 'Batal'").get(no_pesanan, channel_id);
    if (existingOrder) throw new Error(`Nomor pesanan marketplace "${no_pesanan}" sudah pernah diimpor/dibuat.`);
  }

  if (!items || items.length === 0) throw new Error('Keranjang item penjualan tidak boleh kosong.');

  const allowNegativeStock = getSetting('izinkan_stok_minus', 'false') === 'true';

  // Determine target cash account
  let targetKasId = akun_kas_id;
  if (!targetKasId) {
    targetKasId = channel.akun_kas_id;
  }
  if (status === 'Selesai' && !targetKasId) {
    throw new Error('Akun kas penerimaan dana belum ditentukan untuk transaksi ini.');
  }

  // Calculate gross, admin cut, net revenue
  let omzetKotor = 0;
  let totalPotonganAdmin = 0;
  let totalDiskonItem = 0;

  for (const it of items) {
    const qty = Number(it.qty);
    const harga = Number(it.harga);
    const diskon = Number(it.diskon) || 0;
    if (qty <= 0) throw new Error('Qty penjualan harus lebih dari 0.');
    if (harga < 0) throw new Error('Harga jual tidak boleh negatif.');

    const subtotal = qty * harga;
    omzetKotor += subtotal;
    totalDiskonItem += diskon;

    // Calculate admin fee per item if not provided
    let potonganAdmin = Number(it.potongan_admin);
    if (isNaN(potonganAdmin) || potonganAdmin < 0) {
      potonganAdmin = (channel.komisi_persen / 100) * subtotal + (channel.komisi_tetap / items.length);
    }
    totalPotonganAdmin += potonganAdmin;
  }

  const diskonFinalTotal = Number(diskon_total) || totalDiskonItem;
  const pendapatanBersih = omzetKotor - diskonFinalTotal - totalPotonganAdmin;

  const now = new Date().toISOString();

  // BEGIN ATOMIC TRANSACTION WITH ROW LOCKING
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Check stock availability for all items
    for (const it of items) {
      const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(it.varian_id);
      if (!varian) throw new Error(`Varian ID ${it.varian_id} tidak ditemukan.`);

      const qty = Number(it.qty);
      const stokTersedia = varian.stok_on_hand - varian.stok_reserved;

      if (!allowNegativeStock && stokTersedia < qty) {
        throw new Error(`Stok tidak mencukupi untuk SKU "${varian.sku}" (${varian.nama_varian}). Tersedia: ${stokTersedia}, Diminta: ${qty}.`);
      }
    }

    // 2. Insert master Penjualan
    const insertPenjualan = db.prepare(`
      INSERT INTO penjualan (
        no_invoice, tipe, channel_id, no_pesanan, tanggal, pelanggan_id, nama_pelanggan,
        metode_bayar, akun_kas_id, status, omzet_kotor, diskon_total, potongan_admin,
        pendapatan_bersih, total_hpp, laba_kotor, kurir, no_resi, catatan,
        created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
    `);

    const resSale = insertPenjualan.run(
      no_invoice,
      tipe,
      channel_id,
      no_pesanan,
      tanggal,
      pelanggan_id,
      nama_pelanggan || (pelanggan_id ? '' : 'Walk-in'),
      metode_bayar,
      targetKasId,
      status,
      omzetKotor,
      diskonFinalTotal,
      totalPotonganAdmin,
      pendapatanBersih,
      kurir,
      no_resi,
      catatan,
      user?.nama || 'Kasir',
      now
    );

    const penjualanId = resSale.lastInsertRowid;

    let totalHpp = 0;

    // 3. Process detail items according to status
    for (const it of items) {
      const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(it.varian_id);
      const qty = Number(it.qty);
      const harga = Number(it.harga);
      const diskon = Number(it.diskon) || 0;
      const sub = qty * harga;

      let adminCut = Number(it.potongan_admin);
      if (isNaN(adminCut) || adminCut < 0) {
        adminCut = (channel.komisi_persen / 100) * sub + (channel.komisi_tetap / items.length);
      }
      const itemNet = sub - diskon - adminCut;

      let hppSnapshot = 0;
      let itemLabaKotor = 0;

      if (status === 'Selesai') {
        // HPP Snapshot locked permanently! (FR-04, Section 6)
        hppSnapshot = Number(varian.hpp_rata_rata) || 0;
        const itemHppTotal = qty * hppSnapshot;
        itemLabaKotor = itemNet - itemHppTotal;
        totalHpp += itemHppTotal;

        // Deduct stok_on_hand
        const newOnHand = varian.stok_on_hand - qty;
        db.prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?').run(newOnHand, varian.id);

        // Record stock ledger (append-only)
        const nilaiPersediaanAkhir = newOnHand * varian.hpp_rata_rata;
        db.prepare(`
          INSERT INTO mutasi_stok (
            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
          ) VALUES (?, ?, 'KELUAR_JUAL', 0, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          now,
          varian.id,
          qty,
          hppSnapshot,
          newOnHand,
          nilaiPersediaanAkhir,
          no_invoice,
          `Penjualan ${tipe} (${channel.nama})`,
          user?.nama || 'Kasir'
        );
      } else if (status === 'Diproses' || status === 'Dikirim') {
        // Reserve stock (BR-05)
        db.prepare('UPDATE varian_produk SET stok_reserved = stok_reserved + ? WHERE id = ?').run(qty, varian.id);
      }

      db.prepare(`
        INSERT INTO detail_penjualan (
          penjualan_id, varian_id, qty, harga, diskon, potongan_admin,
          pendapatan_bersih, hpp_snapshot, laba_kotor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        penjualanId,
        varian.id,
        qty,
        harga,
        diskon,
        adminCut,
        itemNet,
        hppSnapshot,
        itemLabaKotor
      );
    }

    // 4. If Selesai, recognize revenue in cash/marketplace balance and update gross profit (BR-04)
    if (status === 'Selesai') {
      const labaKotorTotal = pendapatanBersih - totalHpp;
      db.prepare(`
        UPDATE penjualan
        SET total_hpp = ?, laba_kotor = ?
        WHERE id = ?
      `).run(totalHpp, labaKotorTotal, penjualanId);

      // Add settled cash to target cash account
      db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')
        .run(pendapatanBersih, targetKasId);
    }

    db.exec('COMMIT;');

    logAudit(user, 'penjualan', no_invoice, 'CREATE', null, {
      id: penjualanId,
      tipe,
      channel: channel.nama,
      status,
      omzetKotor,
      pendapatanBersih
    });

    return {
      success: true,
      penjualanId,
      no_invoice,
      omzetKotor,
      pendapatanBersih,
      status
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Update Sales Status (e.g., Diproses -> Dikirim -> Selesai or Batal)
 */
function updateStatusPenjualan({ penjualan_id, status_baru, user }) {
  const sale = db.prepare('SELECT * FROM penjualan WHERE id = ?').get(penjualan_id);
  if (!sale) throw new Error('Transaksi penjualan tidak ditemukan.');

  assertOpenPeriod(sale.tanggal);

  const statusLama = sale.status;
  if (statusLama === status_baru) return { success: true, message: 'Status tidak berubah.' };

  if (statusLama === 'Void') throw new Error('Transaksi berstatus Void tidak dapat diubah statusnya.');
  if (statusLama === 'Batal') throw new Error('Transaksi berstatus Batal tidak dapat diubah statusnya.');

  const details = db.prepare('SELECT * FROM detail_penjualan WHERE penjualan_id = ?').all(sale.id);
  const channel = db.prepare('SELECT * FROM channel_penjualan WHERE id = ?').get(sale.channel_id);

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    // Transition from Diproses/Dikirim -> Selesai
    if ((statusLama === 'Diproses' || statusLama === 'Dikirim') && status_baru === 'Selesai') {
      let totalHpp = 0;

      for (const item of details) {
        const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(item.varian_id);
        const qty = item.qty;

        // Release reservation and deduct on_hand
        const newReserved = Math.max(0, varian.stok_reserved - qty);
        const newOnHand = varian.stok_on_hand - qty;

        // Lock HPP snapshot!
        const hppSnapshot = Number(varian.hpp_rata_rata) || 0;
        const itemHppTotal = qty * hppSnapshot;
        const itemLabaKotor = item.pendapatan_bersih - itemHppTotal;
        totalHpp += itemHppTotal;

        db.prepare(`
          UPDATE detail_penjualan
          SET hpp_snapshot = ?, laba_kotor = ?
          WHERE id = ?
        `).run(hppSnapshot, itemLabaKotor, item.id);

        db.prepare(`
          UPDATE varian_produk
          SET stok_reserved = ?, stok_on_hand = ?
          WHERE id = ?
        `).run(newReserved, newOnHand, varian.id);

        // Record stock mutation
        const nilaiAkhir = newOnHand * varian.hpp_rata_rata;
        db.prepare(`
          INSERT INTO mutasi_stok (
            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
          ) VALUES (?, ?, 'KELUAR_JUAL', 0, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          now,
          varian.id,
          qty,
          hppSnapshot,
          newOnHand,
          nilaiAkhir,
          sale.no_invoice,
          `Pesanan Selesai (${channel.nama})`,
          user?.nama || 'Admin'
        );
      }

      const labaKotorTotal = sale.pendapatan_bersih - totalHpp;
      db.prepare(`
        UPDATE penjualan
        SET status = 'Selesai', total_hpp = ?, laba_kotor = ?
        WHERE id = ?
      `).run(totalHpp, labaKotorTotal, sale.id);

      // Add to cash account (BR-04)
      const cashAccountId = sale.akun_kas_id || channel.akun_kas_id;
      db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')
        .run(sale.pendapatan_bersih, cashAccountId);
    }
    // Transition from Diproses/Dikirim -> Batal
    else if ((statusLama === 'Diproses' || statusLama === 'Dikirim') && status_baru === 'Batal') {
      for (const item of details) {
        db.prepare('UPDATE varian_produk SET stok_reserved = MAX(0, stok_reserved - ?) WHERE id = ?')
          .run(item.qty, item.varian_id);
      }
      db.prepare("UPDATE penjualan SET status = 'Batal' WHERE id = ?").run(sale.id);
    }
    // Transition between Diproses and Dikirim
    else if ((statusLama === 'Diproses' && status_baru === 'Dikirim') || (statusLama === 'Dikirim' && status_baru === 'Diproses')) {
      db.prepare('UPDATE penjualan SET status = ? WHERE id = ?').run(status_baru, sale.id);
    }
    // Transition from Selesai directly to Batal is prohibited (must use Void)
    else if (statusLama === 'Selesai') {
      throw new Error('Penjualan berstatus "Selesai" tidak dapat diubah ke Batal langsung. Gunakan fitur Void untuk membalik transaksi.');
    }

    db.exec('COMMIT;');

    logAudit(user, 'penjualan', sale.no_invoice, 'UPDATE_STATUS', { status: statusLama }, { status: status_baru });

    return { success: true, message: `Status penjualan berhasil diubah menjadi ${status_baru}.` };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Void Sales Transaction (BR-08, UAT-15)
 */
function voidPenjualan({ penjualan_id, alasan, user }) {
  if (!alasan || !alasan.trim()) throw new Error('Alasan void wajib diisi.');

  const sale = db.prepare('SELECT * FROM penjualan WHERE id = ?').get(penjualan_id);
  if (!sale) throw new Error('Transaksi penjualan tidak ditemukan.');

  assertOpenPeriod(sale.tanggal);

  if (sale.status === 'Void') throw new Error('Transaksi sudah dibatalkan/void.');

  const details = db.prepare('SELECT * FROM detail_penjualan WHERE penjualan_id = ?').all(sale.id);
  const channel = db.prepare('SELECT * FROM channel_penjualan WHERE id = ?').get(sale.channel_id);
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (sale.status === 'Selesai') {
      // Revert stock on hand and insert reversing mutasi_stok
      for (const item of details) {
        const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(item.varian_id);
        const newOnHand = varian.stok_on_hand + item.qty;

        db.prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?').run(newOnHand, varian.id);

        const nilaiAkhir = newOnHand * varian.hpp_rata_rata;
        db.prepare(`
          INSERT INTO mutasi_stok (
            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
          ) VALUES (?, ?, 'VOID_PEMBALIK_JUAL', ?, 0, ?, ?, ?, ?, ?, ?)
        `).run(
          now,
          varian.id,
          item.qty,
          item.hpp_snapshot,
          newOnHand,
          nilaiAkhir,
          sale.no_invoice,
          `Void Penjualan: ${alasan}`,
          user?.nama || 'Admin'
        );
      }

      // Revert settled funds from cash account
      const cashAccountId = sale.akun_kas_id || channel.akun_kas_id;
      db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
        .run(sale.pendapatan_bersih, cashAccountId);
    } else if (sale.status === 'Diproses' || sale.status === 'Dikirim') {
      // Unreserve stock
      for (const item of details) {
        db.prepare('UPDATE varian_produk SET stok_reserved = MAX(0, stok_reserved - ?) WHERE id = ?')
          .run(item.qty, item.varian_id);
      }
    }

    db.prepare("UPDATE penjualan SET status = 'Void', void_alasan = ? WHERE id = ?").run(alasan, sale.id);

    db.exec('COMMIT;');

    logAudit(user, 'penjualan', sale.no_invoice, 'VOID', { status: sale.status, net: sale.pendapatan_bersih }, { status: 'Void', void_alasan: alasan });

    return { success: true, message: `Penjualan ${sale.no_invoice} berhasil divoid.` };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Process Sales Return (FR-05, BR-07, UAT-04)
 */
function createReturPenjualan({
  penjualan_id,
  tanggal,
  kembali_ke_stok = 1, // 1 = Layak (Kembali ke Stok), 0 = Rusak (Kerugian Retur)
  akun_kas_id,
  items, // [{ detail_penjualan_id, qty, refund_per_unit }]
  catatan = '',
  user
}) {
  assertOpenPeriod(tanggal);

  const sale = db.prepare('SELECT * FROM penjualan WHERE id = ?').get(penjualan_id);
  if (!sale) throw new Error('Data penjualan tidak ditemukan.');
  if (sale.status !== 'Selesai') throw new Error('Hanya penjualan berstatus Selesai yang dapat diretur.');

  const akunKas = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_kas_id);
  if (!akunKas) throw new Error('Akun kas sumber refund tidak ditemukan.');

  if (!items || items.length === 0) throw new Error('Item yang diretur harus dipilih.');

  const noRetur = `RET-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  let totalRefund = 0;
  let totalHppRetur = 0;
  let totalKerugianRetur = 0;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const insertRetur = db.prepare(`
      INSERT INTO retur_penjualan (
        no_retur, penjualan_id, tanggal, kembali_ke_stok, akun_kas_id,
        total_refund, total_hpp_retur, kerugian_retur, catatan, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
    `);
    const resRetur = insertRetur.run(
      noRetur,
      penjualan_id,
      tanggal,
      kembali_ke_stok ? 1 : 0,
      akun_kas_id,
      catatan,
      user?.nama || 'Kasir',
      now
    );
    const returId = resRetur.lastInsertRowid;

    for (const it of items) {
      const detailSale = db.prepare('SELECT * FROM detail_penjualan WHERE id = ? AND penjualan_id = ?')
        .get(it.detail_penjualan_id, penjualan_id);
      if (!detailSale) throw new Error(`Detail penjualan ${it.detail_penjualan_id} tidak valid.`);

      // Check previously returned qty for this sale item
      const prevReturnedRow = db.prepare(`
        SELECT SUM(dr.qty) as total_retur
        FROM detail_retur dr
        JOIN retur_penjualan rp ON dr.retur_id = rp.id
        WHERE dr.detail_penjualan_id = ?
      `).get(detailSale.id);

      const prevReturned = prevReturnedRow?.total_retur || 0;
      const sisaQty = detailSale.qty - prevReturned;
      const returQty = Number(it.qty);

      if (returQty <= 0) throw new Error('Qty retur harus lebih dari 0.');
      if (returQty > sisaQty) {
        throw new Error(`Qty retur (${returQty}) melebihi sisa qty terjual (${sisaQty}).`);
      }

      const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(detailSale.varian_id);

      // Refund calculation
      const refundUnit = it.refund_per_unit !== undefined ? Number(it.refund_per_unit) : (detailSale.pendapatan_bersih / detailSale.qty);
      const itemRefund = returQty * refundUnit;
      totalRefund += itemRefund;

      const itemHppUnit = detailSale.hpp_snapshot;

      db.prepare(`
        INSERT INTO detail_retur (
          retur_id, detail_penjualan_id, varian_id, qty, refund_per_unit, hpp_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(returId, detailSale.id, varian.id, returQty, refundUnit, itemHppUnit);

      if (kembali_ke_stok) {
        // Layak: Add stock with original HPP snapshot (FR-05, UAT-04)
        const newOnHand = varian.stok_on_hand + returQty;
        db.prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?').run(newOnHand, varian.id);

        const nilaiAkhir = newOnHand * varian.hpp_rata_rata;
        db.prepare(`
          INSERT INTO mutasi_stok (
            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
          ) VALUES (?, ?, 'RETUR_MASUK', ?, 0, ?, ?, ?, ?, ?, ?)
        `).run(
          now,
          varian.id,
          returQty,
          itemHppUnit,
          newOnHand,
          nilaiAkhir,
          noRetur,
          `Retur Penjualan (${sale.no_invoice}) - Kembali ke Stok`,
          user?.nama || 'Kasir'
        );

        totalHppRetur += returQty * itemHppUnit;
      } else {
        // Rusak: Stock unchanged, recorded as return loss
        totalKerugianRetur += returQty * itemHppUnit;
      }
    }

    // Check cash balance for refund
    if (akunKas.tipe_akun !== 'Rekening Bank' && akunKas.saldo_saat_ini < totalRefund) {
      throw new Error(`Saldo akun kas "${akunKas.nama}" tidak mencukupi untuk refund (Tersedia: Rp ${akunKas.saldo_saat_ini.toLocaleString('id-ID')}, Refund: Rp ${totalRefund.toLocaleString('id-ID')}).`);
    }

    // Deduct cash account for refund
    db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
      .run(totalRefund, akun_kas_id);

    // Update return summary
    db.prepare(`
      UPDATE retur_penjualan
      SET total_refund = ?, total_hpp_retur = ?, kerugian_retur = ?
      WHERE id = ?
    `).run(totalRefund, totalHppRetur, totalKerugianRetur, returId);

    db.exec('COMMIT;');

    logAudit(user, 'retur_penjualan', noRetur, 'CREATE', null, {
      returId,
      no_invoice: sale.no_invoice,
      kembali_ke_stok,
      totalRefund,
      totalHppRetur,
      totalKerugianRetur
    });

    return {
      success: true,
      noRetur,
      totalRefund,
      kembali_ke_stok
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Record Operational Expense (FR-06, UAT-07)
 */
function createBiayaOperasional({
  no_bukti,
  tanggal,
  kategori_id,
  channel_id = null,
  nominal,
  akun_kas_id,
  keterangan = '',
  lampiran_bukti = '',
  user
}) {
  assertOpenPeriod(tanggal);

  const kategori = db.prepare('SELECT * FROM kategori_biaya WHERE id = ?').get(kategori_id);
  if (!kategori) throw new Error('Kategori biaya tidak ditemukan.');

  const nom = Number(nominal);
  if (nom <= 0) throw new Error('Nominal biaya harus lebih dari 0.');

  const akunKas = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_kas_id);
  if (!akunKas) throw new Error('Akun kas pengeluaran tidak ditemukan.');

  if (akunKas.tipe_akun !== 'Rekening Bank' && akunKas.saldo_saat_ini < nom) {
    throw new Error(`Saldo akun kas "${akunKas.nama}" tidak mencukupi.`);
  }

  const existingBukti = db.prepare('SELECT id FROM biaya_operasional WHERE no_bukti = ?').get(no_bukti);
  if (existingBukti) throw new Error(`Nomor bukti "${no_bukti}" sudah digunakan.`);

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const res = db.prepare(`
      INSERT INTO biaya_operasional (
        no_bukti, tanggal, kategori_id, channel_id, nominal, akun_kas_id,
        keterangan, lampiran_bukti, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?)
    `).run(
      no_bukti,
      tanggal,
      kategori_id,
      channel_id || null,
      nom,
      akun_kas_id,
      keterangan,
      lampiran_bukti,
      user?.nama || 'Admin',
      now
    );

    // Deduct cash
    db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
      .run(nom, akun_kas_id);

    db.exec('COMMIT;');

    logAudit(user, 'biaya_operasional', no_bukti, 'CREATE', null, { nominal: nom, kategori: kategori.nama, channel_id });

    return { success: true, biayaId: res.lastInsertRowid, no_bukti };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Cash Transfer between accounts (FR-06, BR-06, UAT-03)
 * Strictly neutral to P&L!
 */
function createMutasiKas({
  no_referensi,
  tanggal,
  akun_asal_id,
  akun_tujuan_id,
  nominal,
  keterangan = '',
  user
}) {
  assertOpenPeriod(tanggal);

  if (Number(akun_asal_id) === Number(akun_tujuan_id)) {
    throw new Error('Akun asal dan akun tujuan tidak boleh sama.');
  }

  const nom = Number(nominal);
  if (nom <= 0) throw new Error('Nominal mutasi kas harus lebih dari 0.');

  const akunAsal = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_asal_id);
  const akunTujuan = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(akun_tujuan_id);

  if (!akunAsal || !akunTujuan) throw new Error('Akun kas asal atau tujuan tidak ditemukan.');

  // Validate non-bank overdraft
  if (akunAsal.tipe_akun !== 'Rekening Bank' && akunAsal.saldo_saat_ini < nom) {
    throw new Error(`Saldo akun asal "${akunAsal.nama}" tidak mencukupi (Tersedia: Rp ${akunAsal.saldo_saat_ini.toLocaleString('id-ID')}).`);
  }

  const existingRef = db.prepare('SELECT id FROM mutasi_kas WHERE no_referensi = ?').get(no_referensi);
  if (existingRef) throw new Error(`Nomor referensi "${no_referensi}" sudah pernah dicatat.`);

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    const res = db.prepare(`
      INSERT INTO mutasi_kas (
        no_referensi, tanggal, akun_asal_id, akun_tujuan_id, nominal, keterangan, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?)
    `).run(
      no_referensi,
      tanggal,
      akun_asal_id,
      akun_tujuan_id,
      nom,
      keterangan,
      user?.nama || 'Admin',
      now
    );

    // Deduct origin, add to destination
    db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nom, akun_asal_id);
    db.prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(nom, akun_tujuan_id);

    db.exec('COMMIT;');

    logAudit(user, 'mutasi_kas', no_referensi, 'CREATE', null, { dari: akunAsal.nama, ke: akunTujuan.nama, nominal: nom });

    return { success: true, mutasiId: res.lastInsertRowid, no_referensi };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Execute Stock Opname Adjustment (FR-07)
 */
function approveOpnameSession({ sesi_id, alasan, user }) {
  if (user?.peran !== 'Owner') {
    throw new Error('Hanya peran Owner yang berhak menyetujui penyesuaian stok opname.');
  }
  if (!alasan || !alasan.trim()) {
    throw new Error('Alasan penyesuaian stok wajib diisi.');
  }

  const sesi = db.prepare('SELECT * FROM sesi_opname WHERE id = ?').get(sesi_id);
  if (!sesi) throw new Error('Sesi opname tidak ditemukan.');
  if (sesi.status !== 'Draft' && sesi.status !== 'Diajukan') {
    throw new Error(`Sesi opname berstatus "${sesi.status}" tidak dapat disetujui lagi.`);
  }

  assertOpenPeriod(sesi.tanggal);

  const details = db.prepare('SELECT * FROM detail_sesi_opname WHERE sesi_id = ?').all();
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const d of details) {
      if (d.selisih_qty !== 0) {
        const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(d.varian_id);
        const newOnHand = d.qty_fisik;

        db.prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?').run(newOnHand, varian.id);

        const qtyMasuk = d.selisih_qty > 0 ? d.selisih_qty : 0;
        const qtyKeluar = d.selisih_qty < 0 ? Math.abs(d.selisih_qty) : 0;
        const nilaiAkhir = newOnHand * varian.hpp_rata_rata;

        db.prepare(`
          INSERT INTO mutasi_stok (
            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
          ) VALUES (?, ?, 'OPNAME_ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          now,
          varian.id,
          qtyMasuk,
          qtyKeluar,
          d.hpp_unit,
          newOnHand,
          nilaiAkhir,
          sesi.no_sesi,
          `Penyesuaian Opname: ${alasan}`,
          user.nama
        );
      }
    }

    db.prepare(`
      UPDATE sesi_opname
      SET status = 'Disetujui', disetujui_oleh = ?, alasan_penyesuaian = ?, disetujui_pada = ?
      WHERE id = ?
    `).run(user.nama, alasan, now, sesi.id);

    db.exec('COMMIT;');

    logAudit(user, 'sesi_opname', sesi.no_sesi, 'APPROVE_OPNAME', { status_sebelum: sesi.status }, { status: 'Disetujui', alasan });

    return { success: true, message: `Sesi opname ${sesi.no_sesi} telah disetujui dan stok telah disesuaikan.` };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Close Accounting Period (FR-09, UAT-12)
 */
function closeAccountingPeriod({ bulan, tahun, user }) {
  if (user?.peran !== 'Owner') {
    throw new Error('Hanya peran Owner yang berhak menutup periode akuntansi.');
  }

  const b = Number(bulan);
  const t = Number(tahun);

  const existing = db.prepare('SELECT * FROM periode_akuntansi WHERE bulan = ? AND tahun = ?').get(b, t);
  if (existing && existing.status === 'Tutup') {
    throw new Error(`Periode ${b}/${t} sudah ditutup.`);
  }

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    let periodeId;
    if (existing) {
      db.prepare(`
        UPDATE periode_akuntansi
        SET status = 'Tutup', ditutup_pada = ?, ditutup_oleh = ?
        WHERE id = ?
      `).run(now, user.nama, existing.id);
      periodeId = existing.id;
    } else {
      const res = db.prepare(`
        INSERT INTO periode_akuntansi (bulan, tahun, status, ditutup_pada, ditutup_oleh)
        VALUES (?, ?, 'Tutup', ?, ?)
      `).run(b, t, now, user.nama);
      periodeId = res.lastInsertRowid;
    }

    // Save snapshot of all SKU inventory values
    const varians = db.prepare('SELECT id, nama_varian, sku, stok_on_hand, hpp_rata_rata FROM varian_produk WHERE aktif = 1').all();
    for (const v of varians) {
      const nilai = v.stok_on_hand * v.hpp_rata_rata;
      db.prepare(`
        INSERT INTO snapshot_periode (periode_id, tipe, ref_id, nama_entitas, nilai, qty)
        VALUES (?, 'PERSEDIAAN', ?, ?, ?, ?)
      `).run(periodeId, v.id, `${v.sku} - ${v.nama_varian}`, nilai, v.stok_on_hand);
    }

    // Save snapshot of all cash accounts
    const akuns = db.prepare('SELECT id, nama, saldo_saat_ini FROM akun_kas_bank WHERE aktif = 1').all();
    for (const a of akuns) {
      db.prepare(`
        INSERT INTO snapshot_periode (periode_id, tipe, ref_id, nama_entitas, nilai, qty)
        VALUES (?, 'KAS', ?, ?, ?, 0)
      `).run(periodeId, a.id, a.nama, a.saldo_saat_ini);
    }

    db.exec('COMMIT;');

    logAudit(user, 'periode_akuntansi', `${b}/${t}`, 'TUTUP_PERIODE', null, { bulan: b, tahun: t });

    return { success: true, message: `Periode akuntansi ${b}/${t} berhasil ditutup.` };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Re-open Closed Accounting Period (FR-09, UAT-12)
 */
function reopenAccountingPeriod({ bulan, tahun, alasan, user }) {
  if (user?.peran !== 'Owner') {
    throw new Error('Hanya peran Owner yang berhak membuka kembali periode akuntansi.');
  }
  if (!alasan || !alasan.trim()) {
    throw new Error('Alasan pembukaan kembali periode wajib diisi.');
  }

  const b = Number(bulan);
  const t = Number(tahun);

  const periode = db.prepare('SELECT * FROM periode_akuntansi WHERE bulan = ? AND tahun = ?').get(b, t);
  if (!periode || periode.status !== 'Tutup') {
    throw new Error(`Periode ${b}/${t} tidak dalam status tertutup.`);
  }

  db.prepare(`
    UPDATE periode_akuntansi
    SET status = 'Buka', catatan_reopen = ?
    WHERE id = ?
  `).run(`Dibuka oleh ${user.nama}: ${alasan}`, periode.id);

  logAudit(user, 'periode_akuntansi', `${b}/${t}`, 'BUKA_PERIODE', { status: 'Tutup' }, { status: 'Buka', alasan });

  return { success: true, message: `Periode akuntansi ${b}/${t} berhasil dibuka kembali.` };
}

module.exports = {
  logAudit,
  assertOpenPeriod,
  getSetting,
  postPembelian,
  settleUtang,
  createPenjualan,
  updateStatusPenjualan,
  voidPenjualan,
  createReturPenjualan,
  createBiayaOperasional,
  createMutasiKas,
  approveOpnameSession,
  closeAccountingPeriod,
  reopenAccountingPeriod
};

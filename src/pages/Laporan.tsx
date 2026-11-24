import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatNumber } from '../utils/format';
import {
  BarChart3,
  Download,
  Calendar,
  Layers,
  ShoppingBag,
  Package,
  Wallet,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Percent
} from 'lucide-react';

export const Laporan: React.FC = () => {
  const { token, canViewProfit } = useAuth();
  const [activeReport, setActiveReport] = useState<
    'laba-rugi' | 'channel' | 'produk' | 'persediaan' | 'kas' | 'utang'
  >('laba-rugi');

  const [tglMulai, setTglMulai] = useState('');
  const [tglSelesai, setTglSelesai] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = () => {
    setLoading(true);
    let endpoint = '';

    if (activeReport === 'laba-rugi') endpoint = '/api/laporan/laba-rugi';
    else if (activeReport === 'channel') endpoint = '/api/laporan/profitabilitas-channel';
    else if (activeReport === 'produk') endpoint = '/api/laporan/profit-produk';
    else if (activeReport === 'persediaan') endpoint = '/api/laporan/nilai-persediaan';
    else if (activeReport === 'kas') endpoint = '/api/laporan/posisi-kas';
    else if (activeReport === 'utang') endpoint = '/api/pembelian/utang/daftar';

    let url = `${endpoint}?`;
    if (tglMulai) url += `tgl_mulai=${tglMulai}&`;
    if (tglSelesai) url += `tgl_selesai=${tglSelesai}&`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setReportData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReport();
  }, [activeReport, tglMulai, tglSelesai]);

  const handleExport = (type: string) => {
    window.open(`/api/import-export/export/${type}?token=${token}`, '_blank');
  };

  if (!canViewProfit) {
    return (
      <div className="bg-white p-8 text-center rounded-2xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Akses Ditolak (RBAC)</h2>
        <p className="text-xs text-slate-500 mt-1">Peran Anda tidak diizinkan mengakses laporan keuangan dan laba rugi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Report Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Laporan & Analitik Keuangan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Laba rugi, profitabilitas channel, margin produk, valuasi stok, dan posisi kas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={tglMulai}
            onChange={e => setTglMulai(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5"
          />
          <span className="text-xs text-slate-400">s/d</span>
          <input
            type="date"
            value={tglSelesai}
            onChange={e => setTglSelesai(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5"
          />

          <button
            onClick={() => handleExport('semua')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Semua (Excel)</span>
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTabSafe('laba-rugi')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'laba-rugi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          📊 Laba Rugi (P&L)
        </button>
        <button
          onClick={() => setActiveTabSafe('channel')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'channel' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          🛒 Profit per Channel
        </button>
        <button
          onClick={() => setActiveTabSafe('produk')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'produk' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          🏷️ Profit per Produk
        </button>
        <button
          onClick={() => setActiveTabSafe('persediaan')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'persediaan' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          📦 Nilai Persediaan
        </button>
        <button
          onClick={() => setActiveTabSafe('kas')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'kas' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          💰 Posisi Kas & Bank
        </button>
        <button
          onClick={() => setActiveTabSafe('utang')}
          className={`px-3 py-2 rounded-xl transition ${activeReport === 'utang' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          ⏳ Umur Utang Dagang
        </button>
      </div>

      {/* REPORT CONTENT */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Memuat data laporan...
        </div>
      ) : reportData ? (
        <div>
          {/* 1. LABA RUGI */}
          {activeReport === 'laba-rugi' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 max-w-4xl mx-auto text-xs">
              <div className="text-center pb-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">Laporan Laba Rugi Komprehensif</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Metode HPP Rata-Rata Bergerak (Moving Average)</p>
              </div>

              {/* Section 1: Revenue */}
              <div className="space-y-2">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-indigo-700">
                  I. Pendapatan Penjualan
                </div>
                <div className="pl-4 space-y-1.5">
                  <div className="flex justify-between text-slate-700">
                    <span>Omzet Kotor Penjualan:</span>
                    <span className="font-semibold">{formatRupiah(reportData.pendapatan?.omzet_kotor)}</span>
                  </div>
                  {reportData.pendapatan?.diskon_penjualan > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Diskon Penjualan:</span>
                      <span>-{formatRupiah(reportData.pendapatan?.diskon_penjualan)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-rose-600">
                    <span>Potongan Admin Marketplace & Channel:</span>
                    <span>-{formatRupiah(reportData.pendapatan?.potongan_admin)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Pendapatan Bersih:</span>
                    <span className="text-indigo-600">{formatRupiah(reportData.pendapatan?.pendapatan_bersih)}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: COGS */}
              <div className="space-y-2">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-indigo-700">
                  II. Harga Pokok Penjualan (HPP)
                </div>
                <div className="pl-4 space-y-1.5">
                  <div className="flex justify-between text-rose-600">
                    <span>Beban HPP Terkunci (Barang Terjual):</span>
                    <span>-{formatRupiah(reportData.hpp)}</span>
                  </div>
                  {reportData.rugi_retur_rusak > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Kerugian Retur Barang Rusak:</span>
                      <span>-{formatRupiah(reportData.rugi_retur_rusak)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-emerald-600 border-t border-slate-200 pt-1.5">
                    <span>LABA KOTOR (GROSS PROFIT):</span>
                    <span>{formatRupiah(reportData.laba_kotor - (reportData.rugi_retur_rusak || 0))}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Operating Expenses */}
              <div className="space-y-2">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-indigo-700">
                  III. Beban Operasional
                </div>
                <div className="pl-4 space-y-3">
                  {reportData.beban_operasional?.map((grp: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>{grp.kelompok}:</span>
                        <span>{formatRupiah(grp.total)}</span>
                      </div>
                      <div className="pl-3 space-y-0.5 text-slate-500 text-[11px]">
                        {grp.items?.map((it: any) => (
                          <div key={it.kode_akun} className="flex justify-between">
                            <span>[{it.kode_akun}] {it.nama_kategori}</span>
                            <span>{formatRupiah(it.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Total Beban Operasional:</span>
                    <span className="text-rose-600 font-bold">-{formatRupiah(reportData.total_beban_operasional)}</span>
                  </div>
                </div>
              </div>

              {/* Net Profit Summary */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex justify-between items-center text-sm">
                <div>
                  <span className="text-[10px] text-indigo-400 uppercase font-mono block">HASIL AKHIR</span>
                  <span className="font-bold">LABA BERSIH OPERASIONAL:</span>
                </div>
                <div className={`text-xl font-extrabold ${reportData.laba_bersih >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatRupiah(reportData.laba_bersih)}
                </div>
              </div>
            </div>
          )}

          {/* 2. PROFITABILITAS PER CHANNEL */}
          {activeReport === 'channel' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                Analisis Kinerja dan Kontribusi Margin per Channel Penjualan
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4 text-right">Trx</th>
                      <th className="py-3 px-4 text-right">Omzet Kotor</th>
                      <th className="py-3 px-4 text-right">Potongan Admin</th>
                      <th className="py-3 px-4 text-right">Net Revenue</th>
                      <th className="py-3 px-4 text-right">HPP</th>
                      <th className="py-3 px-4 text-right">Biaya Channel (Iklan)</th>
                      <th className="py-3 px-4 text-right font-bold text-emerald-600">Laba Kontribusi</th>
                      <th className="py-3 px-4 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.channels?.map((c: any) => (
                      <tr key={c.channel_id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {c.nama_channel} <span className="text-[10px] font-normal text-slate-400">({c.tipe})</span>
                        </td>
                        <td className="py-3 px-4 text-right">{c.transaksi_count}</td>
                        <td className="py-3 px-4 text-right">{formatRupiah(c.omzet_kotor)}</td>
                        <td className="py-3 px-4 text-right text-rose-600">-{formatRupiah(c.potongan_admin)}</td>
                        <td className="py-3 px-4 text-right font-bold">{formatRupiah(c.pendapatan_bersih)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">-{formatRupiah(c.hpp)}</td>
                        <td className="py-3 px-4 text-right text-rose-600">
                          {c.biaya_channel > 0 ? `-${formatRupiah(c.biaya_channel)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                          {formatRupiah(c.laba_kontribusi)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">
                          {c.margin_persen}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. PROFIT PER PRODUK */}
          {activeReport === 'produk' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                Profit per SKU & Deteksi Produk Lambat Laku (Slow-Moving)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">SKU & Varian</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4 text-right">Stok Fisik</th>
                      <th className="py-3 px-4 text-right font-bold">Qty Terjual</th>
                      <th className="py-3 px-4 text-right">Pendapatan Bersih</th>
                      <th className="py-3 px-4 text-right">Total HPP</th>
                      <th className="py-3 px-4 text-right font-bold text-emerald-600">Laba Kotor</th>
                      <th className="py-3 px-4 text-right">Margin %</th>
                      <th className="py-3 px-4 text-center">Status Kecepatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Array.isArray(reportData) && reportData.map((p: any) => (
                      <tr key={p.varian_id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <span className="font-mono text-indigo-600 font-bold">{p.sku}</span>
                          <div className="font-medium text-slate-800">{p.nama_produk} ({p.nama_varian})</div>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{p.kategori}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{p.stok_on_hand} {p.satuan}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{p.qty_terjual}</td>
                        <td className="py-3 px-4 text-right">{formatRupiah(p.pendapatan_bersih)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">{formatRupiah(p.total_hpp)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">{formatRupiah(p.laba_kotor)}</td>
                        <td className="py-3 px-4 text-right font-semibold">{p.margin_persen}%</td>
                        <td className="py-3 px-4 text-center">
                          {p.is_slow_moving ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold">
                              🐢 Lambat Laku
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                              ⚡ Aktif Bergerak
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. NILAI PERSEDIAAN */}
          {activeReport === 'persediaan' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800">Laporan Valuasi Nilai Persediaan Berjalan</span>
                <span className="font-bold text-slate-900">
                  Total Valuasi Aset Stok: <strong className="text-indigo-600 text-sm">{formatRupiah(reportData.grandTotalNilai)}</strong>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Nama Produk & Varian</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4 text-right">Stok Fisik</th>
                      <th className="py-3 px-4 text-right font-mono">HPP Rata-Rata Satuan</th>
                      <th className="py-3 px-4 text-right font-bold text-slate-900">Total Nilai Persediaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.varians?.map((v: any) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600">{v.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{v.nama_produk} ({v.nama_varian})</td>
                        <td className="py-3 px-4 text-slate-500">{v.kategori}</td>
                        <td className="py-3 px-4 text-right font-semibold">{v.stok_on_hand} {v.satuan}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{formatRupiah(v.hpp_rata_rata)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-indigo-700">{formatRupiah(v.total_nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. POSISI KAS & BANK */}
          {activeReport === 'kas' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800">Laporan Arus Mutasi & Saldo Akhir Kas Bank</span>
                <span className="font-bold text-slate-900">
                  Total Likuiditas: <strong className="text-indigo-600 text-sm">{formatRupiah(reportData.grandTotalKas)}</strong>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Nama Akun</th>
                      <th className="py-3 px-4">Tipe Akun</th>
                      <th className="py-3 px-4 text-right">Saldo Awal</th>
                      <th className="py-3 px-4 text-right font-bold text-emerald-600">Penerimaan</th>
                      <th className="py-3 px-4 text-right font-bold text-rose-600">Pengeluaran</th>
                      <th className="py-3 px-4 text-right font-extrabold text-slate-900">Saldo Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.akuns?.map((a: any) => (
                      <tr key={a.akun_id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">{a.nama_akun}</td>
                        <td className="py-3 px-4 text-slate-500">{a.tipe_akun}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(a.saldo_awal)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">+{formatRupiah(a.penerimaan)}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600">-{formatRupiah(a.pengeluaran)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-indigo-700">{formatRupiah(a.saldo_akhir)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. UTANG DAGANG */}
          {activeReport === 'utang' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                Laporan Umur Piutang / Utang Dagang per Supplier (Aging of Payables)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Faktur</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Tanggal Faktur</th>
                      <th className="py-3 px-4">Jatuh Tempo</th>
                      <th className="py-3 px-4">Umur Utang</th>
                      <th className="py-3 px-4 text-right">Nilai Faktur</th>
                      <th className="py-3 px-4 text-right font-bold text-amber-700">Sisa Utang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Array.isArray(reportData) && reportData.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{u.no_faktur}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{u.nama_supplier}</td>
                        <td className="py-3 px-4 text-slate-600">{u.tanggal}</td>
                        <td className="py-3 px-4 text-slate-600">{u.jatuh_tempo || '-'}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">{u.umur_hari} hari ({u.status_tempo})</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(u.total_biaya)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-amber-700">{formatRupiah(u.sisa_utang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  function setActiveTabSafe(tab: any) {
    setActiveReport(tab);
  }
};

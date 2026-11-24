import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatNumber } from '../utils/format';
import {
  TrendingUp,
  DollarSign,
  Wallet,
  AlertTriangle,
  ShoppingBag,
  ArrowUpRight,
  CreditCard,
  PackageX,
  FileSpreadsheet,
  PlusCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { token, canViewProfit } = useAuth();
  const [data, setData] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [tglMulai, setTglMulai] = useState<string>('');
  const [tglSelesai, setTglSelesai] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = () => {
    setLoading(true);
    let url = '/api/laporan/dashboard?';
    if (selectedChannel) url += `channel_id=${selectedChannel}&`;
    if (tglMulai) url += `tgl_mulai=${tglMulai}&`;
    if (tglSelesai) url += `tgl_selesai=${tglSelesai}&`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(resData => {
        setData(resData);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/master/channel', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setChannels)
      .catch(() => {});

    fetchDashboard();
  }, [token, selectedChannel, tglMulai, tglSelesai]);

  if (!canViewProfit) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">Akses Terbatas</h2>
        <p className="text-sm text-slate-500 mt-2">
          Peran Kasir & Admin Online tidak memiliki izin untuk melihat laporan laba rugi dan keuangan.
        </p>
        <Link
          to="/pos"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
        >
          Buka Mode POS Kasir
        </Link>
      </div>
    );
  }

  const kpi = data?.kpi || {};
  const daily = data?.dailyTrend || [];

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Dashboard Ringkas</h1>
          <p className="text-xs text-slate-500 mt-0.5">Ringkasan kinerja keuangan, perputaran stok, dan kas real-time</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Channel Penjualan</option>
            {channels.map(c => (
              <option key={c.id} value={c.id}>{c.nama} ({c.tipe})</option>
            ))}
          </select>

          <input
            type="date"
            value={tglMulai}
            onChange={e => setTglMulai(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
          />
          <span className="text-xs text-slate-400">s/d</span>
          <input
            type="date"
            value={tglSelesai}
            onChange={e => setTglSelesai(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
          />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Penjualan Bersih */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Penjualan Bersih</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900">
              {formatRupiah(kpi.pendapatan_bersih)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Omzet Kotor: {formatRupiah(kpi.total_omzet)}</span>
              <span>{kpi.total_transaksi || 0} Trx</span>
            </div>
          </div>
        </div>

        {/* Laba Kotor */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Laba Kotor</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-emerald-600">
              {formatRupiah(kpi.laba_kotor)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              HPP Terkunci: {formatRupiah(kpi.total_hpp)}
            </div>
          </div>
        </div>

        {/* Laba Bersih */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Laba Bersih Operasional</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-extrabold ${kpi.laba_bersih >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              {formatRupiah(kpi.laba_bersih)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Beban Ops: {formatRupiah(kpi.total_biaya_operasional)}
            </div>
          </div>
        </div>

        {/* Saldo Kas & Bank */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-purple-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Posisi Kas & Bank</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900">
              {formatRupiah(kpi.total_kas)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Utang Dagang: <span className="text-amber-600 font-semibold">{formatRupiah(kpi.total_utang)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Second Row: Stock Alerts & Fast Action Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Alert Summary */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Peringatan Persediaan SKU</h2>
              <Link to="/stok" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                Detail Buku Stok <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500 text-white rounded-lg">
                    <PackageX className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-rose-900">SKU HABIS (Stok ≤ 0)</div>
                    <div className="text-[11px] text-rose-600">Perlu restock segera untuk cegah overselling</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-rose-700">{kpi.count_habis || 0} SKU</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 text-white rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-amber-900">SKU RESTOCK (≤ Stok Min)</div>
                    <div className="text-[11px] text-amber-600">Di bawah batas aman persediaan</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-amber-700">{kpi.count_restock || 0} SKU</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
            <Link
              to="/pos"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
            >
              <CreditCard className="w-4 h-4" />
              <span>Buka POS Kasir</span>
            </Link>
            <Link
              to="/pembelian"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Restock Beli</span>
            </Link>
          </div>
        </div>

        {/* Daily Trend Table / Bar representation */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Tren Penjualan & Laba Harian (14 Hari Terakhir)</h2>
              <p className="text-[11px] text-slate-500">Omzet bersih dan laba kotor transaksi berstatus Selesai</p>
            </div>
            <Link to="/laporan" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              Lihat Laba Rugi Penuh <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {daily.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Belum ada riwayat transaksi penjualan yang selesai pada periode ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 font-semibold">Tanggal</th>
                    <th className="pb-2 font-semibold text-right">Trx</th>
                    <th className="pb-2 font-semibold text-right">Omzet Bersih</th>
                    <th className="pb-2 font-semibold text-right">Laba Kotor</th>
                    <th className="pb-2 font-semibold text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {daily.map((d: any, idx: number) => {
                    const margin = d.omzet_bersih > 0 ? (d.laba_kotor / d.omzet_bersih) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2.5 font-medium text-slate-800">{d.tanggal}</td>
                        <td className="py-2.5 text-right text-slate-600">{d.transaksi_count}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">{formatRupiah(d.omzet_bersih)}</td>
                        <td className="py-2.5 text-right font-semibold text-emerald-600">{formatRupiah(d.laba_kotor)}</td>
                        <td className="py-2.5 text-right text-slate-600">{margin.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

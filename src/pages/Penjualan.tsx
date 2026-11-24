import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatTanggalWaktu } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  Search,
  Filter,
  Eye,
  CheckCircle,
  Truck,
  XCircle,
  RotateCcw,
  Ban,
  Clock,
  Printer
} from 'lucide-react';
import { StrukModal } from '../components/StrukModal';

export const Penjualan: React.FC = () => {
  const { token, hasRole, canViewProfit } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidAlasan, setVoidAlasan] = useState('');
  const [voidingSaleId, setVoidingSaleId] = useState<number | null>(null);
  const [showStruk, setShowStruk] = useState(false);
  const [strukOrder, setStrukOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadSales = () => {
    setLoading(true);
    let url = '/api/penjualan?';
    if (statusFilter) url += `status=${statusFilter}&`;
    if (channelFilter) url += `channel_id=${channelFilter}&`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setSales)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/master/channel', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setChannels)
      .catch(console.error);

    loadSales();
  }, [token, statusFilter, channelFilter]);

  const viewDetail = (id: number) => {
    fetch(`/api/penjualan/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSelectedSale(data);
        setShowDetailModal(true);
      })
      .catch(console.error);
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    if (!confirm(`Ubah status penjualan ini menjadi "${newStatus}"?`)) return;

    try {
      const res = await fetch(`/api/penjualan/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status_baru: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message || 'Status berhasil diubah.');
      loadSales();
      if (showDetailModal) setShowDetailModal(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleVoid = async () => {
    if (!voidAlasan.trim() || !voidingSaleId) {
      alert('Alasan void wajib diisi.');
      return;
    }

    try {
      const res = await fetch(`/api/penjualan/${voidingSaleId}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ alasan: voidAlasan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message || 'Transaksi berhasil divoid.');
      setShowVoidModal(false);
      setVoidAlasan('');
      setVoidingSaleId(null);
      loadSales();
      if (showDetailModal) setShowDetailModal(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredSales = sales.filter(s => {
    const q = search.toLowerCase();
    return (
      s.no_invoice.toLowerCase().includes(q) ||
      (s.no_pesanan && s.no_pesanan.toLowerCase().includes(q)) ||
      (s.nama_pelanggan && s.nama_pelanggan.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Penjualan Multi-Channel</h1>
          <p className="text-xs text-slate-500 mt-0.5">Pantau pesanan offline POS dan online marketplace (Shopee, Tokopedia, TikTok)</p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari Invoice, Pesanan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700"
          >
            <option value="">Semua Status</option>
            <option value="Diproses">Diproses</option>
            <option value="Dikirim">Dikirim</option>
            <option value="Selesai">Selesai</option>
            <option value="Batal">Batal</option>
            <option value="Void">Void</option>
          </select>

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700"
          >
            <option value="">Semua Channel</option>
            {channels.map(c => (
              <option key={c.id} value={c.id}>{c.nama}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Invoice & Tanggal</th>
                <th className="py-3 px-4">Channel & Tipe</th>
                <th className="py-3 px-4">Pelanggan / Pesanan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Omzet Kotor</th>
                <th className="py-3 px-4 text-right">Potongan Admin</th>
                <th className="py-3 px-4 text-right">Pendapatan Bersih</th>
                {canViewProfit && <th className="py-3 px-4 text-right">Laba Kotor</th>}
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={canViewProfit ? 9 : 8} className="py-12 text-center text-slate-400">
                    Tidak ada transaksi penjualan yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredSales.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{s.no_invoice}</div>
                      <div className="text-[11px] text-slate-500">{s.tanggal}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{s.nama_channel}</div>
                      <span className="text-[10px] text-slate-500">{s.tipe}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{s.nama_pelanggan || '-'}</div>
                      {s.no_pesanan && (
                        <div className="text-[10px] font-mono text-indigo-600">ID: {s.no_pesanan}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {formatRupiah(s.omzet_kotor)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 font-medium">
                      -{formatRupiah(s.potongan_admin)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatRupiah(s.pendapatan_bersih)}
                    </td>
                    {canViewProfit && (
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        {s.status === 'Selesai' ? formatRupiah(s.laba_kotor) : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => viewDetail(s.id)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale Detail Modal */}
      {showDetailModal && selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] text-indigo-400 font-mono">DETAIL TRANSAKSI</span>
                <h3 className="text-base font-bold">{selectedSale.no_invoice}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={selectedSale.status} />
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-slate-400 hover:text-white text-lg px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Order Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Channel</span>
                  <span className="font-semibold text-slate-800">{selectedSale.nama_channel}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Tanggal</span>
                  <span className="font-semibold text-slate-800">{selectedSale.tanggal}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Kurir / Resi</span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.kurir || '-'} {selectedSale.no_resi ? `(${selectedSale.no_resi})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Akun Kas</span>
                  <span className="font-semibold text-slate-800">{selectedSale.nama_akun_kas || '-'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Item Produk</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 px-3">SKU & Produk</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Harga Jual</th>
                        <th className="py-2 px-3 text-right">Potongan Admin</th>
                        <th className="py-2 px-3 text-right">Net</th>
                        {canViewProfit && <th className="py-2 px-3 text-right">HPP Snapshot</th>}
                        {canViewProfit && <th className="py-2 px-3 text-right">Laba</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSale.items?.map((it: any) => (
                        <tr key={it.id}>
                          <td className="py-2 px-3">
                            <span className="font-mono text-indigo-600 font-semibold">{it.sku}</span>
                            <div className="text-slate-700">{it.nama_produk} ({it.nama_varian})</div>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{it.qty}</td>
                          <td className="py-2 px-3 text-right">{formatRupiah(it.harga)}</td>
                          <td className="py-2 px-3 text-right text-rose-600">-{formatRupiah(it.potongan_admin)}</td>
                          <td className="py-2 px-3 text-right font-semibold">{formatRupiah(it.pendapatan_bersih)}</td>
                          {canViewProfit && (
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {formatRupiah(it.hpp_snapshot)}
                            </td>
                          )}
                          {canViewProfit && (
                            <td className="py-2 px-3 text-right font-bold text-emerald-600">
                              {formatRupiah(it.laba_kotor)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Omzet Kotor:</span>
                  <span className="font-semibold">{formatRupiah(selectedSale.omzet_kotor)}</span>
                </div>
                {selectedSale.diskon_total > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon Penjualan:</span>
                    <span>-{formatRupiah(selectedSale.diskon_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-600">
                  <span>Total Potongan Admin Marketplace:</span>
                  <span>-{formatRupiah(selectedSale.potongan_admin)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
                  <span>Pendapatan Bersih (Dana Masuk Kas):</span>
                  <span className="text-indigo-600 font-extrabold">{formatRupiah(selectedSale.pendapatan_bersih)}</span>
                </div>
                {canViewProfit && (
                  <>
                    <div className="flex justify-between text-slate-600 pt-1">
                      <span>Total HPP Terkunci:</span>
                      <span className="font-mono">{formatRupiah(selectedSale.total_hpp)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 font-extrabold text-sm border-t border-slate-200 pt-1">
                      <span>Laba Kotor Transaksi:</span>
                      <span>{formatRupiah(selectedSale.laba_kotor)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Order Status Action Controls */}
              {selectedSale.status !== 'Void' && (
                <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2 justify-between items-center">
                  <div className="flex gap-2">
                    {selectedSale.status === 'Diproses' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedSale.id, 'Dikirim')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Kirim Pesanan</span>
                      </button>
                    )}
                    {(selectedSale.status === 'Diproses' || selectedSale.status === 'Dikirim') && (
                      <button
                        onClick={() => handleUpdateStatus(selectedSale.id, 'Selesai')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Selesaikan (Kunci HPP & Kas)</span>
                      </button>
                    )}
                    {(selectedSale.status === 'Diproses' || selectedSale.status === 'Dikirim') && (
                      <button
                        onClick={() => handleUpdateStatus(selectedSale.id, 'Batal')}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Batalkan Pesanan</span>
                      </button>
                    )}
                    {selectedSale.tipe === 'POS' && (
                      <button
                        onClick={() => {
                          setStrukOrder(selectedSale);
                          setShowStruk(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak Ulang Struk</span>
                      </button>
                    )}
                  </div>

                  {/* Owner Void Action */}
                  {hasRole('Owner') && selectedSale.status !== 'Batal' && (
                    <button
                      onClick={() => {
                        setVoidingSaleId(selectedSale.id);
                        setShowVoidModal(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium border border-rose-200 flex items-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Void Transaksi</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-xs space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <Ban className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Konfirmasi Void Transaksi</h3>
                <p className="text-[11px] text-slate-500">
                  Void akan membuat mutasi pembalik stok dan membatalkan pendapatan di kas.
                </p>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan Pembatalan / Void (Wajib Diisi):
              </label>
              <textarea
                rows={3}
                value={voidAlasan}
                onChange={e => setVoidAlasan(e.target.value)}
                placeholder="Contoh: Salah pilih SKU / Customer batalkan pesanan..."
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowVoidModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleVoid}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-md shadow-rose-600/30"
              >
                Konfirmasi Void
              </button>
            </div>
          </div>
        </div>
      )}

      <StrukModal
        isOpen={showStruk}
        onClose={() => setShowStruk(false)}
        order={strukOrder}
      />
    </div>
  );
};

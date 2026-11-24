import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../utils/format';
import { Badge } from '../components/Badge';
import { RotateCcw, Search, Plus, Eye, AlertCircle, CheckCircle2 } from 'lucide-react';

export const Retur: React.FC = () => {
  const { token, canViewProfit } = useAuth();
  const [returs, setReturs] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [akunKasList, setAkunKasList] = useState<any[]>([]);

  // Search invoice
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [foundSale, setFoundSale] = useState<any>(null);
  const [searchError, setSearchError] = useState('');

  // Return Form
  const [kembaliKeStok, setKembaliKeStok] = useState<number>(1);
  const [selectedAkunKas, setSelectedAkunKas] = useState<number>(1);
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [catatan, setCatatan] = useState('');
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadReturs = () => {
    fetch('/api/retur', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setReturs)
      .catch(console.error);

    fetch('/api/master/akun-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setAkunKasList)
      .catch(console.error);
  };

  useEffect(() => {
    loadReturs();
  }, [token]);

  const searchInvoice = async () => {
    if (!invoiceQuery.trim()) return;
    setSearchError('');
    setFoundSale(null);

    try {
      const res = await fetch(`/api/penjualan?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      const sales = await res.json();
      const match = sales.find((s: any) => s.no_invoice.toLowerCase() === invoiceQuery.trim().toLowerCase());

      if (!match) {
        setSearchError('Nomor invoice tidak ditemukan.');
        return;
      }
      if (match.status !== 'Selesai') {
        setSearchError(`Hanya penjualan berstatus "Selesai" yang dapat diretur (Status saat ini: ${match.status}).`);
        return;
      }

      // Fetch detail with items
      const detailRes = await fetch(`/api/penjualan/${match.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const detailData = await detailRes.json();
      setFoundSale(detailData);

      // Initialize return quantities to 0
      const initQ: Record<number, number> = {};
      for (const it of detailData.items) {
        initQ[it.id] = 0;
      }
      setReturnQtys(initQ);
    } catch (err: any) {
      setSearchError(err.message);
    }
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundSale) return;

    // Filter items with qty > 0
    const itemsToReturn = Object.entries(returnQtys)
      .filter(([_, q]) => q > 0)
      .map(([detailId, q]) => ({
        detail_penjualan_id: Number(detailId),
        qty: q
      }));

    if (itemsToReturn.length === 0) {
      alert('Pilih minimal satu item yang diretur dengan kuantitas lebih dari 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/retur', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          penjualan_id: foundSale.id,
          tanggal,
          kembali_ke_stok: kembaliKeStok,
          akun_kas_id: selectedAkunKas,
          items: itemsToReturn,
          catatan
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(`Retur ${data.noRetur} berhasil diproses.`);
      setShowAddModal(false);
      setFoundSale(null);
      setInvoiceQuery('');
      setCatatan('');
      loadReturs();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Retur Penjualan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Penanganan barang retur layak (kembali ke stok dgn HPP asli) atau rusak (kerugian retur)</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Proses Retur Baru</span>
        </button>
      </div>

      {/* Retur Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="py-3 px-4">No. Retur</th>
                <th className="py-3 px-4">No. Invoice Asal</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Status Barang</th>
                <th className="py-3 px-4 text-right">Total Refund Kas</th>
                {canViewProfit && <th className="py-3 px-4 text-right">HPP Dipulihkan</th>}
                {canViewProfit && <th className="py-3 px-4 text-right">Rugi Retur (Rusak)</th>}
                <th className="py-3 px-4">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returs.length === 0 ? (
                <tr>
                  <td colSpan={canViewProfit ? 8 : 6} className="py-12 text-center text-slate-400">
                    Belum ada riwayat retur penjualan.
                  </td>
                </tr>
              ) : (
                returs.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.no_retur}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-indigo-600">{r.no_invoice}</td>
                    <td className="py-3 px-4 text-slate-600">{r.tanggal}</td>
                    <td className="py-3 px-4">
                      {r.kembali_ke_stok === 1 ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                          ✓ Layak (Kembali ke Stok)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold text-[11px]">
                          ✕ Rusak (Kerugian Retur)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      -{formatRupiah(r.total_refund)}
                    </td>
                    {canViewProfit && (
                      <td className="py-3 px-4 text-right font-mono text-emerald-600">
                        {r.total_hpp_retur > 0 ? formatRupiah(r.total_hpp_retur) : '-'}
                      </td>
                    )}
                    {canViewProfit && (
                      <td className="py-3 px-4 text-right font-mono text-rose-700 font-bold">
                        {r.kerugian_retur > 0 ? formatRupiah(r.kerugian_retur) : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-slate-500">{r.catatan || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Return Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Proses Retur Penjualan</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Step 1: Search Invoice */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="font-semibold text-slate-700 block mb-1">
                  1. Masukkan Nomor Invoice Penjualan:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Contoh: POS-..., INV-ONLINE-..."
                    value={invoiceQuery}
                    onChange={e => setInvoiceQuery(e.target.value)}
                    className="flex-1 p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs"
                  />
                  <button
                    type="button"
                    onClick={searchInvoice}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"
                  >
                    Cari Faktur
                  </button>
                </div>
                {searchError && (
                  <p className="text-rose-600 text-[11px] mt-1 font-medium">{searchError}</p>
                )}
              </div>

              {/* Step 2: Item Selection and Return Options */}
              {foundSale && (
                <form onSubmit={handleProcessReturn} className="space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-900">{foundSale.no_invoice}</span>
                      <div className="text-[11px] text-slate-500">
                        {foundSale.tanggal} • {foundSale.nama_channel} • {foundSale.nama_pelanggan}
                      </div>
                    </div>
                    <Badge status={foundSale.status} />
                  </div>

                  {/* Return options */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Kondisi Barang Retur *</label>
                      <select
                        value={kembaliKeStok}
                        onChange={e => setKembaliKeStok(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                      >
                        <option value={1}>Layak Jual (Kembali ke Stok, HPP Asli)</option>
                        <option value={0}>Rusak / Cacat (Tidak Kembali ke Stok, Rugi Retur)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Akun Kas Sumber Refund *</label>
                      <select
                        value={selectedAkunKas}
                        onChange={e => setSelectedAkunKas(Number(e.target.value))}
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        {akunKasList.map(a => (
                          <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Item table */}
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Pilih Qty Barang yang Diretur:</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b text-slate-500 font-semibold">
                          <tr>
                            <th className="py-2 px-3">SKU & Produk</th>
                            <th className="py-2 px-3 text-right">Qty Terjual</th>
                            <th className="py-2 px-3 text-right">Harga Jual</th>
                            <th className="py-2 px-3 text-right w-28">Qty Retur</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {foundSale.items?.map((it: any) => (
                            <tr key={it.id}>
                              <td className="py-2 px-3">
                                <span className="font-mono text-indigo-600 font-semibold">{it.sku}</span>
                                <div className="text-slate-800 font-medium">{it.nama_produk} ({it.nama_varian})</div>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">{it.qty}</td>
                              <td className="py-2 px-3 text-right">{formatRupiah(it.harga)}</td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={it.qty}
                                  value={returnQtys[it.id] || 0}
                                  onChange={e => setReturnQtys({ ...returnQtys, [it.id]: Math.min(it.qty, Math.max(0, Number(e.target.value))) })}
                                  className="w-20 p-1 border border-slate-300 rounded text-center font-bold text-xs"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Catatan Alasan Retur:</label>
                    <input
                      type="text"
                      placeholder="Contoh: Ukuran kekecilan / salah warna..."
                      value={catatan}
                      onChange={e => setCatatan(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
                    >
                      {submitting ? 'Memproses...' : 'Posting Retur Penjualan'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

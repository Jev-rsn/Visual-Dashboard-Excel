import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatTanggal } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  Truck,
  Plus,
  Search,
  Trash2,
  Calendar,
  CreditCard,
  DollarSign,
  AlertCircle,
  Clock,
  Eye,
  CheckCircle2
} from 'lucide-react';

export const Pembelian: React.FC = () => {
  const { token, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'daftar' | 'buat' | 'utang'>('daftar');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [utangList, setUtangList] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [varians, setVarians] = useState<any[]>([]);
  const [akunKasList, setAkunKasList] = useState<any[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Form State for Buat Pembelian
  const [noFaktur, setNoFaktur] = useState(`FAK-${Date.now().toString(36).toUpperCase()}`);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [statusBayar, setStatusBayar] = useState<'Lunas' | 'Utang'>('Lunas');
  const [terminHari, setTerminHari] = useState<number>(30);
  const [akunKasId, setAkunKasId] = useState<number>(2); // Default Bank BCA
  const [ongkir, setOngkir] = useState<number>(0);
  const [metodeAlokasi, setMetodeAlokasi] = useState<'nilai' | 'qty'>('nilai');
  const [catatan, setCatatan] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Settlement Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlePembelianId, setSettlePembelianId] = useState<number | null>(null);
  const [settleNominal, setSettleNominal] = useState<number>(0);
  const [settleAkunKasId, setSettleAkunKasId] = useState<number>(2);
  const [settleTanggal, setSettleTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [settleCatatan, setSettleCatatan] = useState('');

  const loadData = () => {
    fetch('/api/pembelian', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPurchases)
      .catch(console.error);

    fetch('/api/pembelian/utang/daftar', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setUtangList)
      .catch(console.error);

    fetch('/api/master/supplier', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setSuppliers)
      .catch(console.error);

    fetch('/api/master/varians', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setVarians)
      .catch(console.error);

    fetch('/api/master/akun-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setAkunKasList)
      .catch(console.error);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Add Item to Purchase Form
  const addItemRow = (varianId: number) => {
    const v = varians.find(x => x.id === varianId);
    if (!v) return;
    const existing = items.find(i => i.varian_id === varianId);
    if (existing) {
      setItems(items.map(i => i.varian_id === varianId ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setItems([
        ...items,
        {
          varian_id: v.id,
          sku: v.sku,
          nama_produk: v.nama_produk,
          nama_varian: v.nama_varian,
          qty: 10,
          harga_beli: v.hpp_rata_rata > 0 ? v.hpp_rata_rata : 30000
        }
      ]);
    }
  };

  const removeItemRow = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, val: any) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: Number(val) } : it));
  };

  // Calculations for Shipping Allocation Preview
  const totalSubtotal = items.reduce((sum, it) => sum + (it.qty * it.harga_beli), 0);
  const totalQty = items.reduce((sum, it) => sum + it.qty, 0);
  const grandTotalBiaya = totalSubtotal + Number(ongkir);

  // Submit Purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      alert('Pilih supplier terlebih dahulu.');
      return;
    }
    if (items.length === 0) {
      alert('Minimal tambahkan satu item produk yang dibeli.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/pembelian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          no_faktur: noFaktur,
          supplier_id: Number(supplierId),
          tanggal,
          status_bayar: statusBayar,
          termin_hari: Number(terminHari),
          akun_kas_id: statusBayar === 'Lunas' ? Number(akunKasId) : null,
          ongkir: Number(ongkir),
          metode_alokasi_ongkir: metodeAlokasi,
          catatan,
          items: items.map(it => ({
            varian_id: it.varian_id,
            qty: it.qty,
            harga_beli: it.harga_beli
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Pembelian berhasil diposting dan HPP telah dihitung ulang!');
      setNoFaktur(`FAK-${Date.now().toString(36).toUpperCase()}`);
      setItems([]);
      setOngkir(0);
      setCatatan('');
      setActiveTab('daftar');
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open detail purchase
  const viewDetail = (id: number) => {
    fetch(`/api/pembelian/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSelectedPurchase(data);
        setShowDetailModal(true);
      })
      .catch(console.error);
  };

  // Settle Debt
  const handleSettleSubmit = async () => {
    if (!settlePembelianId || settleNominal <= 0) {
      alert('Nominal pelunasan harus lebih dari 0.');
      return;
    }

    try {
      const res = await fetch('/api/pembelian/utang/pelunasan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          pembelian_id: settlePembelianId,
          nominal: settleNominal,
          akun_kas_id: settleAkunKasId,
          tanggal: settleTanggal,
          catatan: settleCatatan
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Pelunasan utang berhasil dicatat.');
      setShowSettleModal(false);
      setSettleNominal(0);
      setSettleCatatan('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Pembelian & Utang Dagang</h1>
          <p className="text-xs text-slate-500 mt-0.5">Pengadaan stok barang, alokasi ongkir masuk proporsional, dan kontrol utang supplier</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('daftar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'daftar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Riwayat Pembelian
          </button>
          <button
            onClick={() => setActiveTab('buat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'buat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Input Pembelian Baru
          </button>
          <button
            onClick={() => setActiveTab('utang')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'utang' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Utang Dagang</span>
            {utangList.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {utangList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: DAFTAR PEMBELIAN */}
      {activeTab === 'daftar' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">No. Faktur</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status Bayar</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">Ongkir</th>
                  <th className="py-3 px-4 text-right">Total Biaya</th>
                  <th className="py-3 px-4 text-right">Sisa Utang</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Belum ada dokumen pembelian yang dicatat.
                    </td>
                  </tr>
                ) : (
                  purchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{p.no_faktur}</td>
                      <td className="py-3 px-4 text-slate-600">{p.tanggal}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{p.nama_supplier}</td>
                      <td className="py-3 px-4">
                        <Badge status={p.status_bayar} />
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{formatRupiah(p.total_subtotal)}</td>
                      <td className="py-3 px-4 text-right text-slate-500">{formatRupiah(p.ongkir)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">{formatRupiah(p.total_biaya)}</td>
                      <td className="py-3 px-4 text-right">
                        {p.sisa_utang > 0 ? (
                          <span className="font-bold text-amber-600">{formatRupiah(p.sisa_utang)}</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Lunas</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => viewDetail(p.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
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
      )}

      {/* TAB 2: INPUT PEMBELIAN BARU */}
      {activeTab === 'buat' && (
        <form onSubmit={handleSubmitPurchase} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">No. Faktur Supplier *</label>
              <input
                type="text"
                required
                value={noFaktur}
                onChange={e => setNoFaktur(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Supplier *</label>
              <select
                required
                value={supplierId}
                onChange={e => {
                  setSupplierId(e.target.value ? Number(e.target.value) : '');
                  const s = suppliers.find(x => x.id === Number(e.target.value));
                  if (s) setTerminHari(s.termin_hari || 30);
                }}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="">Pilih Supplier...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.nama} ({s.termin_hari} hari)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tanggal Faktur</label>
              <input
                type="date"
                required
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Status Pembayaran</label>
              <select
                value={statusBayar}
                onChange={e => setStatusBayar(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
              >
                <option value="Lunas">Lunas (Dipotong Kas)</option>
                <option value="Utang">Utang (Tempo Dagang)</option>
              </select>
            </div>

            {statusBayar === 'Lunas' ? (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Akun Kas Sumber Dana</label>
                <select
                  value={akunKasId}
                  onChange={e => setAkunKasId(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  {akunKasList.map(a => (
                    <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Termin Pembayaran (Hari)</label>
                <input
                  type="number"
                  value={terminHari}
                  onChange={e => setTerminHari(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Ongkir Masuk (Inbound Freight)</label>
              <input
                type="number"
                value={ongkir || ''}
                onChange={e => setOngkir(Number(e.target.value))}
                placeholder="Rp 0"
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Metode Alokasi Ongkir</label>
              <select
                value={metodeAlokasi}
                onChange={e => setMetodeAlokasi(e.target.value as any)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="nilai">Proporsional Nilai Barang (Standar Akuntansi)</option>
                <option value="qty">Proporsional Kuantitas (Qty)</option>
              </select>
            </div>
          </div>

          {/* Add Item Quick Selector */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Item Barang yang Dibeli</h3>
              <select
                onChange={e => {
                  if (e.target.value) {
                    addItemRow(Number(e.target.value));
                    e.target.value = '';
                  }
                }}
                className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold rounded-lg px-3 py-1.5"
              >
                <option value="">+ Tambah SKU dari Katalog...</option>
                {varians.map(v => (
                  <option key={v.id} value={v.id}>{v.sku} - {v.nama_produk} ({v.nama_varian})</option>
                ))}
              </select>
            </div>

            {/* Items Table with Live Allocated Shipping Preview */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">SKU & Produk</th>
                    <th className="py-2.5 px-3 w-24">Qty Beli</th>
                    <th className="py-2.5 px-3 w-36">Harga Beli Satuan</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3 text-right">Alokasi Ongkir</th>
                    <th className="py-2.5 px-3 text-right font-bold text-indigo-600">HPP Beli / Unit</th>
                    <th className="py-2.5 px-3 text-center w-12">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Belum ada item dipilih. Gunakan dropdown di atas untuk menambah barang.
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => {
                      const itemSubtotal = it.qty * it.harga_beli;
                      let alokasi = 0;
                      if (ongkir > 0) {
                        if (metodeAlokasi === 'qty' && totalQty > 0) {
                          alokasi = (it.qty / totalQty) * ongkir;
                        } else if (totalSubtotal > 0) {
                          alokasi = (itemSubtotal / totalSubtotal) * ongkir;
                        }
                      }
                      const hppUnit = (itemSubtotal + alokasi) / (it.qty || 1);

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-indigo-600 font-semibold">{it.sku}</span>
                            <div className="text-slate-800 font-medium">{it.nama_produk} ({it.nama_varian})</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="1"
                              value={it.qty}
                              onChange={e => updateItem(idx, 'qty', e.target.value)}
                              className="w-20 p-1 border border-slate-300 rounded font-semibold text-center"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              value={it.harga_beli}
                              onChange={e => updateItem(idx, 'harga_beli', e.target.value)}
                              className="w-32 p-1 border border-slate-300 rounded font-semibold text-right"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                            {formatRupiah(itemSubtotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            {formatRupiah(alokasi)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-indigo-700 font-mono">
                            {formatRupiah(hppUnit)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Summary & Submit */}
          <div className="p-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
            <div className="space-y-1">
              <div>Subtotal Barang: <span className="font-bold">{formatRupiah(totalSubtotal)}</span></div>
              <div>Ongkir Masuk: <span className="font-bold">{formatRupiah(ongkir)}</span></div>
              <div className="text-sm font-extrabold text-slate-900">
                Grand Total Biaya: <span className="text-indigo-600">{formatRupiah(grandTotalBiaya)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
            >
              {submitting ? 'Memproses...' : 'Posting Pembelian & Perbarui HPP Rata-Rata'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: MODUL UTANG DAGANG */}
      {activeTab === 'utang' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-800">
              <Clock className="w-4 h-4" />
              <span className="font-bold">Daftar Utang Dagang Belum Lunas</span>
            </div>
            <div className="font-bold text-slate-800">
              Total Utang: <span className="text-amber-700 font-extrabold text-sm">
                {formatRupiah(utangList.reduce((sum, u) => sum + u.sisa_utang, 0))}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">No. Faktur</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Tanggal Faktur</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4">Umur Utang</th>
                  <th className="py-3 px-4 text-right">Total Faktur</th>
                  <th className="py-3 px-4 text-right">Sisa Utang</th>
                  <th className="py-3 px-4 text-center">Pelunasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {utangList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Semua kewajiban utang dagang supplier telah lunas (Rp0).
                    </td>
                  </tr>
                ) : (
                  utangList.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.no_faktur}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{u.nama_supplier}</td>
                      <td className="py-3 px-4 text-slate-600">{u.tanggal}</td>
                      <td className="py-3 px-4 font-medium text-slate-700">{u.jatuh_tempo || '-'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {u.umur_hari} hari ({u.status_tempo})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(u.total_biaya)}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-amber-700">{formatRupiah(u.sisa_utang)}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSettlePembelianId(u.id);
                            setSettleNominal(u.sisa_utang);
                            setShowSettleModal(true);
                          }}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition"
                        >
                          Lunasi Utang
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settle Debt Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 text-xs space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <CreditCard className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900">Pelunasan Utang Supplier</h3>
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Nominal Pembayaran (Rp):</label>
              <input
                type="number"
                value={settleNominal}
                onChange={e => setSettleNominal(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Dari Akun Kas / Bank:</label>
              <select
                value={settleAkunKasId}
                onChange={e => setSettleAkunKasId(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 rounded-lg"
              >
                {akunKasList.map(a => (
                  <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Tanggal Pembayaran:</label>
              <input
                type="date"
                value={settleTanggal}
                onChange={e => setSettleTanggal(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Catatan / No. Bukti Transfer:</label>
              <input
                type="text"
                placeholder="Contoh: Transfer via BCA Klik"
                value={settleCatatan}
                onChange={e => setSettleCatatan(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSettleModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleSettleSubmit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
              >
                Konfirmasi Pelunasan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-mono">DOKUMEN PEMBELIAN</span>
                <h3 className="font-bold text-sm">{selectedPurchase.no_faktur}</h3>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Supplier</span>
                  <span className="font-semibold text-slate-900">{selectedPurchase.nama_supplier}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Tanggal</span>
                  <span className="font-semibold text-slate-900">{selectedPurchase.tanggal}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Status Bayar</span>
                  <Badge status={selectedPurchase.status_bayar} />
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Item Pembelian</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                      <tr>
                        <th className="py-2 px-3">SKU & Produk</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Harga Beli</th>
                        <th className="py-2 px-3 text-right">Alokasi Ongkir</th>
                        <th className="py-2 px-3 text-right">HPP Unit</th>
                        <th className="py-2 px-3 text-right">Total Item</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedPurchase.items?.map((it: any) => (
                        <tr key={it.id}>
                          <td className="py-2 px-3">
                            <span className="font-mono text-indigo-600 font-semibold">{it.sku}</span>
                            <div className="text-slate-700">{it.nama_produk} ({it.nama_varian})</div>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{it.qty}</td>
                          <td className="py-2 px-3 text-right">{formatRupiah(it.harga_beli)}</td>
                          <td className="py-2 px-3 text-right text-slate-500">{formatRupiah(it.ongkir_alokasi)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-indigo-700">{formatRupiah(it.hpp_beli_per_unit)}</td>
                          <td className="py-2 px-3 text-right font-bold">{formatRupiah(it.total_item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment history if any */}
              {selectedPurchase.pelunasan?.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Riwayat Pelunasan Utang</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500 border-b">
                        <tr>
                          <th className="py-1.5 px-3">No. Transaksi</th>
                          <th className="py-1.5 px-3">Tanggal</th>
                          <th className="py-1.5 px-3">Akun Kas</th>
                          <th className="py-1.5 px-3 text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPurchase.pelunasan.map((pl: any) => (
                          <tr key={pl.id}>
                            <td className="py-1.5 px-3 font-mono font-semibold">{pl.no_transaksi}</td>
                            <td className="py-1.5 px-3">{pl.tanggal}</td>
                            <td className="py-1.5 px-3">{pl.nama_akun_kas}</td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-600">{formatRupiah(pl.nominal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

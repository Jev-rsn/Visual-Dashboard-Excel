import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  Package,
  Plus,
  Search,
  Download,
  Trash2,
  Edit2,
  Check,
  AlertTriangle
} from 'lucide-react';

export const Produk: React.FC = () => {
  const { token, hasRole, canViewProfit } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Product Form State
  const [namaProduk, setNamaProduk] = useState('');
  const [kategori, setKategori] = useState('Pakaian Pria');
  const [deskripsi, setDeskripsi] = useState('');
  const [varians, setVarians] = useState<any[]>([
    { sku: '', nama_varian: 'Default', barcode: '', warna: '', ukuran: '', satuan: 'Pcs', harga_jual_default: 50000, stok_min: 5 }
  ]);

  const loadProducts = () => {
    fetch('/api/master/produk', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setProducts)
      .catch(console.error);
  };

  useEffect(() => {
    loadProducts();
  }, [token]);

  const addVarianRow = () => {
    setVarians([
      ...varians,
      { sku: '', nama_varian: '', barcode: '', warna: '', ukuran: '', satuan: 'Pcs', harga_jual_default: 50000, stok_min: 5 }
    ]);
  };

  const removeVarianRow = (index: number) => {
    if (varians.length <= 1) return;
    setVarians(varians.filter((_, i) => i !== index));
  };

  const updateVarian = (index: number, field: string, value: any) => {
    setVarians(varians.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaProduk.trim()) {
      alert('Nama produk wajib diisi.');
      return;
    }
    for (const v of varians) {
      if (!v.sku || !v.sku.trim()) {
        alert('Semua varian wajib memiliki kode SKU.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/master/produk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nama: namaProduk,
          kategori,
          deskripsi,
          varians
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Produk dan varian SKU berhasil disimpan.');
      setShowAddModal(false);
      setNamaProduk('');
      setDeskripsi('');
      setVarians([
        { sku: '', nama_varian: 'Default', barcode: '', warna: '', ukuran: '', satuan: 'Pcs', harga_jual_default: 50000, stok_min: 5 }
      ]);
      loadProducts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Export full catalog to Excel
  const handleExport = () => {
    window.open(`/api/import-export/export/produk?token=${token}`, '_blank');
  };

  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    const matchProd = p.nama.toLowerCase().includes(q) || p.kategori.toLowerCase().includes(q);
    const matchVar = p.varians?.some((v: any) => v.sku.toLowerCase().includes(q) || v.nama_varian.toLowerCase().includes(q));
    return matchProd || matchVar;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Katalog Produk & SKU</h1>
          <p className="text-xs text-slate-500 mt-0.5">Daftar produk induk dan SKU varian multi-channel</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari SKU atau Nama..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Excel</span>
          </button>

          {hasRole('Owner', 'Admin Purchasing & Gudang') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Produk</span>
            </button>
          )}
        </div>
      </div>

      {/* Product List */}
      <div className="space-y-4">
        {filteredProducts.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs">
            Belum ada produk yang cocok dengan pencarian.
          </div>
        ) : (
          filteredProducts.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {p.kategori}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-1">{p.nama}</h3>
                  {p.deskripsi && <p className="text-xs text-slate-500 mt-0.5">{p.deskripsi}</p>}
                </div>
                <div className="text-xs text-slate-500">
                  {p.varians?.length || 0} Varian SKU
                </div>
              </div>

              {/* Variants Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white text-slate-400 uppercase font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-4">Kode SKU</th>
                      <th className="py-2.5 px-4">Nama Varian</th>
                      <th className="py-2.5 px-4">Barcode</th>
                      <th className="py-2.5 px-4 text-right">Harga Jual</th>
                      {canViewProfit && <th className="py-2.5 px-4 text-right">HPP Rata-Rata</th>}
                      <th className="py-2.5 px-4 text-right">Stok Min</th>
                      <th className="py-2.5 px-4 text-right">Stok Fisik</th>
                      <th className="py-2.5 px-4 text-right font-bold text-indigo-700">Tersedia</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.varians?.map((v: any) => {
                      const tersedia = v.stok_on_hand - v.stok_reserved;
                      let statusStok = 'AMAN';
                      if (tersedia <= 0) statusStok = 'HABIS';
                      else if (tersedia <= v.stok_min) statusStok = 'RESTOCK';

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">{v.sku}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{v.nama_varian}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{v.barcode || '-'}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-900">{formatRupiah(v.harga_jual_default)}</td>
                          {canViewProfit && (
                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">{formatRupiah(v.hpp_rata_rata)}</td>
                          )}
                          <td className="py-2.5 px-4 text-right text-slate-500">{v.stok_min} {v.satuan}</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-slate-800">{v.stok_on_hand}</td>
                          <td className="py-2.5 px-4 text-right font-extrabold text-indigo-700">{tersedia}</td>
                          <td className="py-2.5 px-4 text-center">
                            <Badge status={statusStok} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Tambah Produk & Varian Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Produk Induk *</label>
                  <input
                    type="text"
                    required
                    value={namaProduk}
                    onChange={e => setNamaProduk(e.target.value)}
                    placeholder="Contoh: Kaos Polos Katun Combed 30s"
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kategori</label>
                  <input
                    type="text"
                    required
                    value={kategori}
                    onChange={e => setKategori(e.target.value)}
                    placeholder="Contoh: Pakaian Pria"
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Deskripsi Produk (Opsional)</label>
                <textarea
                  rows={2}
                  value={deskripsi}
                  onChange={e => setDeskripsi(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Varian Rows */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Daftar SKU Varian</h4>
                  <button
                    type="button"
                    onClick={addVarianRow}
                    className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Varian
                  </button>
                </div>

                <div className="space-y-2">
                  {varians.map((v, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-6 gap-2 items-center">
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block uppercase">SKU Unik *</label>
                        <input
                          type="text"
                          required
                          placeholder="TSH-BLK-M"
                          value={v.sku}
                          onChange={e => updateVarian(i, 'sku', e.target.value)}
                          className="w-full p-1 bg-white border border-slate-300 rounded font-mono font-bold text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block uppercase">Nama Varian</label>
                        <input
                          type="text"
                          required
                          placeholder="Hitam - M"
                          value={v.nama_varian}
                          onChange={e => updateVarian(i, 'nama_varian', e.target.value)}
                          className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block uppercase">Harga Jual</label>
                        <input
                          type="number"
                          value={v.harga_jual_default}
                          onChange={e => updateVarian(i, 'harga_jual_default', Number(e.target.value))}
                          className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-[10px] text-slate-500 block uppercase">Stok Min</label>
                          <input
                            type="number"
                            value={v.stok_min}
                            onChange={e => updateVarian(i, 'stok_min', Number(e.target.value))}
                            className="w-12 p-1 bg-white border border-slate-300 rounded text-xs text-center"
                          />
                        </div>
                        {varians.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVarianRow(i)}
                            className="text-slate-400 hover:text-rose-600 mt-3 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
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
                  {submitting ? 'Menyimpan...' : 'Simpan Produk & SKU'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

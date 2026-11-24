import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatTanggalWaktu } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  Boxes,
  Search,
  BookOpen,
  CheckCircle,
  FileCheck,
  AlertTriangle,
  ClipboardList,
  Eye,
  Check
} from 'lucide-react';

export const Stok: React.FC = () => {
  const { token, hasRole, canViewProfit } = useAuth();
  const [activeTab, setActiveTab] = useState<'status' | 'kartu' | 'opname'>('status');
  const [stockStatus, setStockStatus] = useState<any[]>([]);
  const [filterBadge, setFilterBadge] = useState('');
  const [search, setSearch] = useState('');

  // Kartu Stok State
  const [selectedVarianId, setSelectedVarianId] = useState<number | null>(null);
  const [kartuData, setKartuData] = useState<any>(null);

  // Opname State
  const [opnameSessions, setOpnameSessions] = useState<any[]>([]);
  const [showNewOpnameModal, setShowNewOpnameModal] = useState(false);
  const [opnameItems, setOpnameItems] = useState<any[]>([]);
  const [opnameCatatan, setOpnameCatatan] = useState('');
  const [selectedOpname, setSelectedOpname] = useState<any>(null);
  const [showOpnameDetail, setShowOpnameDetail] = useState(false);
  const [approveAlasan, setApproveAlasan] = useState('');

  const loadStock = () => {
    let url = '/api/stok/status?';
    if (filterBadge) url += `status=${filterBadge}&`;
    if (search) url += `search=${search}&`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setStockStatus)
      .catch(console.error);

    fetch('/api/stok/opname', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setOpnameSessions)
      .catch(console.error);
  };

  useEffect(() => {
    loadStock();
  }, [token, filterBadge, search]);

  const viewKartuStok = (varianId: number) => {
    setSelectedVarianId(varianId);
    fetch(`/api/stok/kartu/${varianId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setKartuData(data);
        setActiveTab('kartu');
      })
      .catch(console.error);
  };

  // Open New Opname Modal
  const openNewOpname = () => {
    // Populate with current variants
    const items = stockStatus.map(s => ({
      varian_id: s.id,
      sku: s.sku,
      nama_produk: s.nama_produk,
      nama_varian: s.nama_varian,
      satuan: s.satuan,
      qty_sistem: s.stok_on_hand,
      qty_fisik: s.stok_on_hand // default to current system qty
    }));
    setOpnameItems(items);
    setShowNewOpnameModal(true);
  };

  const updateOpnameFisik = (varianId: number, val: number) => {
    setOpnameItems(opnameItems.map(it => it.varian_id === varianId ? { ...it, qty_fisik: Number(val) } : it));
  };

  const handleCreateOpname = async () => {
    try {
      const res = await fetch('/api/stok/opname', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          tanggal: new Date().toISOString().split('T')[0],
          catatan: opnameCatatan,
          items: opnameItems
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Draf stok opname berhasil disimpan.');
      setShowNewOpnameModal(false);
      loadStock();
      setActiveTab('opname');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const viewOpnameDetail = (id: number) => {
    fetch(`/api/stok/opname/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSelectedOpname(data);
        setShowOpnameDetail(true);
      })
      .catch(console.error);
  };

  const submitOpnameForApproval = async (id: number) => {
    try {
      const res = await fetch(`/api/stok/opname/${id}/ajukan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Sesi opname telah diajukan ke Owner untuk persetujuan.');
      loadStock();
      if (showOpnameDetail) setShowOpnameDetail(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const approveOpname = async (id: number) => {
    if (!approveAlasan.trim()) {
      alert('Alasan penyesuaian stok wajib diisi.');
      return;
    }

    try {
      const res = await fetch(`/api/stok/opname/${id}/setujui`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ alasan: approveAlasan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Sesi opname telah disetujui dan stok telah disesuaikan di kartu stok.');
      setShowOpnameDetail(false);
      setApproveAlasan('');
      loadStock();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Buku Stok & Stok Opname</h1>
          <p className="text-xs text-slate-500 mt-0.5">Buku besar stok pergerakan persediaan (append-only) dan rekonsiliasi opname fisik</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'status' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Status Persediaan
          </button>
          <button
            onClick={() => setActiveTab('opname')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              activeTab === 'opname' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Stok Opname</span>
            {opnameSessions.filter(s => s.status === 'Diajukan').length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {opnameSessions.filter(s => s.status === 'Diajukan').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: STATUS PERSEDIAAN */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Filter Status:</span>
              {['', 'AMAN', 'RESTOCK', 'HABIS'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterBadge(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    filterBadge === st
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st || 'Semua'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Cari SKU atau Nama..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
              <button
                onClick={openNewOpname}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Mulai Sesi Opname</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Nama Produk & Varian</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4 text-right">Stok Fisik (On Hand)</th>
                    <th className="py-3 px-4 text-right">Dipesan (Reserved)</th>
                    <th className="py-3 px-4 text-right font-bold text-indigo-700">Tersedia</th>
                    {canViewProfit && <th className="py-3 px-4 text-right">HPP Rata-Rata</th>}
                    {canViewProfit && <th className="py-3 px-4 text-right">Nilai Persediaan</th>}
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Kartu Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockStatus.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{s.sku}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {s.nama_produk} <span className="text-slate-500 font-normal">({s.nama_varian})</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{s.kategori}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800">{s.stok_on_hand} {s.satuan}</td>
                      <td className="py-3 px-4 text-right text-amber-600 font-medium">{s.stok_reserved}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-indigo-700">{s.stok_tersedia}</td>
                      {canViewProfit && (
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{formatRupiah(s.hpp_rata_rata)}</td>
                      )}
                      {canViewProfit && (
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatRupiah(s.nilai_persediaan)}</td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <Badge status={s.status_stok} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => viewKartuStok(s.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600"
                          title="Buka Kartu Stok"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KARTU STOK PER SKU */}
      {activeTab === 'kartu' && kartuData && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-indigo-600 font-semibold uppercase">BUKU BESAR STOK</span>
              <h2 className="text-base font-bold text-slate-900">
                {kartuData.varian.nama_produk} ({kartuData.varian.nama_varian}) — <span className="font-mono">{kartuData.varian.sku}</span>
              </h2>
              <div className="text-xs text-slate-500 mt-1 flex gap-4">
                <span>Stok Saat Ini: <strong className="text-slate-800">{kartuData.varian.stok_on_hand} {kartuData.varian.satuan}</strong></span>
                {canViewProfit && (
                  <span>HPP Rata-Rata Berjalan: <strong className="text-indigo-600">{formatRupiah(kartuData.varian.hpp_rata_rata)}</strong></span>
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveTab('status')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
            >
              ← Kembali ke Status Stok
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Tipe Mutasi</th>
                    <th className="py-3 px-4">No. Dokumen / Referensi</th>
                    <th className="py-3 px-4 text-right">Masuk</th>
                    <th className="py-3 px-4 text-right">Keluar</th>
                    {canViewProfit && <th className="py-3 px-4 text-right">HPP Unit</th>}
                    <th className="py-3 px-4 text-right font-bold text-slate-900">Saldo Stok</th>
                    {canViewProfit && <th className="py-3 px-4 text-right">Nilai Akhir</th>}
                    <th className="py-3 px-4">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kartuData.mutasi.length === 0 ? (
                    <tr>
                      <td colSpan={canViewProfit ? 9 : 7} className="py-12 text-center text-slate-400">
                        Belum ada riwayat mutasi stok untuk SKU ini.
                      </td>
                    </tr>
                  ) : (
                    kartuData.mutasi.map((m: any) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{formatTanggalWaktu(m.waktu)}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.qty_masuk > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {m.tipe}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-800">{m.ref_dokumen}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">{m.qty_masuk > 0 ? `+${m.qty_masuk}` : '-'}</td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600">{m.qty_keluar > 0 ? `-${m.qty_keluar}` : '-'}</td>
                        {canViewProfit && (
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{formatRupiah(m.hpp_unit)}</td>
                        )}
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900">{m.saldo_stok_akhir}</td>
                        {canViewProfit && (
                          <td className="py-3 px-4 text-right font-bold text-indigo-700">{formatRupiah(m.nilai_persediaan_akhir)}</td>
                        )}
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{m.keterangan}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STOK OPNAME SESSIONS */}
      {activeTab === 'opname' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">Daftar Sesi Rekonsiliasi Stok Opname</span>
            <button
              onClick={openNewOpname}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              + Buat Sesi Opname Baru
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">No. Sesi</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Diajukan Oleh</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Disetujui Oleh</th>
                  <th className="py-3 px-4">Catatan</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opnameSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Belum ada sesi stok opname.
                    </td>
                  </tr>
                ) : (
                  opnameSessions.map(os => (
                    <tr key={os.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{os.no_sesi}</td>
                      <td className="py-3 px-4 text-slate-600">{os.tanggal}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{os.diajukan_oleh || '-'}</td>
                      <td className="py-3 px-4">
                        <Badge status={os.status} />
                      </td>
                      <td className="py-3 px-4 text-slate-600">{os.disetujui_oleh || '-'}</td>
                      <td className="py-3 px-4 text-slate-500">{os.catatan || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => viewOpnameDetail(os.id)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                        >
                          Buka Sesi
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

      {/* New Opname Modal */}
      {showNewOpnameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-mono">STOK OPNAME FISIK</span>
                <h3 className="font-bold text-sm">Hitung Stok Fisik Gudang / Toko</h3>
              </div>
              <button onClick={() => setShowNewOpnameModal(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Catatan Opname (Opsional):</label>
                <input
                  type="text"
                  placeholder="Contoh: Opname rutin akhir bulan Mei 2026..."
                  value={opnameCatatan}
                  onChange={e => setOpnameCatatan(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">SKU & Varian</th>
                      <th className="py-2.5 px-3 text-right">Stok Sistem</th>
                      <th className="py-2.5 px-3 text-right w-28">Stok Fisik (Hitung)</th>
                      <th className="py-2.5 px-3 text-right">Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {opnameItems.map(it => {
                      const selisih = it.qty_fisik - it.qty_sistem;
                      return (
                        <tr key={it.varian_id} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <span className="font-mono text-indigo-600 font-semibold">{it.sku}</span>
                            <div className="text-slate-800 font-medium">{it.nama_produk} ({it.nama_varian})</div>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-700">{it.qty_sistem}</td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={it.qty_fisik}
                              onChange={e => updateOpnameFisik(it.varian_id, Number(e.target.value))}
                              className="w-20 p-1 bg-white border border-slate-300 rounded text-center font-bold text-xs"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-bold">
                            <span className={selisih === 0 ? 'text-slate-500' : selisih > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {selisih > 0 ? `+${selisih}` : selisih}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewOpnameModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateOpname}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
                >
                  Simpan Draf Opname
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Opname Detail & Approval Modal */}
      {showOpnameDetail && selectedOpname && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-mono">SESI OPNAME</span>
                <h3 className="font-bold text-sm">{selectedOpname.no_sesi}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={selectedOpname.status} />
                <button onClick={() => setShowOpnameDetail(false)} className="text-slate-400 hover:text-white text-lg px-2">✕</button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Tanggal</span>
                  <span className="font-semibold text-slate-900">{selectedOpname.tanggal}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Diajukan Oleh</span>
                  <span className="font-semibold text-slate-900">{selectedOpname.diajukan_oleh || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Disetujui Oleh</span>
                  <span className="font-semibold text-slate-900">{selectedOpname.disetujui_oleh || '-'}</span>
                </div>
              </div>

              {selectedOpname.alasan_penyesuaian && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900">
                  <span className="font-bold block">Alasan Penyesuaian Owner:</span>
                  <span>{selectedOpname.alasan_penyesuaian}</span>
                </div>
              )}

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="py-2 px-3">SKU & Varian</th>
                      <th className="py-2 px-3 text-right">Stok Sistem</th>
                      <th className="py-2 px-3 text-right">Stok Fisik</th>
                      <th className="py-2 px-3 text-right">Selisih Qty</th>
                      {canViewProfit && <th className="py-2 px-3 text-right">HPP Unit</th>}
                      {canViewProfit && <th className="py-2 px-3 text-right">Selisih Nilai (Rp)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedOpname.details?.map((d: any) => (
                      <tr key={d.id}>
                        <td className="py-2 px-3">
                          <span className="font-mono text-indigo-600 font-semibold">{d.sku}</span>
                          <div className="text-slate-800 font-medium">{d.nama_produk} ({d.nama_varian})</div>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">{d.qty_sistem}</td>
                        <td className="py-2 px-3 text-right font-semibold">{d.qty_fisik}</td>
                        <td className="py-2 px-3 text-right font-bold">
                          <span className={d.selisih_qty === 0 ? 'text-slate-400' : d.selisih_qty > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {d.selisih_qty > 0 ? `+${d.selisih_qty}` : d.selisih_qty}
                          </span>
                        </td>
                        {canViewProfit && <td className="py-2 px-3 text-right font-mono text-slate-600">{formatRupiah(d.hpp_unit)}</td>}
                        {canViewProfit && (
                          <td className="py-2 px-3 text-right font-bold">
                            <span className={d.selisih_nilai === 0 ? 'text-slate-400' : d.selisih_nilai > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {formatRupiah(d.selisih_nilai)}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              {selectedOpname.status === 'Draft' && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => submitOpnameForApproval(selectedOpname.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
                  >
                    Ajukan ke Owner untuk Persetujuan
                  </button>
                </div>
              )}

              {selectedOpname.status === 'Diajukan' && hasRole('Owner') && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                  <span className="font-bold text-amber-900 block">Persetujuan Penyesuaian Stok (Owner):</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan alasan penyesuaian (Contoh: Selisih opname fisik disetujui)..."
                    value={approveAlasan}
                    onChange={e => setApproveAlasan(e.target.value)}
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => approveOpname(selectedOpname.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md shadow-emerald-600/30"
                    >
                      Setujui & Perbarui Stok Fisik
                    </button>
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

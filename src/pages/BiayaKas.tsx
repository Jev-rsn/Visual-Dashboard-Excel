import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../utils/format';
import { Badge } from '../components/Badge';
import { Wallet, ArrowRightLeft, Plus, DollarSign, ArrowUpRight } from 'lucide-react';

export const BiayaKas: React.FC = () => {
  const { token, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'biaya' | 'mutasi'>('biaya');
  const [biayaList, setBiayaList] = useState<any[]>([]);
  const [mutasiList, setMutasiList] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [akunKasList, setAkunKasList] = useState<any[]>([]);

  // Expense modal
  const [showBiayaModal, setShowBiayaModal] = useState(false);
  const [noBukti, setNoBukti] = useState(`BIAYA-${Date.now().toString(36).toUpperCase()}`);
  const [tanggalBiaya, setTanggalBiaya] = useState(new Date().toISOString().split('T')[0]);
  const [kategoriId, setKategoriId] = useState<number | ''>('');
  const [channelId, setChannelId] = useState<string>(''); // '' = Umum
  const [nominalBiaya, setNominalBiaya] = useState<number>(0);
  const [akunKasBiayaId, setAkunKasBiayaId] = useState<number>(1);
  const [keteranganBiaya, setKeteranganBiaya] = useState('');

  // Mutation modal
  const [showMutasiModal, setShowMutasiModal] = useState(false);
  const [noRef, setNoRef] = useState(`MUT-${Date.now().toString(36).toUpperCase()}`);
  const [tanggalMutasi, setTanggalMutasi] = useState(new Date().toISOString().split('T')[0]);
  const [akunAsalId, setAkunAsalId] = useState<number>(3); // Shopee
  const [akunTujuanId, setAkunTujuanId] = useState<number>(2); // Bank BCA
  const [nominalMutasi, setNominalMutasi] = useState<number>(0);
  const [keteranganMutasi, setKeteranganMutasi] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    fetch('/api/operasional/biaya', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setBiayaList)
      .catch(console.error);

    fetch('/api/operasional/mutasi-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setMutasiList)
      .catch(console.error);

    fetch('/api/master/kategori-biaya', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCategories)
      .catch(console.error);

    fetch('/api/master/channel', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setChannels)
      .catch(console.error);

    fetch('/api/master/akun-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setAkunKasList)
      .catch(console.error);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Submit Expense
  const handleSubmitBiaya = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kategoriId || nominalBiaya <= 0) {
      alert('Pilih kategori dan isi nominal biaya lebih dari 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/operasional/biaya', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          no_bukti: noBukti,
          tanggal: tanggalBiaya,
          kategori_id: Number(kategoriId),
          channel_id: channelId ? Number(channelId) : null,
          nominal: nominalBiaya,
          akun_kas_id: akunKasBiayaId,
          keterangan: keteranganBiaya
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Biaya operasional berhasil dicatat.');
      setShowBiayaModal(false);
      setNoBukti(`BIAYA-${Date.now().toString(36).toUpperCase()}`);
      setNominalBiaya(0);
      setKeteranganBiaya('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Mutation
  const handleSubmitMutasi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (akunAsalId === akunTujuanId) {
      alert('Akun asal dan akun tujuan tidak boleh sama.');
      return;
    }
    if (nominalMutasi <= 0) {
      alert('Nominal mutasi harus lebih dari 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/operasional/mutasi-kas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          no_referensi: noRef,
          tanggal: tanggalMutasi,
          akun_asal_id: akunAsalId,
          akun_tujuan_id: akunTujuanId,
          nominal: nominalMutasi,
          keterangan: keteranganMutasi
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Mutasi kas berhasil diproses.');
      setShowMutasiModal(false);
      setNoRef(`MUT-${Date.now().toString(36).toUpperCase()}`);
      setNominalMutasi(0);
      setKeteranganMutasi('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Biaya Operasional & Mutasi Kas</h1>
          <p className="text-xs text-slate-500 mt-0.5">Catat beban operasional per channel dan mutasi pemindahan dana kas antar akun</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('biaya')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'biaya' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Biaya Operasional
          </button>
          <button
            onClick={() => setActiveTab('mutasi')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'mutasi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mutasi Kas Antar Akun
          </button>
        </div>
      </div>

      {/* Account Balances Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {akunKasList.map(a => (
          <div key={a.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block truncate">{a.tipe_akun}</span>
            <div className="text-xs font-bold text-slate-800 truncate mt-0.5">{a.nama}</div>
            <div className="text-sm font-extrabold text-indigo-600 mt-1">{formatRupiah(a.saldo_saat_ini)}</div>
          </div>
        ))}
      </div>

      {/* TAB 1: BIAYA OPERASIONAL */}
      {activeTab === 'biaya' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">Daftar Pengeluaran & Biaya Operasional</span>
            <button
              onClick={() => setShowBiayaModal(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Input Biaya Baru</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">No. Bukti</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kategori Biaya</th>
                  <th className="py-3 px-4">Kelompok Laporan</th>
                  <th className="py-3 px-4">Alokasi Channel</th>
                  <th className="py-3 px-4">Akun Kas</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {biayaList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Belum ada biaya operasional yang dicatat.
                    </td>
                  </tr>
                ) : (
                  biayaList.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.no_bukti}</td>
                      <td className="py-3 px-4 text-slate-600">{b.tanggal}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{b.nama_kategori}</td>
                      <td className="py-3 px-4 text-slate-500">{b.kelompok_laporan}</td>
                      <td className="py-3 px-4">
                        {b.channel_id ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[11px]">
                            {b.nama_channel}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
                            Umum (Non-Channel)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{b.nama_akun_kas}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">-{formatRupiah(b.nominal)}</td>
                      <td className="py-3 px-4 text-slate-500">{b.keterangan || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MUTASI KAS */}
      {activeTab === 'mutasi' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <div>
              <span className="font-bold text-slate-800">Riwayat Mutasi Antar Akun Kas</span>
              <p className="text-[11px] text-slate-500">Mutasi kas bersifat netral terhadap laba rugi dan omzet (BR-06)</p>
            </div>
            <button
              onClick={() => setShowMutasiModal(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Proses Mutasi Kas</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">No. Referensi</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Akun Asal</th>
                  <th className="py-3 px-4">Akun Tujuan</th>
                  <th className="py-3 px-4 text-right">Nominal Pindah</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mutasiList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Belum ada transaksi mutasi kas antar akun.
                    </td>
                  </tr>
                ) : (
                  mutasiList.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{m.no_referensi}</td>
                      <td className="py-3 px-4 text-slate-600">{m.tanggal}</td>
                      <td className="py-3 px-4 font-semibold text-rose-600">{m.nama_akun_asal}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-600">{m.nama_akun_tujuan}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">{formatRupiah(m.nominal)}</td>
                      <td className="py-3 px-4 text-slate-500">{m.keterangan || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge status={m.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showBiayaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">Catat Biaya Operasional</h3>
              <button onClick={() => setShowBiayaModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSubmitBiaya} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">No. Bukti Transaksi:</label>
                <input
                  type="text"
                  required
                  value={noBukti}
                  onChange={e => setNoBukti(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Kategori Biaya (COA) *:</label>
                <select
                  required
                  value={kategoriId}
                  onChange={e => setKategoriId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">Pilih Kategori Biaya...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>[{c.kode_akun}] {c.nama} ({c.kelompok_laporan})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Alokasi Channel:</label>
                <select
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">Umum (Beban Kantor/Operasional Bersama)</option>
                  {channels.map(ch => (
                    <option key={ch.id} value={ch.id}>Channel: {ch.nama}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nominal Biaya (Rp) *:</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={nominalBiaya || ''}
                  onChange={e => setNominalBiaya(Number(e.target.value))}
                  placeholder="Rp 0"
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-sm"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Akun Kas Pengeluaran *:</label>
                <select
                  value={akunKasBiayaId}
                  onChange={e => setAkunKasBiayaId(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  {akunKasList.map(a => (
                    <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Keterangan Pengeluaran:</label>
                <input
                  type="text"
                  placeholder="Contoh: Pembelian lakban 10 roll..."
                  value={keteranganBiaya}
                  onChange={e => setKeteranganBiaya(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBiayaModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Biaya'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Mutation Modal */}
      {showMutasiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">Transfer / Mutasi Kas Antar Akun</h3>
              <button onClick={() => setShowMutasiModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleSubmitMutasi} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">No. Referensi Mutasi:</label>
                <input
                  type="text"
                  required
                  value={noRef}
                  onChange={e => setNoRef(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Dari Akun Asal (Sumber Dana) *:</label>
                <select
                  value={akunAsalId}
                  onChange={e => setAkunAsalId(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                >
                  {akunKasList.map(a => (
                    <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Ke Akun Tujuan (Penerima Dana) *:</label>
                <select
                  value={akunTujuanId}
                  onChange={e => setAkunTujuanId(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                >
                  {akunKasList.map(a => (
                    <option key={a.id} value={a.id}>{a.nama} ({formatRupiah(a.saldo_saat_ini)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nominal Transfer (Rp) *:</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={nominalMutasi || ''}
                  onChange={e => setNominalMutasi(Number(e.target.value))}
                  placeholder="Rp 0"
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-sm"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Keterangan Transfer:</label>
                <input
                  type="text"
                  placeholder="Contoh: Tarik saldo Shopee ke Rekening BCA..."
                  value={keteranganMutasi}
                  onChange={e => setKeteranganMutasi(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMutasiModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-600/30"
                >
                  {submitting ? 'Memproses...' : 'Proses Transfer Dana'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

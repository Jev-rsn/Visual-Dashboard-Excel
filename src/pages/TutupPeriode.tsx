import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatTanggalWaktu } from '../utils/format';
import { Badge } from '../components/Badge';
import { CalendarCheck, Lock, Unlock, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

export const TutupPeriode: React.FC = () => {
  const { token, hasRole } = useAuth();
  const [periods, setPeriods] = useState<any[]>([]);
  const [bulanTutup, setBulanTutup] = useState<number>(new Date().getMonth() + 1);
  const [tahunTutup, setTahunTutup] = useState<number>(new Date().getFullYear());
  const [submitting, setSubmitting] = useState(false);

  // Reopen Modal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenBulan, setReopenBulan] = useState<number | null>(null);
  const [reopenTahun, setReopenTahun] = useState<number | null>(null);
  const [reopenAlasan, setReopenAlasan] = useState('');

  const loadPeriods = () => {
    fetch('/api/periode', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPeriods)
      .catch(console.error);
  };

  useEffect(() => {
    loadPeriods();
  }, [token]);

  const handleClosePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Tutup periode akuntansi bulan ${bulanTutup}/${tahunTutup}? Transaksi pada periode ini akan dibekukan.`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/periode/tutup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bulan: bulanTutup, tahun: tahunTutup })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message || 'Periode akuntansi berhasil ditutup.');
      loadPeriods();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenPeriod = async () => {
    if (!reopenAlasan.trim() || !reopenBulan || !reopenTahun) {
      alert('Alasan pembukaan kembali periode wajib diisi.');
      return;
    }

    try {
      const res = await fetch('/api/periode/buka', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bulan: reopenBulan,
          tahun: reopenTahun,
          alasan: reopenAlasan
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message || 'Periode berhasil dibuka kembali.');
      setShowReopenModal(false);
      setReopenAlasan('');
      loadPeriods();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const monthNames = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Tutup Periode Akuntansi</h1>
          <p className="text-xs text-slate-500 mt-0.5">Kunci buku bulanan, rekam snapshot valuasi & saldo kas, dan cegah modifikasi retroaktif</p>
        </div>
      </div>

      {/* Form Close Period */}
      {hasRole('Owner') ? (
        <form onSubmit={handleClosePeriod} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
            <Lock className="w-5 h-5" />
            <span>Tutup Buku Bulanan Baru</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Bulan Buku:</label>
              <select
                value={bulanTutup}
                onChange={e => setBulanTutup(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
              >
                {monthNames.slice(1).map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tahun Buku:</label>
              <input
                type="number"
                value={tahunTutup}
                onChange={e => setTahunTutup(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-bold">Konsekuensi Penguncian Periode:</span>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Setelah ditutup, sistem memblokir pembuatan, perubahan, dan void seluruh transaksi bertanggal pada periode ini (BR-09). Saldo kas dan nilai persediaan akan direkam sebagai saldo awal periode berikutnya.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/30 transition disabled:opacity-50 flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{submitting ? 'Memproses...' : 'Tutup Periode & Simpan Snapshot'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 p-4 rounded-xl text-xs text-amber-900">
          Hanya peran Owner yang memiliki wewenang untuk menutup atau membuka kembali periode akuntansi.
        </div>
      )}

      {/* History of Periods */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
          Riwayat Penguncian Periode Akuntansi
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Periode</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Ditutup Pada</th>
                <th className="py-3 px-4">Ditutup Oleh</th>
                <th className="py-3 px-4 text-right">Item Snapshot</th>
                <th className="py-3 px-4 text-center">Aksi (Owner)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Belum ada periode akuntansi yang ditutup.
                  </td>
                </tr>
              ) : (
                periods.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {monthNames[p.bulan]} {p.tahun}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={p.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {p.ditutup_pada ? formatTanggalWaktu(p.ditutup_pada) : '-'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{p.ditutup_oleh || '-'}</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-700">
                      {p.snapshots?.length || 0} entitas
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.status === 'Tutup' && hasRole('Owner') && (
                        <button
                          onClick={() => {
                            setReopenBulan(p.bulan);
                            setReopenTahun(p.tahun);
                            setShowReopenModal(true);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] flex items-center gap-1 mx-auto"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Buka Kembali</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-xs space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Buka Kembali Periode Tertutup</h3>
                <p className="text-[11px] text-slate-500">
                  Pembukaan kembali akan tercatat permanen di audit log.
                </p>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Alasan Pembukaan Kembali (Wajib Diisi):
              </label>
              <textarea
                rows={3}
                required
                value={reopenAlasan}
                onChange={e => setReopenAlasan(e.target.value)}
                placeholder="Contoh: Koreksi transaksi yang terlewat setelah konfirmasi akuntan..."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReopenModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleReopenPeriod}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-md shadow-amber-600/30"
              >
                Buka Kembali Periode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

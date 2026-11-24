import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatTanggalWaktu, formatRupiah } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  Settings,
  Users,
  Shield,
  FileText,
  Sliders,
  Plus,
  Save,
  CheckCircle,
  Clock,
  Layers
} from 'lucide-react';

export const Pengaturan: React.FC = () => {
  const { token, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'channel' | 'kas' | 'supplier' | 'settings' | 'audit'>('users');

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('password123');
  const [newUserRole, setNewUserRole] = useState('Kasir & Admin Online');

  // System Settings State
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [allowMinusStock, setAllowMinusStock] = useState(false);
  const [namaToko, setNamaToko] = useState('');
  const [teleponToko, setTeleponToko] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Other masters
  const [channels, setChannels] = useState<any[]>([]);
  const [akunKasList, setAkunKasList] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const loadData = () => {
    if (hasRole('Owner')) {
      fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(setUsers)
        .catch(console.error);

      fetch('/api/auth/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(setAuditLogs)
        .catch(console.error);
    }

    fetch('/api/master/pengaturan', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setAllowMinusStock(data.izinkan_stok_minus === 'true');
        setNamaToko(data.nama_toko || 'MCRW Reseller Store');
        setTeleponToko(data.telepon_toko || '');
      })
      .catch(console.error);

    fetch('/api/master/channel', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setChannels)
      .catch(console.error);

    fetch('/api/master/akun-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setAkunKasList)
      .catch(console.error);

    fetch('/api/master/supplier', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setSuppliers)
      .catch(console.error);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nama: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          peran: newUserRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Pengguna baru berhasil ditambahkan.');
      setNewUserName('');
      setNewUserEmail('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/master/pengaturan', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          izinkan_stok_minus: String(allowMinusStock),
          nama_toko: namaToko,
          telepon_toko: teleponToko
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert('Pengaturan sistem berhasil disimpan.');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Pengaturan & Audit Log</h1>
          <p className="text-xs text-slate-500 mt-0.5">Kelola pengguna RBAC, pengaturan toko, kebijakan minus stok, dan riwayat audit</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-semibold">
        {hasRole('Owner') && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-2 rounded-xl transition ${activeTab === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            👥 Manajemen Pengguna (RBAC)
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-2 rounded-xl transition ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          ⚙️ Pengaturan Toko & Stok
        </button>
        <button
          onClick={() => setActiveTab('channel')}
          className={`px-3 py-2 rounded-xl transition ${activeTab === 'channel' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          🛍️ Channel Penjualan
        </button>
        <button
          onClick={() => setActiveTab('kas')}
          className={`px-3 py-2 rounded-xl transition ${activeTab === 'kas' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          💳 Akun Kas & Bank
        </button>
        {hasRole('Owner', 'Admin Keuangan') && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-2 rounded-xl transition ${activeTab === 'audit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            📋 Audit Log Permanen
          </button>
        )}
      </div>

      {/* TAB 1: USERS & RBAC */}
      {activeTab === 'users' && hasRole('Owner') && (
        <div className="space-y-6">
          {/* Create User Card */}
          <form onSubmit={handleCreateUser} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-800">Tambah Pengguna Baru</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama Karyawan"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Email Login *</label>
                <input
                  type="email"
                  required
                  placeholder="user@mcrw.com"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Kata Sandi</label>
                <input
                  type="text"
                  required
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Peran Akses (RBAC) *</label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-xs"
                >
                  <option value="Kasir & Admin Online">Kasir & Admin Online</option>
                  <option value="Admin Purchasing & Gudang">Admin Purchasing & Gudang</option>
                  <option value="Admin Keuangan">Admin Keuangan</option>
                  <option value="Owner">Owner / Manajer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm"
              >
                + Simpan Pengguna
              </button>
            </div>
          </form>

          {/* User List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
              Daftar Pengguna & Hak Akses
            </div>
            <table className="w-full text-left">
              <thead className="bg-white border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Nama</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Peran Akses</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Terdaftar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.nama}</td>
                    <td className="py-3 px-4 text-slate-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-[11px]">
                        {u.peran}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {u.aktif === 1 ? (
                        <span className="text-emerald-600 font-semibold">Aktif</span>
                      ) : (
                        <span className="text-slate-400">Nonaktif</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {formatTanggalWaktu(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 text-xs max-w-2xl">
          <h3 className="font-bold text-sm text-slate-800 border-b pb-2">Kebijakan Persediaan & Identitas Toko</h3>

          <div className="space-y-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nama Toko:</label>
              <input
                type="text"
                value={namaToko}
                onChange={e => setNamaToko(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nomor Telepon / WhatsApp:</label>
              <input
                type="text"
                value={teleponToko}
                onChange={e => setTeleponToko(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {/* Negative stock setting */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={allowMinusStock}
                  onChange={e => setAllowMinusStock(e.target.checked)}
                  className="rounded text-indigo-600 w-4 h-4"
                />
                <span>Izinkan Penjualan Stok Minus (Stok Negatif)</span>
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Secara bawaan <strong>dinonaktifkan</strong> sesuai PRD untuk mencegah overselling lintas channel. Jika dinonaktifkan, transaksi POS atau pesanan online yang melebihi kuantitas tersedia akan ditolak seketika oleh sistem.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <button
              onClick={handleSaveSettings}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: CHANNELS */}
      {activeTab === 'channel' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
            Daftar Channel Penjualan & Aturan Komisi
          </div>
          <table className="w-full text-left">
            <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Nama Channel</th>
                <th className="py-3 px-4">Tipe</th>
                <th className="py-3 px-4 text-right">Komisi Persen (%)</th>
                <th className="py-3 px-4 text-right">Biaya Tetap (Rp)</th>
                <th className="py-3 px-4">Akun Kas Rekonsiliasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channels.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{c.nama}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                      {c.tipe}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">{c.komisi_persen}%</td>
                  <td className="py-3 px-4 text-right">{formatRupiah(c.komisi_tetap)}</td>
                  <td className="py-3 px-4 font-medium text-slate-700">{c.nama_akun_kas || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: CASH ACCOUNTS */}
      {activeTab === 'kas' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-800">
            Daftar Akun Kas, Rekening Bank & Saldo Marketplace
          </div>
          <table className="w-full text-left">
            <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Nama Akun</th>
                <th className="py-3 px-4">Tipe Akun</th>
                <th className="py-3 px-4 text-right">Saldo Awal Bertanggal</th>
                <th className="py-3 px-4 text-right font-extrabold text-indigo-700">Saldo Saat Ini</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {akunKasList.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{a.nama}</td>
                  <td className="py-3 px-4 text-slate-500">{a.tipe_akun}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatRupiah(a.saldo_awal)} ({a.tanggal_saldo_awal})</td>
                  <td className="py-3 px-4 text-right font-extrabold text-indigo-700 text-sm">{formatRupiah(a.saldo_saat_ini)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center font-bold text-slate-800">
            <span>Buku Audit Log Permanen (Immutable)</span>
            <span className="text-[11px] text-slate-500">100% aksi tulis terekam</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-white border-b border-slate-100 text-slate-500 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Waktu</th>
                  <th className="py-2.5 px-4">Pengguna</th>
                  <th className="py-2.5 px-4">Peran</th>
                  <th className="py-2.5 px-4">Aksi</th>
                  <th className="py-2.5 px-4">Entitas & ID</th>
                  <th className="py-2.5 px-4">Rincian Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatTanggalWaktu(l.waktu)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{l.nama_pengguna}</td>
                    <td className="py-2.5 px-4 text-slate-500">{l.peran}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                        {l.aksi}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-indigo-600 font-semibold">
                      {l.entitas} {l.entitas_id ? `(${l.entitas_id})` : ''}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[10px] max-w-xs truncate">
                      {l.nilai_sesudah || l.nilai_sebelum || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

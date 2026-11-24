import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, Store, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@mcrw.com');
  const [password, setPassword] = useState('password123');
  const [isPosMode, setIsPosMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.peran === 'Kasir & Admin Online') {
        navigate('/pos', { replace: true });
      } else if (user.peran === 'Admin Purchasing & Gudang') {
        navigate('/pembelian', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    const success = await login(email, password, isPosMode);
    setSubmitting(false);
    if (success) {
      // Navigation is triggered by useEffect on user state change,
      // but we can also navigate immediately as fallback:
      navigate('/', { replace: true });
    } else {
      setErrorMessage('Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    }
  };

  const handleQuickSelect = async (accEmail: string) => {
    setEmail(accEmail);
    setPassword('password123');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
          <Store className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          MCRW Web v2.0
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Sistem Manajemen Multi-Channel Reseller & Keuangan
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 py-8 px-6 shadow-xl rounded-2xl sm:px-10">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Email Pengguna
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1 block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={isPosMode}
                  onChange={e => setIsPosMode(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Masuk dalam Mode Kasir POS (Sesi Panjang)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
            >
              <span>{submitting ? 'Memproses...' : 'Masuk ke Sistem'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-5 border-t border-slate-700/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2.5">
              Pilih Akun Demo (Uji RBAC Sesuai PRD):
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickSelect('owner@mcrw.com')}
                className={`p-2 rounded-lg border text-left transition ${
                  email === 'owner@mcrw.com' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Owner</div>
                <div className="text-[10px] text-slate-400 truncate">owner@mcrw.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('kasir@mcrw.com')}
                className={`p-2 rounded-lg border text-left transition ${
                  email === 'kasir@mcrw.com' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Kasir Online</div>
                <div className="text-[10px] text-slate-400 truncate">kasir@mcrw.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('gudang@mcrw.com')}
                className={`p-2 rounded-lg border text-left transition ${
                  email === 'gudang@mcrw.com' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Gudang</div>
                <div className="text-[10px] text-slate-400 truncate">gudang@mcrw.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('keuangan@mcrw.com')}
                className={`p-2 rounded-lg border text-left transition ${
                  email === 'keuangan@mcrw.com' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="font-semibold text-white">Keuangan</div>
                <div className="text-[10px] text-slate-400 truncate">keuangan@mcrw.com</div>
              </button>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 text-center">
              Password default: <span className="font-mono text-slate-400">password123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  Package,
  Boxes,
  Truck,
  RotateCcw,
  Wallet,
  BarChart3,
  CalendarCheck,
  UploadCloud,
  Settings,
  LogOut,
  UserCheck,
  Menu,
  X
} from 'lucide-react';
import { useAuth, User } from '../context/AuthContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, switchRole, hasRole } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Owner', 'Admin Keuangan'] },
    { label: 'POS Kasir', path: '/pos', icon: ShoppingCart, roles: ['Owner', 'Kasir & Admin Online'] },
    { label: 'Penjualan & Online', path: '/penjualan', icon: ShoppingBag, roles: ['Owner', 'Kasir & Admin Online', 'Admin Keuangan'] },
    { label: 'Pembelian & Utang', path: '/pembelian', icon: Truck, roles: ['Owner', 'Admin Purchasing & Gudang', 'Admin Keuangan'] },
    { label: 'Katalog Produk', path: '/produk', icon: Package, roles: ['Owner', 'Admin Purchasing & Gudang', 'Kasir & Admin Online'] },
    { label: 'Buku Stok & Opname', path: '/stok', icon: Boxes, roles: ['Owner', 'Admin Purchasing & Gudang'] },
    { label: 'Retur Penjualan', path: '/retur', icon: RotateCcw, roles: ['Owner', 'Kasir & Admin Online'] },
    { label: 'Biaya & Mutasi Kas', path: '/biaya-kas', icon: Wallet, roles: ['Owner', 'Admin Keuangan'] },
    { label: 'Laporan Keuangan', path: '/laporan', icon: BarChart3, roles: ['Owner', 'Admin Keuangan'] },
    { label: 'Tutup Periode', path: '/tutup-periode', icon: CalendarCheck, roles: ['Owner'] },
    { label: 'Impor Marketplace', path: '/import-marketplace', icon: UploadCloud, roles: ['Owner', 'Kasir & Admin Online', 'Admin Purchasing & Gudang'] },
    { label: 'Pengaturan & Audit', path: '/pengaturan', icon: Settings, roles: ['Owner', 'Admin Keuangan'] },
  ];

  const visibleNav = navItems.filter(item => hasRole(...item.roles));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Multi-Channel</span>
            <h1 className="text-xl font-bold text-white tracking-tight">MCRW Web <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono">v2.0</span></h1>
          </div>
        </div>

        {/* User Info Bar */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
              {user?.nama.substring(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate">{user?.nama}</div>
              <div className="text-[10px] text-indigo-400 font-medium truncate">{user?.peran}</div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Quick Role Switcher for Testing */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/30">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-indigo-400" />
            <span>Ganti Peran Cepat (Test RBAC)</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <button
              onClick={() => switchRole('Owner')}
              className={`px-2 py-1 rounded text-left truncate transition ${user?.peran === 'Owner' ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              👑 Owner
            </button>
            <button
              onClick={() => switchRole('Admin Purchasing & Gudang')}
              className={`px-2 py-1 rounded text-left truncate transition ${user?.peran === 'Admin Purchasing & Gudang' ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              📦 Gudang
            </button>
            <button
              onClick={() => switchRole('Kasir & Admin Online')}
              className={`px-2 py-1 rounded text-left truncate transition ${user?.peran === 'Kasir & Admin Online' ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              💳 Kasir
            </button>
            <button
              onClick={() => switchRole('Admin Keuangan')}
              className={`px-2 py-1 rounded text-left truncate transition ${user?.peran === 'Admin Keuangan' ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              💰 Keuangan
            </button>
          </div>
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-sm font-medium transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
        <div>
          <h1 className="text-lg font-bold">MCRW Web v2.0</h1>
          <span className="text-[10px] text-indigo-400">{user?.peran}</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 space-y-1">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 text-rose-400 hover:bg-slate-800 rounded-lg text-sm font-medium mt-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

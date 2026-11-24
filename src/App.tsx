import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Penjualan } from './pages/Penjualan';
import { Pembelian } from './pages/Pembelian';
import { Produk } from './pages/Produk';
import { Stok } from './pages/Stok';
import { Retur } from './pages/Retur';
import { BiayaKas } from './pages/BiayaKas';
import { Laporan } from './pages/Laporan';
import { TutupPeriode } from './pages/TutupPeriode';
import { ImportMarketplace } from './pages/ImportMarketplace';
import { Pengaturan } from './pages/Pengaturan';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-xs">
        Memuat aplikasi MCRW Web...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/penjualan" element={<ProtectedRoute><Penjualan /></ProtectedRoute>} />
          <Route path="/pembelian" element={<ProtectedRoute><Pembelian /></ProtectedRoute>} />
          <Route path="/produk" element={<ProtectedRoute><Produk /></ProtectedRoute>} />
          <Route path="/stok" element={<ProtectedRoute><Stok /></ProtectedRoute>} />
          <Route path="/retur" element={<ProtectedRoute><Retur /></ProtectedRoute>} />
          <Route path="/biaya-kas" element={<ProtectedRoute><BiayaKas /></ProtectedRoute>} />
          <Route path="/laporan" element={<ProtectedRoute><Laporan /></ProtectedRoute>} />
          <Route path="/tutup-periode" element={<ProtectedRoute><TutupPeriode /></ProtectedRoute>} />
          <Route path="/import-marketplace" element={<ProtectedRoute><ImportMarketplace /></ProtectedRoute>} />
          <Route path="/pengaturan" element={<ProtectedRoute><Pengaturan /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

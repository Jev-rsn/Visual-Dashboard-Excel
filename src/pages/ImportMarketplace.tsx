import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../utils/format';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const ImportMarketplace: React.FC = () => {
  const { token } = useAuth();
  const [platform, setPlatform] = useState('shopee');
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number>(2); // Default Shopee
  const [statusImport, setStatusImport] = useState<'Diproses' | 'Selesai'>('Diproses');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/master/channel', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setChannels(data);
        const shp = data.find((c: any) => c.nama.toLowerCase().includes('shopee'));
        if (shp) setSelectedChannelId(shp.id);
      })
      .catch(console.error);
  }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewData(null);
    }
  };

  const handleUploadPreview = async () => {
    if (!file) {
      alert('Pilih berkas CSV atau Excel terlebih dahulu.');
      return;
    }

    setLoadingPreview(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('platform', platform);

    try {
      const res = await fetch('/api/import-export/marketplace/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreviewData(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCommitImport = async () => {
    if (!previewData || previewData.validRows.length === 0) {
      alert('Tidak ada baris pesanan valid untuk diimpor.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/import-export/marketplace/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          channel_id: selectedChannelId,
          tanggal: new Date().toISOString().split('T')[0],
          status: statusImport,
          orders: previewData.validRows
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(data.message || 'Impor berhasil diposting!');
      setFile(null);
      setPreviewData(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Generate Sample Marketplace Excel Template for the user
  const handleDownloadSample = () => {
    const sampleRows = [
      {
        'No. Pesanan': '241124ABCD001',
        'Nomor Referensi SKU': 'TSH-BLK-M',
        'Nama Produk': 'Kaos Polos Cotton Combed 30s',
        'Jumlah': 2,
        'Harga Awal': 55000,
        'Biaya Administrasi': 7150,
        'Total Diskon': 0,
        'Opsi Pengiriman': 'J&T Express',
        'No. Resi': 'JT992817261'
      },
      {
        'No. Pesanan': '241124ABCD002',
        'Nomor Referensi SKU': 'TSH-BLK-L',
        'Nama Produk': 'Kaos Polos Cotton Combed 30s',
        'Jumlah': 1,
        'Harga Awal': 55000,
        'Biaya Administrasi': 3575,
        'Total Diskon': 0,
        'Opsi Pengiriman': 'Shopee Xpress',
        'No. Resi': 'SPXID0291827'
      },
      {
        'No. Pesanan': '241124ABCD003',
        'Nomor Referensi SKU': 'SKU-SALAH-TIDAK-ADA',
        'Nama Produk': 'Contoh Baris Error SKU',
        'Jumlah': 1,
        'Harga Awal': 50000,
        'Biaya Administrasi': 3000,
        'Total Diskon': 0,
        'Opsi Pengiriman': 'JNE Reguler',
        'No. Resi': 'JNE99112233'
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Pesanan_Shopee');
    XLSX.writeFile(wb, 'Contoh_Laporan_Pesanan_Marketplace.xlsx');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Impor Pesanan Marketplace</h1>
          <p className="text-xs text-slate-500 mt-0.5">Unggah laporan pesanan Seller Center (Shopee, Tokopedia, TikTok) dengan validasi SKU & deteksi duplikat</p>
        </div>

        <button
          onClick={handleDownloadSample}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Unduh Templat Contoh Excel</span>
        </button>
      </div>

      {/* Upload Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Platform Marketplace:</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
            >
              <option value="shopee">Shopee Seller Center</option>
              <option value="tokopedia">Tokopedia Seller Center</option>
              <option value="tiktok">TikTok Shop Center</option>
              <option value="generic">Format Universal / Standar CSV</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Target Channel Penjualan:</label>
            <select
              value={selectedChannelId}
              onChange={e => setSelectedChannelId(Number(e.target.value))}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
            >
              {channels.map(c => (
                <option key={c.id} value={c.id}>{c.nama} ({c.tipe})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Status Awal Pesanan Diimpor:</label>
            <select
              value={statusImport}
              onChange={e => setStatusImport(e.target.value as any)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
            >
              <option value="Diproses">Diproses (Reservasi Stok, Belum Masuk Kas)</option>
              <option value="Selesai">Selesai (Langsung Kunci HPP & Tambah Kas)</option>
            </select>
          </div>
        </div>

        {/* File Drag and Drop / Input */}
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-indigo-500 transition bg-slate-50/50">
          <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700">Pilih Berkas Laporan Pesanan (.xlsx atau .csv)</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Sistem akan otomatis memetakan kolom No. Pesanan, SKU, Qty, dan Potongan Admin</p>

          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="mt-3 text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleUploadPreview}
            disabled={!file || loadingPreview}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loadingPreview ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menganalisis Berkas...</span>
              </>
            ) : (
              <>
                <span>Pratinjau & Validasi Baris</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {previewData && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 text-xs">
          {/* Summary Metric Ribbon */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Baris Ditemukan</span>
              <div className="text-xl font-extrabold text-slate-800 mt-0.5">{previewData.totalRows} Baris</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] text-emerald-700 uppercase font-semibold">Baris Valid (Siap Impor)</span>
              <div className="text-xl font-extrabold text-emerald-700 mt-0.5">{previewData.validCount} Pesanan</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[10px] text-rose-700 uppercase font-semibold">Baris Bermasalah (Dilewati)</span>
              <div className="text-xl font-extrabold text-rose-700 mt-0.5">{previewData.errorCount} Baris</div>
            </div>
          </div>

          {/* Error Table if any */}
          {previewData.errorRows?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-rose-700 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Baris Bermasalah (Tidak Dapat Diimpor):</span>
              </div>
              <div className="border border-rose-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-rose-50 text-rose-800 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Baris</th>
                      <th className="py-2 px-3">No. Pesanan</th>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Alasan Masalah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {previewData.errorRows.map((err: any, idx: number) => (
                      <tr key={idx} className="bg-rose-50/30">
                        <td className="py-1.5 px-3 font-semibold text-slate-700">{err.rowNum}</td>
                        <td className="py-1.5 px-3 font-mono">{err.orderNo || '-'}</td>
                        <td className="py-1.5 px-3 font-mono text-rose-600">{err.sku || '-'}</td>
                        <td className="py-1.5 px-3 font-medium text-rose-700">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid Items Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Pratinjau Pesanan Valid yang Akan Diimpor:</span>
              <span className="text-[11px] text-slate-500">Menampilkan {previewData.validRows.length} item</span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-2 px-3">No. Pesanan</th>
                    <th className="py-2 px-3">SKU & Produk</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Harga Jual</th>
                    <th className="py-2 px-3 text-right">Potongan Admin</th>
                    <th className="py-2 px-3">Kurir / Resi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.validRows.map((v: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{v.orderNo}</td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-indigo-600 font-semibold">{v.sku}</span>
                        <div className="text-slate-700">{v.nama_produk}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">{v.qty}</td>
                      <td className="py-2 px-3 text-right">{formatRupiah(v.harga)}</td>
                      <td className="py-2 px-3 text-right text-rose-600">-{formatRupiah(v.potongan_admin)}</td>
                      <td className="py-2 px-3 text-slate-500">{v.kurir || '-'} {v.resi ? `(${v.resi})` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Commit Button */}
          <div className="flex justify-between items-center pt-3 border-t border-slate-200">
            <span className="text-[11px] text-slate-500">
              Pastikan channel tujuan dan status sudah sesuai sebelum memproses komit.
            </span>
            <button
              onClick={handleCommitImport}
              disabled={submitting || previewData.validCount === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Memproses Impor...' : `Komit Impor ${previewData.validCount} Pesanan`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

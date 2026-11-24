import React from 'react';
import { Printer, X } from 'lucide-react';
import { formatRupiah, formatTanggalWaktu } from '../utils/format';

interface StrukModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export const StrukModal: React.FC<StrukModalProps> = ({ isOpen, onClose, order }) => {
  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-slate-100 flex items-center justify-between border-b print:hidden">
          <span className="font-semibold text-slate-800 text-sm">Pratinjau Struk Kasir</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Area */}
        <div id="struk-print-area" className="p-6 overflow-y-auto font-mono text-xs text-slate-800 bg-white">
          <div className="text-center mb-4">
            <h2 className="font-bold text-sm tracking-wide">MCRW RESELLER STORE</h2>
            <p className="text-[11px] text-slate-600">Jl. Niaga Utama No. 88, Jakarta Barat</p>
            <p className="text-[11px] text-slate-600">Telp: 0812-8899-0011</p>
            <div className="border-b border-dashed border-slate-400 my-2"></div>
          </div>

          <div className="space-y-1 mb-3 text-[11px]">
            <div className="flex justify-between">
              <span>No. Inv:</span>
              <span className="font-semibold">{order.no_invoice}</span>
            </div>
            <div className="flex justify-between">
              <span>Waktu:</span>
              <span>{formatTanggalWaktu(order.created_at || order.tanggal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kasir:</span>
              <span>{order.created_by || 'Kasir'}</span>
            </div>
            <div className="flex justify-between">
              <span>Pelanggan:</span>
              <span>{order.nama_pelanggan || 'Walk-in'}</span>
            </div>
            <div className="flex justify-between">
              <span>Metode:</span>
              <span className="font-semibold">{order.metode_bayar}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 my-2"></div>

          {/* Items */}
          <div className="space-y-2 mb-3">
            {order.items?.map((it: any, idx: number) => (
              <div key={idx} className="text-[11px]">
                <div className="font-medium truncate">{it.nama_produk || it.sku}</div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    {it.qty} x {formatRupiah(it.harga)}
                    {it.diskon > 0 ? ` (Disc: -${formatRupiah(it.diskon)})` : ''}
                  </span>
                  <span className="text-slate-900 font-semibold">
                    {formatRupiah((it.qty * it.harga) - (it.diskon || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-b border-dashed border-slate-400 my-2"></div>

          <div className="space-y-1 mb-4 text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatRupiah(order.omzet_kotor)}</span>
            </div>
            {order.diskon_total > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Diskon:</span>
                <span>-{formatRupiah(order.diskon_total)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-slate-200">
              <span>TOTAL BAYAR:</span>
              <span>{formatRupiah(order.pendapatan_bersih || (order.omzet_kotor - (order.diskon_total || 0)))}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-dashed border-slate-400">
            <p>Terima kasih atas kunjungan Anda!</p>
            <p>Barang yang dibeli dapat ditukar maks 3 hari dengan struk ini.</p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t flex gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 text-sm transition"
          >
            <Printer className="w-4 h-4" />
            Cetak Struk
          </button>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2 px-4 rounded-lg text-sm transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

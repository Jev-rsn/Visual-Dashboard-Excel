import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../utils/format';
import { StrukModal } from '../components/StrukModal';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  CreditCard,
  QrCode,
  Banknote,
  User,
  Tag,
  AlertCircle
} from 'lucide-react';

interface CartItem {
  varian_id: number;
  sku: string;
  nama_produk: string;
  nama_varian: string;
  harga: number;
  qty: number;
  diskon: number;
  stok_tersedia: number;
}

export const POS: React.FC = () => {
  const { token, user } = useAuth();
  const [varians, setVarians] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pelangganList, setPelangganList] = useState<any[]>([]);
  const [selectedPelanggan, setSelectedPelanggan] = useState<string>('');
  const [metodeBayar, setMetodeBayar] = useState<string>('Tunai');
  const [diskonTotal, setDiskonTotal] = useState<number>(0);
  const [uangDiterima, setUangDiterima] = useState<number>(0);
  const [akunKasList, setAkunKasList] = useState<any[]>([]);
  const [selectedAkunKas, setSelectedAkunKas] = useState<number>(1);
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [showStruk, setShowStruk] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Load products & cash accounts
  const loadMaster = () => {
    fetch('/api/master/varians', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setVarians)
      .catch(console.error);

    fetch('/api/master/pelanggan', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPelangganList)
      .catch(console.error);

    fetch('/api/master/akun-kas', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setAkunKasList(data);
        const kasToko = data.find((a: any) => a.tipe_akun === 'Kas Toko');
        if (kasToko) setSelectedAkunKas(kasToko.id);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadMaster();
  }, [token]);

  // Filtered variant catalog
  const filteredVarians = varians.filter(v => {
    const s = search.toLowerCase();
    return (
      v.sku.toLowerCase().includes(s) ||
      v.nama_produk.toLowerCase().includes(s) ||
      v.nama_varian.toLowerCase().includes(s) ||
      (v.barcode && v.barcode.includes(s))
    );
  });

  // Add item to cart
  const addToCart = (v: any) => {
    const existing = cart.find(c => c.varian_id === v.id);
    if (existing) {
      if (existing.qty + 1 > v.stok_tersedia) {
        alert(`Stok tersedia untuk SKU ${v.sku} hanya ${v.stok_tersedia} Pcs.`);
        return;
      }
      setCart(cart.map(c => c.varian_id === v.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      if (v.stok_tersedia <= 0) {
        alert(`Stok untuk SKU ${v.sku} habis.`);
        return;
      }
      setCart([
        ...cart,
        {
          varian_id: v.id,
          sku: v.sku,
          nama_produk: v.nama_produk,
          nama_varian: v.nama_varian,
          harga: v.harga_jual_default,
          qty: 1,
          diskon: 0,
          stok_tersedia: v.stok_tersedia
        }
      ]);
    }
  };

  const updateQty = (varian_id: number, delta: number) => {
    setCart(cart.map(c => {
      if (c.varian_id === varian_id) {
        const newQty = c.qty + delta;
        if (newQty <= 0) return null as any;
        if (newQty > c.stok_tersedia) {
          alert(`Stok tersedia hanya ${c.stok_tersedia} Pcs.`);
          return c;
        }
        return { ...c, qty: newQty };
      }
      return c;
    }).filter(Boolean));
  };

  const removeItem = (varian_id: number) => {
    setCart(cart.filter(c => c.varian_id !== varian_id));
  };

  const updateItemDiscount = (varian_id: number, diskon: number) => {
    setCart(cart.map(c => c.varian_id === varian_id ? { ...c, diskon: Math.max(0, diskon) } : c));
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.qty * item.harga), 0);
  const totalItemDiscount = cart.reduce((sum, item) => sum + item.diskon, 0);
  const grandTotal = Math.max(0, subtotal - totalItemDiscount - diskonTotal);
  const kembalian = uangDiterima > grandTotal ? uangDiterima - grandTotal : 0;

  // Handle Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Keranjang belanja masih kosong.');
      return;
    }

    if (metodeBayar === 'Tunai' && uangDiterima < grandTotal) {
      alert(`Uang tunai yang diterima (Rp ${uangDiterima.toLocaleString('id-ID')}) kurang dari total tagihan (Rp ${grandTotal.toLocaleString('id-ID')}).`);
      return;
    }

    setSubmitting(true);
    const invoiceNo = `POS-${Date.now().toString(36).toUpperCase()}`;
    const selectedCust = pelangganList.find(p => String(p.id) === selectedPelanggan);

    try {
      const res = await fetch('/api/penjualan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          no_invoice: invoiceNo,
          tipe: 'POS',
          channel_id: 1, // POS channel
          tanggal: new Date().toISOString().split('T')[0],
          pelanggan_id: selectedCust ? selectedCust.id : null,
          nama_pelanggan: selectedCust ? selectedCust.nama : 'Walk-in',
          metode_bayar: metodeBayar,
          akun_kas_id: selectedAkunKas,
          status: 'Selesai',
          diskon_total: diskonTotal,
          catatan,
          items: cart.map(it => ({
            varian_id: it.varian_id,
            qty: it.qty,
            harga: it.harga,
            diskon: it.diskon,
            potongan_admin: 0
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses transaksi.');

      // Prepare order object for receipt printing
      const orderForStruk = {
        no_invoice: invoiceNo,
        tanggal: new Date().toISOString(),
        created_by: user?.nama,
        nama_pelanggan: selectedCust ? selectedCust.nama : 'Walk-in',
        metode_bayar: metodeBayar,
        omzet_kotor: subtotal,
        diskon_total: totalItemDiscount + diskonTotal,
        pendapatan_bersih: grandTotal,
        items: cart
      };

      setLastOrder(orderForStruk);
      setShowStruk(true);

      // Reset cart and reload stock
      setCart([]);
      setDiskonTotal(0);
      setUangDiterima(0);
      setCatatan('');
      loadMaster();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[calc(100vh-6rem)]">
      {/* Product Catalog Pane (Left / Top) */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search & Barcode Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari SKU, Nama Produk, atau Barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Product Grid */}
        <div className="p-4 flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredVarians.map(v => {
            const isOutOfStock = v.stok_tersedia <= 0;
            return (
              <button
                key={v.id}
                onClick={() => addToCart(v)}
                disabled={isOutOfStock}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition group ${
                  isOutOfStock
                    ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono text-indigo-600 font-semibold uppercase">{v.sku}</span>
                  <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 mt-0.5">{v.nama_produk}</h3>
                  <div className="text-[11px] text-slate-500">{v.nama_varian}</div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{formatRupiah(v.harga_jual_default)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    v.stok_tersedia <= 0 ? 'bg-rose-100 text-rose-700' : v.stok_tersedia <= v.stok_min ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {v.stok_tersedia} {v.satuan}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart & Checkout Pane (Right / Bottom) */}
      <div className="w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Keranjang Transaksi</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
              {cart.reduce((s, it) => s + it.qty, 0)}
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium"
            >
              Kosongkan
            </button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[160px] max-h-[350px]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
              <ShoppingBag className="w-8 h-8 mb-2 stroke-1 text-slate-300" />
              <span>Keranjang masih kosong. Ketuk produk untuk menambahkan.</span>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.varian_id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 line-clamp-1">{item.nama_produk}</h4>
                    <span className="text-[11px] text-slate-500">{item.nama_varian}</span>
                  </div>
                  <button
                    onClick={() => removeItem(item.varian_id)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                    <button
                      onClick={() => updateQty(item.varian_id, -1)}
                      className="p-1 text-slate-600 hover:bg-slate-100 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-slate-800">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.varian_id, 1)}
                      className="p-1 text-slate-600 hover:bg-slate-100 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-slate-900">
                    {formatRupiah((item.qty * item.harga) - (item.diskon || 0))}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Controls */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
          {/* Customer & Cash Account */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Pelanggan</label>
              <select
                value={selectedPelanggan}
                onChange={e => setSelectedPelanggan(e.target.value)}
                className="w-full mt-0.5 p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              >
                <option value="">Walk-in (Umum)</option>
                {pelangganList.map(p => (
                  <option key={p.id} value={p.id}>{p.nama} ({p.tipe_member})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Akun Kas</label>
              <select
                value={selectedAkunKas}
                onChange={e => setSelectedAkunKas(Number(e.target.value))}
                className="w-full mt-0.5 p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              >
                {akunKasList.map(a => (
                  <option key={a.id} value={a.id}>{a.nama}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Metode Pembayaran</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {['Tunai', 'Transfer', 'QRIS'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodeBayar(m)}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                    metodeBayar === m
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Cash Received & Change */}
          {metodeBayar === 'Tunai' && (
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Uang Diterima:</span>
                <input
                  type="number"
                  value={uangDiterima || ''}
                  onChange={e => setUangDiterima(Number(e.target.value))}
                  placeholder="Rp 0"
                  className="w-28 text-right p-1 bg-slate-50 border border-slate-300 rounded font-semibold text-xs"
                />
              </div>
              <div className="flex justify-between items-center text-slate-700 font-semibold pt-1 border-t border-slate-100">
                <span>Kembalian:</span>
                <span className="text-emerald-600 font-bold">{formatRupiah(kembalian)}</span>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1 text-xs pt-1">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            {totalItemDiscount + diskonTotal > 0 && (
              <div className="flex justify-between text-rose-600 font-medium">
                <span>Total Diskon:</span>
                <span>-{formatRupiah(totalItemDiscount + diskonTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>TOTAL BAYAR:</span>
              <span className="text-base text-indigo-600">{formatRupiah(grandTotal)}</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleCheckout}
            disabled={submitting || cart.length === 0}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            <span>{submitting ? 'Memproses Transaksi...' : `Bayar & Selesaikan (${formatRupiah(grandTotal)})`}</span>
          </button>
        </div>
      </div>

      {/* Struk Modal */}
      <StrukModal
        isOpen={showStruk}
        onClose={() => setShowStruk(false)}
        order={lastOrder}
      />
    </div>
  );
};

import React from 'react';

interface BadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, size = 'sm' }) => {
  let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';

  const s = String(status).toUpperCase();

  if (s === 'AMAN' || s === 'SELESAI' || s === 'LUNAS' || s === 'POSTED' || s === 'DISUJUI' || s === 'DISETUJUI') {
    colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (s === 'RESTOCK' || s === 'DIPROSES' || s === 'UTANG' || s === 'DIAJUKAN' || s === 'DRAFT') {
    colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (s === 'HABIS' || s === 'VOID' || s === 'BATAL' || s === 'DITOLAK') {
    colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (s === 'DIKIRIM' || s === 'ONLINE') {
    colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (s === 'OFFLINE' || s === 'POS') {
    colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
  }

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${colorClass} ${sizeClass}`}>
      {status}
    </span>
  );
};

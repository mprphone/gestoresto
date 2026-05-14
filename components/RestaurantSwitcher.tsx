import React, { useState, useRef, useEffect } from 'react';
import { Store, ChevronDown, Check } from 'lucide-react';
import { Restaurant } from '../types';

interface Props {
  current: Restaurant;
  all: Restaurant[];
  onSwitch: (restaurant: Restaurant) => void;
}

const RestaurantSwitcher: React.FC<Props> = ({ current, all, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (all.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 border border-orange-100 text-orange-700">
        <Store size={14} />
        <span className="text-xs font-black uppercase truncate max-w-[140px]">{current.name}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 border border-orange-100 text-orange-700 hover:bg-orange-100 transition-colors"
      >
        <Store size={14} />
        <span className="text-xs font-black uppercase truncate max-w-[140px]">{current.name}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-[9999] overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Trocar restaurante</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {all.map(r => (
              <button
                key={r.id}
                onClick={() => { onSwitch(r); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{r.name}</p>
                  {r.companyName && r.companyName !== r.name && (
                    <p className="text-[9px] font-bold text-slate-400 truncate">{r.companyName}</p>
                  )}
                </div>
                {r.id === current.id && <Check size={14} className="text-orange-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantSwitcher;

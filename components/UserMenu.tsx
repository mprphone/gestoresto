import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, LogOut, ArrowLeftRight, Settings } from 'lucide-react';
import { AppUser, Restaurant } from '../types';

interface Props {
  user: AppUser;
  currentRestaurant: Restaurant;
  canSwitch: boolean;
  canAdmin?: boolean;
  onAdmin?: () => void;
  onSwitchRestaurant: () => void;
  onLogout: () => void;
}

const UserMenu: React.FC<Props> = ({ user, currentRestaurant, canSwitch, canAdmin, onAdmin, onSwitchRestaurant, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
          {initials}
        </div>
        <span className="text-xs font-black text-slate-700 hidden sm:block max-w-[100px] truncate">
          {user.name.split(' ')[0]}
        </span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-[9999] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-black text-slate-900">{user.name}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{currentRestaurant.name}</p>
          </div>

          {canSwitch && (
            <button
              onClick={() => { onSwitchRestaurant(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <ArrowLeftRight size={14} className="text-slate-400 shrink-0" />
              <span className="text-xs font-bold text-slate-700">Trocar restaurante</span>
            </button>
          )}

          {canAdmin && (
            <button
              onClick={() => { onAdmin?.(); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${canSwitch ? 'border-t border-slate-100' : ''}`}
            >
              <Settings size={14} className="text-slate-400 shrink-0" />
              <span className="text-xs font-bold text-slate-700">Administração</span>
            </button>
          )}

          <button
            onClick={() => { onLogout(); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${(canSwitch || canAdmin) ? 'border-t border-slate-100' : ''}`}
          >
            <LogOut size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-700">Sair</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;

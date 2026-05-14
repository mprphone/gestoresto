import React from 'react';
import { UtensilsCrossed, Store, LogOut } from 'lucide-react';
import { Restaurant } from '../types';

interface Props {
  restaurants: Restaurant[];
  userName: string;
  loading: boolean;
  onSelect: (r: Restaurant) => void;
  onLogout: () => void;
}

const RestaurantSelector: React.FC<Props> = ({ restaurants, userName, loading, onSelect, onLogout }) => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
    <div className="flex items-center gap-3 mb-12">
      <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
        <UtensilsCrossed className="text-white w-8 h-8" />
      </div>
      <h1 className="font-black text-3xl tracking-tighter uppercase italic text-slate-900">GestoRestô</h1>
    </div>

    <div className="text-center mb-10">
      <p className="text-xl font-black text-slate-800">Olá, {userName.split(' ')[0]}</p>
      <p className="text-sm font-bold text-slate-400 mt-2">Escolhe o restaurante onde vais trabalhar</p>
    </div>

    {loading ? (
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">A carregar...</p>
    ) : restaurants.length === 0 ? (
      <div className="text-center max-w-sm">
        <p className="text-sm font-bold text-slate-500">Não tens acesso a nenhum restaurante.</p>
        <p className="text-xs text-slate-400 mt-1">Contacta o administrador para obter acesso.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl w-full">
        {restaurants.map(r => (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="bg-white border-2 border-slate-200 hover:border-orange-400 rounded-3xl p-6 text-left transition-all hover:shadow-xl group"
          >
            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-orange-500 transition-colors">
              <Store className="text-orange-400 group-hover:text-white transition-colors" size={22} />
            </div>
            <p className="font-black text-slate-900 text-base leading-tight">{r.name}</p>
            {r.companyName && r.companyName !== r.name && (
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">{r.companyName}</p>
            )}
          </button>
        ))}
      </div>
    )}

    <button
      onClick={onLogout}
      className="mt-12 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
    >
      <LogOut size={14} /> Sair
    </button>
  </div>
);

export default RestaurantSelector;

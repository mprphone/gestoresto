import React, { useState, useEffect } from 'react';
import { ClipboardCheck, LogOut, ChevronDown, UtensilsCrossed } from 'lucide-react';
import { AppUser, Restaurant } from '../types';
import { login, getUserContext } from '../data/authRepository';
import { switchRestaurant } from '../data/companiesRepository';
import { subscribePush, getVapidPublicKey } from '../data/reviewRepository';
import { setAuthRestaurant } from '../data/apiClient';
import InvoiceReview from './InvoiceReview';

const USER_KEY = 'gestoresto_user';
const RESTAURANT_KEY = 'gestoresto_restaurant_id';

const canReview = (role: string) => role === 'admin' || role === 'superadmin' || role === 'gerente';

const ReviewApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  });
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  // Restore restaurant and load context on mount
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }

    const savedRestaurantId = localStorage.getItem(RESTAURANT_KEY) || '';
    if (savedRestaurantId) setAuthRestaurant(savedRestaurantId);

    getUserContext(currentUser.id)
      .then(({ restaurants: rests, currentRestaurant: cur }) => {
        setRestaurants(rests);
        const active = cur || rests[0] || null;
        setCurrentRestaurant(active);
        if (active) setAuthRestaurant(active.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser?.id]);

  // Register service worker and subscribe to push (review-app scope)
  useEffect(() => {
    if (!currentUser || !canReview(currentUser.role)) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.register('/sw.js').then(async reg => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      try {
        const publicKey = await getVapidPublicKey();
        if (!publicKey) return;
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey
        });
        await subscribePush(sub, currentUser.id);
      } catch (e) {
        console.warn('Push subscribe failed:', e);
      }
    }).catch(e => console.warn('SW register failed:', e));
  }, [currentUser?.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const result = await login(loginEmail, loginPassword);
      if (!canReview(result.user.role)) {
        setLoginError('Este utilizador não tem acesso à revisão de faturas.');
        return;
      }
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      const active = result.currentRestaurant || result.restaurants[0] || null;
      if (active) setAuthRestaurant(active.id);
      setCurrentUser(result.user);
      setRestaurants(result.restaurants);
      setCurrentRestaurant(active);
    } catch (err: any) {
      setLoginError(err.message || 'Email ou senha inválidos.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(USER_KEY);
    setCurrentUser(null);
    setRestaurants([]);
    setCurrentRestaurant(null);
  };

  const handleSwitchRestaurant = async (r: Restaurant) => {
    setSwitchingTo(r.id);
    try {
      await switchRestaurant(currentUser!.id, r.id);
      setAuthRestaurant(r.id);
      setCurrentRestaurant(r);
    } catch (e) {
      console.warn('Switch restaurant failed:', e);
    } finally {
      setSwitchingTo(null);
      setShowRestaurantPicker(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
          <div className="p-8 bg-slate-900 text-white">
            <div className="flex items-center gap-3 mb-6">
              <UtensilsCrossed className="text-orange-500" size={30} />
              <h1 className="font-black text-xl uppercase italic">GestoRestô</h1>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardCheck size={20} className="text-slate-400" />
              <h2 className="font-black text-lg uppercase">Revisão de Faturas</h2>
            </div>
            <p className="text-xs font-bold text-white/40 mt-1">Acesso para administradores</p>
          </div>

          <div className="p-8 space-y-5">
            {loginError && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold">{loginError}</div>
            )}
            <label className="space-y-2 block">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
              <input
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-orange-500/20"
                type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required
              />
            </label>
            <label className="space-y-2 block">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</span>
              <input
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-orange-500/20"
                type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required autoFocus
              />
            </label>
            <button
              disabled={loginBusy}
              className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-slate-900 disabled:opacity-50 transition-all"
            >
              {loginBusy ? 'A entrar…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
        <ClipboardCheck size={20} className="text-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm uppercase leading-none">Revisão de Faturas</p>
          {currentRestaurant && (
            <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">{currentRestaurant.name}</p>
          )}
        </div>

        {restaurants.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowRestaurantPicker(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Trocar <ChevronDown size={14} />
            </button>
            {showRestaurantPicker && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden">
                {restaurants.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSwitchRestaurant(r)}
                    disabled={!!switchingTo}
                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${
                      r.id === currentRestaurant?.id
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {switchingTo === r.id ? 'A trocar…' : r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </header>

      {/* Review content */}
      <div className="flex-1 overflow-auto">
        {currentRestaurant ? (
          <InvoiceReview
            currentUser={currentUser}
            restaurantId={currentRestaurant.id}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm font-medium">
            Sem restaurante associado.
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewApp;

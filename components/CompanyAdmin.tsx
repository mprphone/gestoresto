import React, { useState, useEffect } from 'react';
import { Building2, Store, Users, Plus, X, ChevronDown, ChevronRight, Check, Pencil } from 'lucide-react';
import { Company, Restaurant, AppUser } from '../types';
import {
  listCompanies, createCompany, updateCompany,
  listRestaurants, createRestaurant, updateRestaurant,
  listRestaurantUsers, listAvailableUsers,
  addUserToRestaurant, removeUserFromRestaurant
} from '../data/companiesRepository';

const ROLES = ['admin', 'gerente', 'compras', 'cozinha', 'financeiro', 'funcionario'];

const CompanyAdmin: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded state
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedRestaurant, setExpandedRestaurant] = useState<string | null>(null);
  const [restaurantUsers, setRestaurantUsers] = useState<Record<string, (AppUser & { accessRole: string; accessId: string })[]>>({});
  const [availableUsers, setAvailableUsers] = useState<Record<string, AppUser[]>>({});

  // New company form
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyNif, setNewCompanyNif] = useState('');

  // New restaurant form
  const [showNewRestaurant, setShowNewRestaurant] = useState<string | null>(null);
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [newRestaurantNif, setNewRestaurantNif] = useState('');

  // Add user form
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('funcionario');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r] = await Promise.all([listCompanies(), listRestaurants()]);
      setCompanies(c);
      setRestaurants(r);
      if (c.length > 0 && !expandedCompany) setExpandedCompany(c[0].id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRestaurantUsers = async (restaurantId: string) => {
    const [users, available] = await Promise.all([
      listRestaurantUsers(restaurantId),
      listAvailableUsers(restaurantId)
    ]);
    setRestaurantUsers(prev => ({ ...prev, [restaurantId]: users }));
    setAvailableUsers(prev => ({ ...prev, [restaurantId]: available }));
  };

  const toggleRestaurant = async (rid: string) => {
    if (expandedRestaurant === rid) {
      setExpandedRestaurant(null);
    } else {
      setExpandedRestaurant(rid);
      if (!restaurantUsers[rid]) await loadRestaurantUsers(rid);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return;
    try {
      const c = await createCompany({ name: newCompanyName, nif: newCompanyNif || undefined });
      setCompanies(prev => [...prev, c]);
      setNewCompanyName(''); setNewCompanyNif('');
      setShowNewCompany(false);
      setExpandedCompany(c.id);
    } catch (e: any) { setError(e.message); }
  };

  const handleCreateRestaurant = async (companyId: string) => {
    if (!newRestaurantName.trim()) return;
    try {
      const r = await createRestaurant({ companyId, name: newRestaurantName, nif: newRestaurantNif || undefined });
      setRestaurants(prev => [...prev, r]);
      setNewRestaurantName(''); setNewRestaurantNif('');
      setShowNewRestaurant(null);
      setExpandedRestaurant(r.id);
      await loadRestaurantUsers(r.id);
    } catch (e: any) { setError(e.message); }
  };

  const handleAddUser = async (restaurantId: string) => {
    if (!selectedUserId) return;
    try {
      await addUserToRestaurant(restaurantId, selectedUserId, selectedRole);
      await loadRestaurantUsers(restaurantId);
      setAddingUser(null); setSelectedUserId(''); setSelectedRole('funcionario');
    } catch (e: any) { setError(e.message); }
  };

  const handleRemoveUser = async (restaurantId: string, userId: string) => {
    try {
      await removeUserFromRestaurant(restaurantId, userId);
      setRestaurantUsers(prev => ({
        ...prev,
        [restaurantId]: (prev[restaurantId] || []).filter(u => u.id !== userId)
      }));
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div className="text-slate-400 text-xs font-bold uppercase p-8 text-center">A carregar...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase italic tracking-tight">Empresas & Restaurantes</h2>
          <p className="text-sm text-slate-400 font-bold mt-1">Gere empresas, estabelecimentos e os utilizadores de cada um.</p>
        </div>
        <button
          onClick={() => setShowNewCompany(true)}
          className="px-4 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs hover:bg-orange-500 flex items-center gap-2 transition-all"
        >
          <Plus size={15} /> Nova Empresa
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold">{error}</div>}

      {/* New company form */}
      {showNewCompany && (
        <div className="bg-white border-2 border-orange-300 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Nova Empresa</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="Nome da empresa" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
            <input value={newCompanyNif} onChange={e => setNewCompanyNif(e.target.value)} placeholder="NIF (opcional)" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateCompany} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-500 transition-all flex items-center gap-2"><Check size={13} /> Criar</button>
            <button onClick={() => setShowNewCompany(false)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">Cancelar</button>
          </div>
        </div>
      )}

      {/* Companies list */}
      {companies.map(company => {
        const companyRestaurants = restaurants.filter(r => r.companyId === company.id);
        const isExpanded = expandedCompany === company.id;
        return (
          <div key={company.id} className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
            {/* Company header */}
            <button
              onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
              className="w-full flex items-center gap-4 p-6 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="p-3 rounded-2xl bg-slate-100">
                <Building2 size={20} className="text-slate-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-slate-900">{company.name}</h3>
                {company.nif && <p className="text-[10px] font-bold text-slate-400 mt-0.5">NIF {company.nif}</p>}
              </div>
              <span className="text-xs font-black text-slate-400">{companyRestaurants.length} restaurante{companyRestaurants.length !== 1 ? 's' : ''}</span>
              {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Restaurants */}
                {companyRestaurants.map(restaurant => {
                  const rExpanded = expandedRestaurant === restaurant.id;
                  const users = restaurantUsers[restaurant.id] || [];
                  const available = availableUsers[restaurant.id] || [];
                  return (
                    <div key={restaurant.id} className="border-b border-slate-100 last:border-0">
                      <button
                        onClick={() => toggleRestaurant(restaurant.id)}
                        className="w-full flex items-center gap-4 px-8 py-4 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className="p-2 rounded-xl bg-orange-50">
                          <Store size={16} className="text-orange-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-slate-900">{restaurant.name}</p>
                          {restaurant.nif && <p className="text-[9px] font-bold text-slate-400">NIF {restaurant.nif}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase"><Users size={11} className="inline mr-1" />{users.length || '?'}</span>
                          {rExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </div>
                      </button>

                      {rExpanded && (
                        <div className="px-8 pb-5 space-y-3">
                          {/* Users list */}
                          {users.map(u => (
                            <div key={u.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-black text-slate-900">{u.name}</p>
                                <p className="text-[9px] font-bold text-slate-400">{u.email} · {u.accessRole}</p>
                              </div>
                              <button onClick={() => handleRemoveUser(restaurant.id, u.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                                <X size={14} />
                              </button>
                            </div>
                          ))}

                          {/* Add user */}
                          {addingUser === restaurant.id ? (
                            <div className="flex gap-2 items-end">
                              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                                <option value="">Selecionar utilizador...</option>
                                {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                              </select>
                              <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <button onClick={() => handleAddUser(restaurant.id)} className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-orange-500 transition-all flex items-center gap-1"><Check size={12} /> OK</button>
                              <button onClick={() => setAddingUser(null)} className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-black hover:bg-slate-50 transition-all">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingUser(restaurant.id); loadRestaurantUsers(restaurant.id); }}
                              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-orange-500 transition-colors uppercase"
                            >
                              <Plus size={13} /> Adicionar utilizador
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add restaurant button / form */}
                <div className="px-6 py-4">
                  {showNewRestaurant === company.id ? (
                    <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Novo Restaurante</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newRestaurantName} onChange={e => setNewRestaurantName(e.target.value)} placeholder="Nome" className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                        <input value={newRestaurantNif} onChange={e => setNewRestaurantNif(e.target.value)} placeholder="NIF (opcional)" className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleCreateRestaurant(company.id)} className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-orange-500 transition-all flex items-center gap-1"><Check size={12} /> Criar</button>
                        <button onClick={() => setShowNewRestaurant(null)} className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-black hover:bg-slate-50 transition-all">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewRestaurant(company.id)}
                      className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-orange-500 transition-colors uppercase"
                    >
                      <Plus size={13} /> Adicionar restaurante a {company.name}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {companies.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-12 text-center">
          <Building2 size={48} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-bold text-sm">Nenhuma empresa configurada ainda.</p>
          <p className="text-slate-300 text-xs mt-1">Clique em "Nova Empresa" para começar.</p>
        </div>
      )}
    </div>
  );
};

export default CompanyAdmin;

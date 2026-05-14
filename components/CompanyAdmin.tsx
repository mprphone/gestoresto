import React, { useState, useEffect } from 'react';
import { Building2, Store, Users, Plus, X, Check, ChevronDown, ChevronRight, Mail, Hash, Pencil, Save } from 'lucide-react';
import { Company, Restaurant, AppUser } from '../types';
import {
  listCompanies, createCompany,
  listRestaurants, createRestaurant, updateRestaurant,
  listRestaurantUsers, listAvailableUsers,
  addUserToRestaurant, removeUserFromRestaurant
} from '../data/companiesRepository';

const ROLES = [
  { value: 'admin',       label: 'Admin' },
  { value: 'gerente',     label: 'Gerente' },
  { value: 'compras',     label: 'Compras' },
  { value: 'cozinha',     label: 'Cozinha' },
  { value: 'financeiro',  label: 'Financeiro' },
  { value: 'funcionario', label: 'Funcionário' },
];

const DEFAULT_EMAILS = ['geral@mrebelo.com', '517215110@my.toconline.pt'];

// ── Inline restaurant editor ─────────────────────────────────────────────────
interface RestaurantPanelProps {
  restaurant: Restaurant;
  onUpdated: (r: Restaurant) => void;
}
const RestaurantPanel: React.FC<RestaurantPanelProps> = ({ restaurant, onUpdated }) => {
  const [draft, setDraft] = useState<Restaurant>(restaurant);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [users, setUsers] = useState<(AppUser & { accessRole: string })[]>([]);
  const [available, setAvailable] = useState<AppUser[]>([]);
  const [addingUser, setAddingUser] = useState(false);
  const [selUser, setSelUser] = useState('');
  const [selRole, setSelRole] = useState('funcionario');
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);

  useEffect(() => { setDraft(restaurant); }, [restaurant.id]);

  const loadUsers = async () => {
    if (usersLoaded) return;
    const [u, av] = await Promise.all([listRestaurantUsers(restaurant.id), listAvailableUsers(restaurant.id)]);
    setUsers(u); setAvailable(av); setUsersLoaded(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateRestaurant(restaurant.id, {
        name: draft.name, nif: draft.nif,
        notificationEmails: draft.notificationEmails
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if ((draft.notificationEmails || []).includes(email)) return;
    setDraft(d => ({ ...d, notificationEmails: [...(d.notificationEmails || []), email] }));
    setEmailInput('');
  };

  const removeEmail = (email: string) =>
    setDraft(d => ({ ...d, notificationEmails: (d.notificationEmails || []).filter(e => e !== email) }));

  const handleAddUser = async () => {
    if (!selUser) return;
    await addUserToRestaurant(restaurant.id, selUser, selRole);
    const [u, av] = await Promise.all([listRestaurantUsers(restaurant.id), listAvailableUsers(restaurant.id)]);
    setUsers(u); setAvailable(av);
    setAddingUser(false); setSelUser(''); setSelRole('funcionario');
  };

  const handleRemoveUser = async (userId: string) => {
    await removeUserFromRestaurant(restaurant.id, userId);
    setUsers(u => u.filter(x => x.id !== userId));
    const av = await listAvailableUsers(restaurant.id);
    setAvailable(av);
  };

  return (
    <div className="space-y-5">
      {/* Profile fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Store size={11} /> Nome</span>
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
        </label>
        <label className="space-y-1">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Hash size={11} /> NIF</span>
          <input value={draft.nif || ''} onChange={e => setDraft(d => ({ ...d, nif: e.target.value }))}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
        </label>
      </div>

      {/* Notification emails */}
      <div className="space-y-2">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Mail size={11} /> Emails de Notificação</p>
        <div className="flex flex-wrap gap-2">
          {(draft.notificationEmails || []).map(email => (
            <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700">
              {email}
              <button type="button" onClick={() => removeEmail(email)} className="text-slate-400 hover:text-red-500"><X size={11} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={emailInput} onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
            placeholder="novo@email.com"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
          <button onClick={addEmail} disabled={!emailInput.trim()}
            className="px-3 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase hover:bg-orange-500 disabled:opacity-30 transition-all flex items-center gap-1">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black uppercase text-xs transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-orange-500'}`}>
        {saved ? <><Check size={14} /> Guardado</> : <><Save size={14} /> {saving ? 'A guardar...' : 'Guardar alterações'}</>}
      </button>

      {/* Users section */}
      <div className="border-t border-slate-100 pt-4">
        <button
          onClick={() => { setUsersOpen(o => !o); if (!usersLoaded) loadUsers(); }}
          className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-orange-500 transition-colors"
        >
          <Users size={13} /> Utilizadores com acesso ({users.length})
          {usersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {usersOpen && (
          <div className="mt-3 space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-black text-orange-600">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{u.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 truncate">{u.email} · {u.accessRole}</p>
                </div>
                <button onClick={() => handleRemoveUser(u.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><X size={13} /></button>
              </div>
            ))}

            {addingUser ? (
              <div className="flex gap-2 items-center flex-wrap">
                <select value={selUser} onChange={e => setSelUser(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none">
                  <option value="">Selecionar utilizador...</option>
                  {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
                <select value={selRole} onChange={e => setSelRole(e.target.value)}
                  className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={handleAddUser} className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-emerald-600 transition-all flex items-center gap-1"><Check size={12} /> OK</button>
                <button onClick={() => setAddingUser(false)} className="p-2 text-slate-400 hover:text-slate-600"><X size={13} /></button>
              </div>
            ) : (
              <button onClick={() => { setAddingUser(true); if (!usersLoaded) loadUsers(); }}
                className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-orange-500 transition-colors uppercase">
                <Plus size={12} /> Adicionar utilizador
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
const CompanyAdmin: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedRestaurant, setExpandedRestaurant] = useState<string | null>(null);

  // New company form
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCoName, setNewCoName] = useState('');
  const [newCoNif, setNewCoNif] = useState('');
  const [savingCo, setSavingCo] = useState(false);

  // New restaurant form (key = companyId)
  const [showNewRest, setShowNewRest] = useState<string | null>(null);
  const [newRName, setNewRName] = useState('');
  const [newRNif, setNewRNif] = useState('');
  const [savingR, setSavingR] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([listCompanies(), listRestaurants()]);
      setCompanies(c);
      setRestaurants(r);
      if (c.length > 0) setExpandedCompany(c[0].id);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateCompany = async () => {
    if (!newCoName.trim()) return;
    setSavingCo(true);
    try {
      const c = await createCompany({ name: newCoName, nif: newCoNif || undefined });
      setCompanies(prev => [...prev, c]);
      setNewCoName(''); setNewCoNif('');
      setShowNewCompany(false);
      setExpandedCompany(c.id);
    } catch (e: any) { setError(e.message); }
    finally { setSavingCo(false); }
  };

  const handleCreateRestaurant = async (companyId: string) => {
    if (!newRName.trim()) return;
    setSavingR(true);
    try {
      const r = await createRestaurant({
        companyId, name: newRName, nif: newRNif || undefined,
        notificationEmails: [...DEFAULT_EMAILS]
      });
      setRestaurants(prev => [...prev, r]);
      setNewRName(''); setNewRNif('');
      setShowNewRest(null);
      setExpandedRestaurant(r.id);
    } catch (e: any) { setError(e.message); }
    finally { setSavingR(false); }
  };

  if (loading) return (
    <div className="text-slate-400 text-xs font-bold uppercase p-12 text-center">A carregar...</div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase italic tracking-tight">Empresas & Restaurantes</h2>
          <p className="text-sm text-slate-400 font-bold mt-1">Configure as empresas, os estabelecimentos e os utilizadores de cada um.</p>
        </div>
        <button onClick={() => setShowNewCompany(true)}
          className="shrink-0 px-4 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs hover:bg-orange-500 flex items-center gap-2 transition-all shadow-lg">
          <Building2 size={14} /> Nova Empresa
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2">
          <X size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* New company form */}
      {showNewCompany && (
        <div className="bg-white border-2 border-orange-300 rounded-[2rem] p-6 space-y-4 shadow-lg">
          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Nova Empresa</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[9px] font-black text-slate-400 uppercase">Nome da empresa</span>
              <input value={newCoName} onChange={e => setNewCoName(e.target.value)}
                autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-black text-slate-400 uppercase">NIF (opcional)</span>
              <input value={newCoNif} onChange={e => setNewCoNif(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateCompany} disabled={!newCoName.trim() || savingCo}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-500 disabled:opacity-40 flex items-center gap-2 transition-all">
              <Check size={13} /> {savingCo ? 'A criar...' : 'Criar Empresa'}
            </button>
            <button onClick={() => setShowNewCompany(false)}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Companies list */}
      {companies.length === 0 && !loading ? (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-16 text-center shadow-sm">
          <Building2 size={48} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-black text-sm uppercase">Nenhuma empresa configurada</p>
          <p className="text-slate-300 text-xs font-bold mt-1">Clique em "Nova Empresa" para começar.</p>
          <button onClick={() => setShowNewCompany(true)}
            className="mt-6 px-6 py-3 bg-orange-500 text-white rounded-2xl font-black uppercase text-xs hover:bg-orange-600 flex items-center gap-2 mx-auto transition-all">
            <Building2 size={14} /> Criar primeira empresa
          </button>
        </div>
      ) : (
        companies.map(company => {
          const companyRestaurants = restaurants.filter(r => r.companyId === company.id);
          const isExpanded = expandedCompany === company.id;

          return (
            <div key={company.id} className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
              {/* Company header */}
              <button
                onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                className="w-full flex items-center gap-4 p-6 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="p-3 rounded-2xl bg-slate-900 text-white">
                  <Building2 size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-900 text-base">{company.name}</h3>
                  {company.nif && <p className="text-[10px] font-bold text-slate-400 mt-0.5">NIF {company.nif}</p>}
                </div>
                <span className="text-xs font-black text-slate-400 shrink-0">
                  {companyRestaurants.length} estabelecimento{companyRestaurants.length !== 1 ? 's' : ''}
                </span>
                {isExpanded ? <ChevronDown size={18} className="text-slate-400 shrink-0" /> : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Restaurants */}
                  {companyRestaurants.map(restaurant => {
                    const rExpanded = expandedRestaurant === restaurant.id;
                    return (
                      <div key={restaurant.id} className="border-b border-slate-100 last:border-0">
                        <button
                          onClick={() => setExpandedRestaurant(rExpanded ? null : restaurant.id)}
                          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-orange-50/50 transition-colors text-left"
                        >
                          <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-600">
                            <Store size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-900">{restaurant.name}</p>
                            {restaurant.nif && <p className="text-[9px] font-bold text-slate-400">NIF {restaurant.nif}</p>}
                          </div>
                          <span className="text-[9px] font-black text-orange-500 uppercase bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg shrink-0">
                            {rExpanded ? 'Fechar' : 'Editar'}
                          </span>
                          {rExpanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                        </button>

                        {rExpanded && (
                          <div className="px-6 pb-6 pt-2 bg-slate-50/50 border-t border-slate-100">
                            <RestaurantPanel
                              restaurant={restaurant}
                              onUpdated={updated => setRestaurants(prev => prev.map(r => r.id === updated.id ? updated : r))}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* New restaurant button / form */}
                  <div className="p-6">
                    {showNewRest === company.id ? (
                      <div className="p-5 bg-orange-50 border-2 border-orange-200 rounded-2xl space-y-3">
                        <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Novo Restaurante / Estabelecimento</p>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase">Nome *</span>
                            <input value={newRName} onChange={e => setNewRName(e.target.value)}
                              autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateRestaurant(company.id)}
                              placeholder="ex: Casa de Pasto"
                              className="w-full px-3 py-2.5 bg-white border border-orange-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase">NIF</span>
                            <input value={newRNif} onChange={e => setNewRNif(e.target.value)}
                              placeholder="opcional"
                              className="w-full px-3 py-2.5 bg-white border border-orange-200 rounded-xl text-sm font-bold outline-none" />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleCreateRestaurant(company.id)}
                            disabled={!newRName.trim() || savingR}
                            className="px-5 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-600 disabled:opacity-40 flex items-center gap-2 transition-all shadow-md">
                            <Store size={13} /> {savingR ? 'A criar...' : 'Criar Restaurante'}
                          </button>
                          <button onClick={() => { setShowNewRest(null); setNewRName(''); setNewRNif(''); }}
                            className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewRest(company.id)}
                        className="w-full flex items-center justify-center gap-3 py-4 border-2 border-dashed border-orange-200 rounded-2xl text-orange-500 hover:border-orange-400 hover:bg-orange-50 transition-all group"
                      >
                        <div className="p-1.5 rounded-xl bg-orange-100 group-hover:bg-orange-200 transition-colors">
                          <Plus size={16} />
                        </div>
                        <span className="text-xs font-black uppercase">Novo Restaurante / Estabelecimento</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default CompanyAdmin;

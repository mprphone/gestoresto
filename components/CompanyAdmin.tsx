import React, { useState, useEffect } from 'react';
import { Building2, Store, Users, Plus, X, Check, ChevronLeft, ChevronRight, Mail, Hash, Save, Pencil, UserPlus, UserCheck } from 'lucide-react';
import { Company, Restaurant, AppUser } from '../types';
import {
  listCompanies, createCompany, updateCompany,
  listRestaurants, createRestaurant, updateRestaurant,
  listRestaurantUsers, listAvailableUsers,
  addUserToRestaurant, removeUserFromRestaurant
} from '../data/companiesRepository';
import { saveUser } from '../data/authRepository';

const ROLES = [
  { value: 'admin',       label: 'Admin' },
  { value: 'gerente',     label: 'Gerente' },
  { value: 'compras',     label: 'Compras' },
  { value: 'cozinha',     label: 'Cozinha' },
  { value: 'financeiro',  label: 'Financeiro' },
  { value: 'funcionario', label: 'Funcionário' },
];
const DEFAULT_EMAILS = ['geral@mrebelo.com', '517215110@my.toconline.pt'];

// ── Restaurant detail panel (edit profile + users) ────────────────────────
interface RestaurantPanelProps {
  restaurant: Restaurant;
  onUpdated: (r: Restaurant) => void;
  onClose: () => void;
}
const RestaurantPanel: React.FC<RestaurantPanelProps> = ({ restaurant, onUpdated, onClose }) => {
  const [draft, setDraft] = useState<Restaurant>(restaurant);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [users, setUsers] = useState<(AppUser & { accessRole: string })[]>([]);
  const [available, setAvailable] = useState<AppUser[]>([]);
  const [selUser, setSelUser] = useState('');
  const [selRole, setSelRole] = useState('funcionario');
  const [addingUser, setAddingUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', password: '', role: 'funcionario' });

  useEffect(() => {
    setDraft(restaurant);
    listRestaurantUsers(restaurant.id).then(setUsers);
    listAvailableUsers(restaurant.id).then(setAvailable);
  }, [restaurant.id]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await updateRestaurant(restaurant.id, {
        name: draft.name, nif: draft.nif, notificationEmails: draft.notificationEmails
      });
      onUpdated(r);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally { setSaving(false); }
  };

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
    if ((draft.notificationEmails || []).includes(e)) return;
    setDraft(d => ({ ...d, notificationEmails: [...(d.notificationEmails || []), e] }));
    setEmailInput('');
  };

  const reloadUsers = async () => {
    const [u, av] = await Promise.all([listRestaurantUsers(restaurant.id), listAvailableUsers(restaurant.id)]);
    setUsers(u); setAvailable(av);
  };

  const doAddUser = async () => {
    if (!selUser) return;
    await addUserToRestaurant(restaurant.id, selUser, selRole);
    await reloadUsers();
    setAddingUser(false); setSelUser(''); setSelRole('funcionario');
  };

  const doCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) return;
    const created = await saveUser({ name: newUser.name, email: newUser.email, phone: newUser.phone || undefined, password: newUser.password, role: newUser.role as any, isActive: true });
    await addUserToRestaurant(restaurant.id, created.id, newUser.role);
    await reloadUsers();
    setCreatingUser(false);
    setNewUser({ name: '', email: '', phone: '', password: '', role: 'funcionario' });
  };

  const doChangeRole = async (userId: string, role: string) => {
    await addUserToRestaurant(restaurant.id, userId, role);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, accessRole: role } : u));
  };

  const doRemoveUser = async (userId: string) => {
    await removeUserFromRestaurant(restaurant.id, userId);
    setUsers(u => u.filter(x => x.id !== userId));
    const av = await listAvailableUsers(restaurant.id);
    setAvailable(av);
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-6 border-b border-slate-100 bg-orange-50/60">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white transition-colors text-slate-500">
          <ChevronLeft size={20} />
        </button>
        <div className="p-3 rounded-2xl bg-orange-500 text-white">
          <Store size={20} />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-slate-900 text-lg">{restaurant.name}</h3>
          {restaurant.nif && <p className="text-[10px] font-bold text-slate-400">NIF {restaurant.nif}</p>}
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Profile */}
        <section className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados do Estabelecimento</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Store size={10} /> Nome</span>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
            </label>
            <label className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Hash size={10} /> NIF</span>
              <input value={draft.nif || ''} onChange={e => setDraft(d => ({ ...d, nif: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
            </label>
          </div>

          {/* Notification emails */}
          <div className="space-y-2">
            <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Mail size={10} /> Emails de Notificação</span>
            <div className="flex flex-wrap gap-2">
              {(draft.notificationEmails || []).map(email => (
                <span key={email} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                  {email}
                  <button type="button" onClick={() => setDraft(d => ({ ...d, notificationEmails: (d.notificationEmails || []).filter(e => e !== email) }))} className="text-slate-400 hover:text-red-500 transition-colors"><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={emailInput} onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                placeholder="novo@email.com"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
              <button onClick={addEmail} disabled={!emailInput.trim()}
                className="px-3 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase hover:bg-orange-500 disabled:opacity-30 flex items-center gap-1 transition-all">
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          <button onClick={save} disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black uppercase text-xs transition-all shadow-sm ${savedOk ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-orange-500'}`}>
            {savedOk ? <><Check size={14} /> Guardado</> : <><Save size={14} /> {saving ? 'A guardar...' : 'Guardar'}</>}
          </button>
        </section>

        {/* Users */}
        <section className="space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={13} /> Utilizadores com acesso</h4>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-xs font-black text-orange-600 shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{u.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 truncate">{u.email}</p>
                </div>
                <select
                  value={u.accessRole}
                  onChange={e => doChangeRole(u.id, e.target.value)}
                  className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => doRemoveUser(u.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 shrink-0"><X size={14} /></button>
              </div>
            ))}
            {users.length === 0 && <p className="text-xs text-slate-400 font-bold italic">Nenhum utilizador atribuído.</p>}
          </div>

          {/* Add existing user */}
          {addingUser && (
            <div className="flex gap-2 flex-wrap items-end p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase">Utilizador existente</span>
                <select value={selUser} onChange={e => setSelUser(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                  <option value="">Selecionar...</option>
                  {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase">Função</span>
                <select value={selRole} onChange={e => setSelRole(e.target.value)}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <button onClick={doAddUser} disabled={!selUser}
                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-2 transition-all">
                <Check size={13} /> Adicionar
              </button>
              <button onClick={() => setAddingUser(false)} className="p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all"><X size={14} /></button>
            </div>
          )}

          {/* Create new user */}
          {creatingUser && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <p className="text-[9px] font-black text-slate-400 uppercase">Novo utilizador</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input placeholder="Nome completo" value={newUser.name} onChange={e => setNewUser(d => ({ ...d, name: e.target.value }))}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <input placeholder="Email" type="email" value={newUser.email} onChange={e => setNewUser(d => ({ ...d, email: e.target.value }))}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <input placeholder="Telefone" type="tel" value={newUser.phone} onChange={e => setNewUser(d => ({ ...d, phone: e.target.value }))}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <input placeholder="Password inicial" type="password" value={newUser.password} onChange={e => setNewUser(d => ({ ...d, password: e.target.value }))}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <select value={newUser.role} onChange={e => setNewUser(d => ({ ...d, role: e.target.value }))}
                  className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500/20 sm:col-span-2">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={doCreateUser} disabled={!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()}
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-2 transition-all">
                  <Check size={13} /> Criar e adicionar
                </button>
                <button onClick={() => setCreatingUser(false)} className="p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all"><X size={14} /></button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!addingUser && !creatingUser && (
            <div className="flex gap-3 flex-wrap">
              {available.length > 0 && (
                <button onClick={() => setAddingUser(true)}
                  className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-orange-500 transition-colors">
                  <div className="p-1.5 rounded-lg bg-slate-100 hover:bg-orange-100 transition-colors"><UserCheck size={12} /></div>
                  Associar utilizador
                </button>
              )}
              <button onClick={() => setCreatingUser(true)}
                className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-orange-500 transition-colors">
                <div className="p-1.5 rounded-lg bg-slate-100 hover:bg-orange-100 transition-colors"><UserPlus size={12} /></div>
                Criar utilizador
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ── Company detail (list of restaurants) ─────────────────────────────────────
interface CompanyDetailProps {
  company: Company;
  onBack: () => void;
  onEnterRestaurant?: (restaurant: Restaurant) => void;
}
const CompanyDetail: React.FC<CompanyDetailProps> = ({ company, onBack, onEnterRestaurant }) => {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNif, setNewNif] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRestaurants().then(all => {
      setRestaurants(all.filter(r => r.companyId === company.id));
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [company.id]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const r = await createRestaurant({
        companyId: company.id, name: newName, nif: newNif || undefined,
        notificationEmails: [...DEFAULT_EMAILS]
      });
      setRestaurants(prev => [...prev, r]);
      setNewName(''); setNewNif('');
      setShowNew(false);
      setSelectedRestaurant(r);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (selectedRestaurant) {
    return (
      <RestaurantPanel
        restaurant={selectedRestaurant}
        onUpdated={r => { setRestaurants(prev => prev.map(x => x.id === r.id ? r : x)); setSelectedRestaurant(r); }}
        onClose={() => setSelectedRestaurant(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-orange-500 transition-colors uppercase">
          <ChevronLeft size={16} /> Empresas
        </button>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-slate-900 text-white">
            <Building2 size={16} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase">{company.name}</h2>
            {company.nif && <p className="text-[9px] font-bold text-slate-400">NIF {company.nif}</p>}
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-[9px] font-black text-emerald-600 uppercase tracking-widest">
          Empresa ativa
        </span>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-xs font-bold uppercase text-center py-12">A carregar...</div>
      ) : (
        <>
          {/* Restaurant cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {restaurants.map(r => (
              <div key={r.id} onClick={() => onEnterRestaurant?.(r)}
                className="group bg-white border border-slate-200 rounded-[2rem] p-6 text-left hover:border-orange-300 hover:shadow-lg transition-all active:scale-95 cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-2xl bg-orange-50 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <Store size={22} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(event) => { event.stopPropagation(); setSelectedRestaurant(r); }}
                      className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-500 uppercase hover:border-orange-300 hover:text-orange-500 transition-all flex items-center gap-1.5"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-orange-400 transition-colors" />
                  </div>
                </div>
                <h3 className="font-black text-slate-900 text-lg leading-tight">{r.name}</h3>
                {r.nif && <p className="text-[10px] font-bold text-slate-400 mt-1">NIF {r.nif}</p>}
                <p className="text-[9px] font-black text-orange-500 uppercase mt-3 tracking-widest">Entrar no stock</p>
              </div>
            ))}

            {/* New restaurant card */}
            {showNew ? (
              <div className="bg-white border-2 border-orange-300 rounded-[2rem] p-6 space-y-4">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Novo Estabelecimento</p>
                <div className="space-y-3">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Nome do estabelecimento *"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                  <input value={newNif} onChange={e => setNewNif(e.target.value)}
                    placeholder="NIF (opcional)"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={!newName.trim() || saving}
                    className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                    <Check size={13} /> {saving ? '...' : 'Criar'}
                  </button>
                  <button onClick={() => { setShowNew(false); setNewName(''); setNewNif(''); }}
                    className="py-2.5 px-4 border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNew(true)}
                className="group bg-white border-2 border-dashed border-slate-200 rounded-[2rem] p-6 text-center hover:border-orange-300 hover:bg-orange-50/40 transition-all active:scale-95 flex flex-col items-center justify-center gap-3 min-h-[160px]">
                <div className="p-3 rounded-2xl bg-slate-100 text-slate-400 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                  <Plus size={24} />
                </div>
                <span className="text-xs font-black text-slate-400 group-hover:text-orange-500 uppercase transition-colors">Novo Estabelecimento</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Level 1: Company list ─────────────────────────────────────────────────────
interface CompanyAdminProps {
  onEnterRestaurant?: (restaurant: Restaurant) => void;
}

const CompanyAdmin: React.FC<CompanyAdminProps> = ({ onEnterRestaurant }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState('');
  const [editNif, setEditNif] = useState('');
  const [newName, setNewName] = useState('');
  const [newNif, setNewNif] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCompanies()
      .then(c => { setCompanies(c); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const c = await createCompany({ name: newName, nif: newNif || undefined });
      setCompanies(prev => [...prev, c]);
      setNewName(''); setNewNif('');
      setShowNew(false);
      setSelectedCompany(c);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const enterCompany = async (company: Company) => {
    setError(null);
    try {
      const restaurants = (await listRestaurants()).filter(r => r.companyId === company.id);
      if (restaurants.length === 1 && onEnterRestaurant) {
        onEnterRestaurant(restaurants[0]);
        return;
      }
      setSelectedCompany(company);
      if (restaurants.length === 0) {
        setError('Esta empresa ainda não tem nenhum estabelecimento para abrir stock.');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (company: Company) => {
    setEditingCompany(company);
    setEditName(company.name);
    setEditNif(company.nif || '');
    setShowNew(false);
  };

  const handleEdit = async () => {
    if (!editingCompany || !editName.trim()) return;
    setSaving(true);
    try {
      const saved = await updateCompany(editingCompany.id, { name: editName, nif: editNif || undefined });
      setCompanies(prev => prev.map(company => company.id === saved.id ? saved : company));
      if (selectedCompany?.id === saved.id) setSelectedCompany(saved);
      setEditingCompany(null);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // Drill into company
  if (selectedCompany) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <CompanyDetail
          company={selectedCompany}
          onBack={() => setSelectedCompany(null)}
          onEnterRestaurant={onEnterRestaurant}
        />
      </div>
    );
  }

  // Company list
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase italic tracking-tight">Empresas</h2>
          <p className="text-sm text-slate-400 font-bold mt-1">Clique numa empresa para entrar. Use Editar apenas para alterar os dados.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="shrink-0 px-4 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs hover:bg-orange-500 flex items-center gap-2 transition-all shadow-lg">
          <Plus size={14} /> Nova Empresa
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-xs font-bold uppercase text-center py-20">A carregar...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {companies.map(company => (
            <div key={company.id}
              onClick={() => enterCompany(company)}
              className="group bg-white border border-slate-200 rounded-[2rem] p-8 text-left hover:border-orange-300 hover:shadow-xl transition-all active:scale-95 cursor-pointer">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div className="p-4 rounded-2xl bg-slate-900 text-white group-hover:bg-orange-500 transition-colors shrink-0">
                  <Building2 size={26} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(event) => { event.stopPropagation(); startEdit(company); }}
                    className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-500 uppercase hover:border-orange-300 hover:text-orange-500 transition-all flex items-center gap-1.5"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-orange-400 transition-colors" />
                </div>
              </div>
              <h3 className="font-black text-slate-900 text-xl leading-tight">{company.name}</h3>
              {company.nif && <p className="text-[10px] font-bold text-slate-400 mt-1">NIF {company.nif}</p>}
              <p className="text-[9px] font-black text-slate-400 mt-3 uppercase tracking-widest">
                {company.restaurantCount ?? 0} estabelecimento{(company.restaurantCount ?? 0) !== 1 ? 's' : ''}
              </p>
              <p className="text-[9px] font-black text-orange-500 mt-5 uppercase tracking-widest">
                {(company.restaurantCount ?? 0) === 1 ? 'Entrar no stock' : 'Escolher estabelecimento'}
              </p>
            </div>
          ))}

          {editingCompany && (
            <div className="bg-white border-2 border-slate-900 rounded-[2rem] p-8 space-y-4">
              <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Editar Empresa</p>
              <div className="space-y-3">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  autoFocus onKeyDown={e => e.key === 'Enter' && handleEdit()}
                  placeholder="Nome da empresa *"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <input value={editNif} onChange={e => setEditNif(e.target.value)}
                  placeholder="NIF (opcional)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleEdit} disabled={!editName.trim() || saving}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md">
                  <Check size={14} /> {saving ? 'A guardar...' : 'Guardar'}
                </button>
                <button onClick={() => setEditingCompany(null)}
                  className="py-3 px-4 border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* New company card */}
          {showNew ? (
            <div className="bg-white border-2 border-orange-300 rounded-[2rem] p-8 space-y-4">
              <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Nova Empresa</p>
              <div className="space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Nome da empresa *"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20" />
                <input value={newNif} onChange={e => setNewNif(e.target.value)}
                  placeholder="NIF (opcional)"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!newName.trim() || saving}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md">
                  <Check size={14} /> {saving ? 'A criar...' : 'Criar Empresa'}
                </button>
                <button onClick={() => { setShowNew(false); setNewName(''); setNewNif(''); }}
                  className="py-3 px-4 border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)}
              className="group bg-white border-2 border-dashed border-slate-200 rounded-[2rem] p-8 hover:border-orange-300 hover:bg-orange-50/40 transition-all active:scale-95 flex flex-col items-center justify-center gap-4 min-h-[200px]">
              <div className="p-4 rounded-2xl bg-slate-100 text-slate-400 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                <Plus size={28} />
              </div>
              <span className="text-sm font-black text-slate-400 group-hover:text-orange-500 uppercase transition-colors">Nova Empresa</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanyAdmin;

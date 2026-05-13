import React from 'react';
import { AppUser } from '../types';
import { Mail, Phone, Save, Search, Shield, UserPlus, Users } from 'lucide-react';

interface EmployeesManagementProps {
  users: AppUser[];
  onSave: (user: Partial<AppUser> & { name: string; email: string; password?: string }) => Promise<void>;
}

const EmployeesManagement: React.FC<EmployeesManagementProps> = ({ users, onSave }) => {
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState<Partial<AppUser> & { name: string; email: string; password?: string }>({
    name: '',
    email: '',
    phone: '',
    role: 'funcionario',
    password: ''
  });
  const [isSaving, setIsSaving] = React.useState(false);

  const filtered = users.filter(user =>
    user.name.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase()) ||
    String(user.phone || '').includes(search)
  );

  const edit = (user: AppUser) => {
    setDraft({ ...user, password: '' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        ...draft,
        role: draft.role === 'admin' ? 'admin' : 'funcionario',
        password: draft.password || undefined
      });
      setDraft({ name: '', email: '', phone: '', role: 'funcionario', password: '' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <form onSubmit={submit} className="xl:col-span-4 bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><UserPlus size={22} /></div>
          <div>
            <h3 className="font-black uppercase text-slate-900">Funcionário</h3>
            <p className="text-xs font-bold text-slate-400">Nome, contacto, senha e permissões.</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Nome" value={draft.name} onChange={value => setDraft(prev => ({ ...prev, name: value }))} required />
          <Field label="Email" type="email" value={draft.email} onChange={value => setDraft(prev => ({ ...prev, email: value }))} required />
          <Field label="Telefone" value={draft.phone || ''} onChange={value => setDraft(prev => ({ ...prev, phone: value }))} />
          <Field label={draft.id ? 'Nova senha (opcional)' : 'Senha'} type="password" value={draft.password || ''} onChange={value => setDraft(prev => ({ ...prev, password: value }))} required={!draft.id} />
          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</span>
            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" value={draft.role || 'funcionario'} onChange={event => setDraft(prev => ({ ...prev, role: event.target.value as AppUser['role'] }))}>
              <option value="admin">Admin</option>
              <option value="funcionario">Funcionário</option>
            </select>
          </label>
          <button disabled={isSaving} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-orange-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            <Save size={16} /> {isSaving ? 'A guardar' : 'Guardar'}
          </button>
        </div>
      </form>

      <div className="xl:col-span-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl outline-none shadow-sm font-bold text-sm" placeholder="Pesquisar funcionário..." value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <Users size={18} className="text-orange-500" />
            <h3 className="font-black uppercase text-sm text-slate-900">{filtered.length} funcionários</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(user => (
              <button key={user.id} onClick={() => edit(user)} className="w-full p-5 text-left hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="font-black text-slate-900">{user.name}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs font-bold text-slate-400">
                    <span className="flex items-center gap-1"><Mail size={13} /> {user.email}</span>
                    <span className="flex items-center gap-1"><Phone size={13} /> {user.phone || 'Sem telefone'}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase ${user.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-orange-50 text-orange-600'}`}>
                  <Shield size={12} /> {user.role === 'admin' ? 'Admin' : 'Funcionário'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text', required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) => (
  <label className="space-y-2 block">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <input type={type} required={required} value={value} onChange={event => onChange(event.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
  </label>
);

export default EmployeesManagement;

import React from 'react';
import { RestaurantProfile } from '../types';
import { Save, Store, Hash, Mail, Phone, MapPin, Plus, X } from 'lucide-react';

interface RestaurantSettingsProps {
  profile: RestaurantProfile | null;
  onSave: (profile: RestaurantProfile) => Promise<void>;
}

const DEFAULT_NOTIFICATION_EMAILS = ['geral@mrebelo.com', '517215110@my.toconline.pt'];

const emptyProfile: RestaurantProfile = {
  name: '',
  nif: '',
  legalName: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'Portugal',
  notificationEmails: [...DEFAULT_NOTIFICATION_EMAILS]
};

const RestaurantSettings: React.FC<RestaurantSettingsProps> = ({ profile, onSave }) => {
  const [draft, setDraft] = React.useState<RestaurantProfile>(profile || emptyProfile);
  const [isSaving, setIsSaving] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');
  const [emailError, setEmailError] = React.useState('');

  React.useEffect(() => {
    const loaded = profile || emptyProfile;
    setDraft({
      ...loaded,
      notificationEmails: loaded.notificationEmails && loaded.notificationEmails.length > 0
        ? loaded.notificationEmails
        : [...DEFAULT_NOTIFICATION_EMAILS]
    });
  }, [profile]);

  const update = (key: keyof RestaurantProfile, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Email inválido');
      return;
    }
    const current = draft.notificationEmails || [];
    if (current.includes(email)) {
      setEmailError('Este email já está na lista');
      return;
    }
    setDraft(prev => ({ ...prev, notificationEmails: [...(prev.notificationEmails || []), email] }));
    setNewEmail('');
    setEmailError('');
  };

  const removeEmail = (email: string) => {
    setDraft(prev => ({ ...prev, notificationEmails: (prev.notificationEmails || []).filter(e => e !== email) }));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addEmail(); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        ...draft,
        nif: String(draft.nif || '').replace(/\D/g, '')
      });
    } finally {
      setIsSaving(false);
    }
  };

  const notifEmails = draft.notificationEmails || [];

  return (
    <form onSubmit={submit} className="max-w-5xl mx-auto space-y-6">
      {/* Main profile card */}
      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-orange-50 text-orange-600">
              <Store size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase">Dados do Restaurante</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">Usados para confirmar se cada fatura foi emitida ao restaurante certo.</p>
            </div>
          </div>
          <button
            type="submit"
            disabled={isSaving || !draft.name || !draft.nif}
            className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs hover:bg-orange-500 disabled:opacity-40 flex items-center gap-2"
          >
            <Save size={16} /> {isSaving ? 'A guardar' : 'Guardar'}
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field icon={<Store size={16} />} label="Nome comercial" value={draft.name} onChange={value => update('name', value)} required />
          <Field icon={<Hash size={16} />} label="NIF" value={draft.nif} onChange={value => update('nif', value)} required />
          <Field icon={<Store size={16} />} label="Nome legal" value={draft.legalName || ''} onChange={value => update('legalName', value)} />
          <Field icon={<Mail size={16} />} label="Email" type="email" value={draft.email || ''} onChange={value => update('email', value)} />
          <Field icon={<Phone size={16} />} label="Telefone" value={draft.phone || ''} onChange={value => update('phone', value)} />
          <Field icon={<MapPin size={16} />} label="Morada" value={draft.address || ''} onChange={value => update('address', value)} />
          <Field label="Código postal" value={draft.postalCode || ''} onChange={value => update('postalCode', value)} />
          <Field label="Localidade" value={draft.city || ''} onChange={value => update('city', value)} />
        </div>
      </div>

      {/* Notification emails card */}
      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
            <Mail size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase">Emails de Notificação</h3>
            <p className="text-xs font-bold text-slate-400 mt-1">Estes endereços recebem cópia de cada fatura registada.</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Existing emails as chips */}
          {notifEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {notifEmails.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  <Mail size={12} className="text-slate-400" />
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remover ${email}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-medium italic">Nenhum email configurado.</p>
          )}

          {/* Add new email */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                onKeyDown={handleEmailKeyDown}
                placeholder="novo@email.com"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              />
              {emailError && <p className="text-[10px] font-bold text-red-500">{emailError}</p>}
            </div>
            <button
              type="button"
              onClick={addEmail}
              disabled={!newEmail.trim()}
              className="px-4 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-600 disabled:opacity-30 flex items-center gap-2 self-start"
            >
              <Plus size={15} /> Adicionar
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Prima Enter ou clique em Adicionar. Guarde o formulário para confirmar as alterações.</p>
        </div>
      </div>
    </form>
  );
};

const Field = ({ icon, label, value, onChange, type = 'text', required = false }: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) => (
  <label className="space-y-2">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
      {icon} {label}
    </span>
    <input
      type={type}
      required={required}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
    />
  </label>
);

export default RestaurantSettings;

import React from 'react';
import { RestaurantProfile } from '../types';
import { Save, Store, Hash, Mail, Phone, MapPin } from 'lucide-react';

interface RestaurantSettingsProps {
  profile: RestaurantProfile | null;
  onSave: (profile: RestaurantProfile) => Promise<void>;
}

const emptyProfile: RestaurantProfile = {
  name: '',
  nif: '',
  legalName: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'Portugal'
};

const RestaurantSettings: React.FC<RestaurantSettingsProps> = ({ profile, onSave }) => {
  const [draft, setDraft] = React.useState<RestaurantProfile>(profile || emptyProfile);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(profile || emptyProfile);
  }, [profile]);

  const update = (key: keyof RestaurantProfile, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
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

  return (
    <form onSubmit={submit} className="max-w-5xl mx-auto space-y-6">
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

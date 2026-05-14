
import React, { useState, useRef } from 'react';
import {
  Zap, Droplets, Flame, Wifi, Shield, Home, Calculator, MoreHorizontal,
  Camera, Upload, Check, RefreshCcw, X, Euro
} from 'lucide-react';
import { apiPost } from '../data/apiClient';
import { apiPostForm } from '../data/apiClient';

const CATEGORIES = [
  { id: 'Eletricidade', label: 'Eletricidade', icon: Zap, color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
  { id: 'Água', label: 'Água', icon: Droplets, color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'Gás', label: 'Gás', icon: Flame, color: 'bg-orange-50 text-orange-600 border-orange-200' },
  { id: 'Telecomunicações', label: 'Telecom / Internet', icon: Wifi, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  { id: 'Seguros', label: 'Seguros', icon: Shield, color: 'bg-teal-50 text-teal-600 border-teal-200' },
  { id: 'Rendas', label: 'Rendas', icon: Home, color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'Contabilidade', label: 'Contabilidade', icon: Calculator, color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'Outros', label: 'Outros', icon: MoreHorizontal, color: 'bg-slate-50 text-slate-500 border-slate-200' },
];

interface ExpensesProps {
  onSaved?: () => void;
}

const Expenses: React.FC<ExpensesProps> = ({ onSaved }) => {
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [nif, setNif] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!category) { setError('Escolha uma categoria.'); return; }
    if (!supplier.trim()) { setError('Indique o fornecedor / descrição.'); return; }
    if (!amount || Number(amount) <= 0) { setError('Indique um valor válido.'); return; }
    setError(null);
    setIsSaving(true);

    try {
      let archiveDocumentId: string | undefined;

      // Upload photo if provided
      if (photo) {
        const blob = await (await fetch(photo)).blob();
        const form = new FormData();
        form.append('file', blob, `despesa-${Date.now()}.jpg`);
        form.append('documentType', 'OUTRO');
        const uploaded = await apiPostForm<{ id: string }>('/api/archive/upload', form);
        archiveDocumentId = uploaded.id;
      }

      await apiPost('/api/invoices', {
        supplierName: supplier.trim(),
        supplierNif: nif.replace(/\D/g, '') || undefined,
        docNumber: docNumber.trim() || `DEP-${Date.now()}`,
        totalAmount: Number(amount),
        dateIssued: date,
        expenseCategory: category,
        notes: notes.trim() || undefined,
        archiveDocumentId,
        lines: [], // no stock lines
        imageQualityOk: true,
        hasQrCode: false,
        hasAtcud: false,
        totalValidationStatus: 'NAO_VERIFICADO',
      });

      setSaved(true);
      // Reset form
      setCategory('');
      setSupplier('');
      setNif('');
      setDocNumber('');
      setAmount('');
      setNotes('');
      setPhoto(null);
      setDate(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (e: any) {
      setError(e.message || 'Erro ao registar despesa.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-32">
      <div>
        <h2 className="text-2xl font-black uppercase italic tracking-tight">Nova Despesa</h2>
        <p className="text-sm text-slate-400 font-bold mt-1">Registo de despesas sem entrada em stock — aparece em conta corrente para liquidação.</p>
      </div>

      {/* Category */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all text-center ${active ? cat.color + ' border-current shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
              >
                <Icon size={22} />
                <span className="text-[9px] font-black uppercase leading-tight">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhes</p>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase">Fornecedor / Descrição *</label>
          <input
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
            placeholder="Ex: EEM – Empresa de Electricidade da Madeira"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase">NIF</label>
            <input
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              placeholder="Opcional"
              value={nif}
              onChange={e => setNif(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase">Nº Documento</label>
            <input
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              placeholder="Opcional"
              value={docNumber}
              onChange={e => setDocNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase">Valor *</label>
            <div className="relative">
              <Euro size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-orange-400"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase">Data</label>
            <input
              type="date"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase">Notas</label>
          <input
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
            placeholder="Opcional"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Photo */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento / Recibo (opcional)</p>
        <input type="file" accept="image/*,application/pdf" className="hidden" ref={fileInputRef} onChange={handleFile} />
        {photo ? (
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-video">
            <img src={photo} className="w-full h-full object-contain bg-slate-50" />
            <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { const inp = fileInputRef.current; if (inp) { inp.setAttribute('capture', 'environment'); inp.click(); } }}
              className="p-5 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-2 text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-all"
            >
              <Camera size={24} />
              <span className="text-[9px] font-black uppercase">Fotografar</span>
            </button>
            <button
              onClick={() => { const inp = fileInputRef.current; if (inp) { inp.removeAttribute('capture'); inp.click(); } }}
              className="p-5 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-2 text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-all"
            >
              <Upload size={24} />
              <span className="text-[9px] font-black uppercase">Abrir Ficheiro</span>
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-600 text-sm font-bold">{error}</div>}

      {saved && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-700 text-sm font-black flex items-center gap-3">
          <Check size={18} /> Despesa registada com sucesso!
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-2xl hover:bg-orange-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
      >
        {isSaving ? <><RefreshCcw size={18} className="animate-spin" /> A Registar…</> : <><Check size={18} /> Registar Despesa</>}
      </button>
    </div>
  );
};

export default Expenses;

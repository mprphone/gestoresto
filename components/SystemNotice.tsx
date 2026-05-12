import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface Props {
  type: 'error' | 'success';
  message: string;
  onClose: () => void;
}

const SystemNotice: React.FC<Props> = ({ type, message, onClose }) => (
  <div className={`fixed top-6 right-6 z-[200] max-w-md rounded-2xl border p-4 shadow-2xl flex gap-3 items-start ${
    type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
  }`}>
    {type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
    <p className="flex-1 text-sm font-bold">{message}</p>
    <button onClick={onClose} className="p-1 opacity-50 hover:opacity-100">
      <X size={16} />
    </button>
  </div>
);

export default SystemNotice;

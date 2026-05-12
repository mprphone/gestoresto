
import React from 'react';
import { Supplier } from '../types';
import { UserPlus, Mail, Phone, Hash, MapPin, Building2, Search } from 'lucide-react';

interface SupplierManagementProps {
  suppliers: Supplier[];
}

const SupplierManagement: React.FC<SupplierManagementProps> = ({ suppliers }) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.nif.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Pesquisar fornecedor por nome ou NIF..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none shadow-sm focus:ring-2 focus:ring-orange-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg">
          <UserPlus size={20} /> Adicionar Manualmente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(s => (
          <div key={s.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-orange-50 rounded-2xl text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                <Building2 size={24} />
              </div>
              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-tighter">NIF: {s.nif}</span>
            </div>
            <h3 className="font-black text-slate-800 text-lg mb-4 truncate">{s.name}</h3>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Mail size={16} />
                <span className="truncate">{s.email || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Phone size={16} />
                <span>{s.phone || 'N/A'}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-50 flex gap-2">
              <button className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors">Editar</button>
              <button className="flex-1 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-colors">Ver Compras</button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="p-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300">
          <Building2 size={48} className="mx-auto mb-4 opacity-10" />
          <p className="font-medium">Nenhum fornecedor registado.</p>
        </div>
      )}
    </div>
  );
};

export default SupplierManagement;

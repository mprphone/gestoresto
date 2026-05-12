
import React, { useState } from 'react';
import { Product, Batch } from '../types';
import { Bell, AlertTriangle, Clock, X } from 'lucide-react';

interface AlertsPanelProps {
  products: Product[];
  batches: Batch[];
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ products, batches }) => {
  const [isOpen, setIsOpen] = useState(false);

  const lowStock = products.filter(p => p.currentStock <= p.minStock);
  const expiringSoon = batches.filter(b => {
    const expiry = new Date(b.expiryDate).getTime();
    const now = new Date().getTime();
    const diff = expiry - now;
    return diff > 0 && diff < (7 * 24 * 60 * 60 * 1000); // 7 days
  });

  const totalAlerts = lowStock.length + expiringSoon.length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
      >
        <Bell size={20} className="text-slate-600" />
        {totalAlerts > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
            {totalAlerts}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-30 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h4 className="font-bold text-slate-900">Notificações de Gerência</h4>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto">
              {lowStock.length > 0 && (
                <div className="p-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1">Ruptura de Stock</p>
                  {lowStock.map(p => (
                    <div key={p.id} className="p-3 hover:bg-orange-50 rounded-xl transition-colors flex gap-3">
                      <div className="mt-1"><AlertTriangle className="text-orange-500" size={16} /></div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">Apenas {p.currentStock} {p.unit} disponíveis.</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {expiringSoon.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1">Validades (FEFO)</p>
                  {expiringSoon.map(b => {
                    const product = products.find(p => p.id === b.productId);
                    return (
                      <div key={b.id} className="p-3 hover:bg-blue-50 rounded-xl transition-colors flex gap-3">
                        <div className="mt-1"><Clock className="text-blue-500" size={16} /></div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{product?.name}</p>
                          <p className="text-xs text-slate-500">Expira em {new Date(b.expiryDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {totalAlerts === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-sm">Tudo em ordem no armazém!</p>
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-slate-100 text-center">
               <button className="text-xs font-bold text-orange-500 hover:underline">Ver Histórico Completo</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AlertsPanel;

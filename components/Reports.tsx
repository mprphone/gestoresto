
import React from 'react';
import { Product, Movement } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ReportsProps {
  products: Product[];
  movements: Movement[];
}

const Reports: React.FC<ReportsProps> = ({ products }) => {
  // Mocking price history for visualization
  const priceHistoryData = [
    { name: 'Jan', picanha: 19.50, frango: 4.20, tomate: 2.80 },
    { name: 'Fev', picanha: 20.20, frango: 4.10, tomate: 3.10 },
    { name: 'Mar', picanha: 21.00, frango: 4.35, tomate: 3.50 },
    { name: 'Abr', picanha: 22.50, frango: 4.50, tomate: 3.20 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-bold">Variação de Preços (Últimos 3 Meses)</h3>
            <p className="text-slate-500 text-sm">Acompanhe se os custos dos fornecedores estão a subir.</p>
          </div>
          <div className="flex gap-2">
             <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">Mensal</button>
             <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm">Semanal</button>
          </div>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceHistoryData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} tickFormatter={(val) => `€${val}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey="picanha" name="Picanha (kg)" stroke="#f97316" strokeWidth={3} dot={{r: 6, fill: '#f97316'}} activeDot={{r: 8}} />
              <Line type="monotone" dataKey="frango" name="Frango (kg)" stroke="#3b82f6" strokeWidth={3} dot={{r: 6, fill: '#3b82f6'}} />
              <Line type="monotone" dataKey="tomate" name="Tomate (kg)" stroke="#ef4444" strokeWidth={3} dot={{r: 6, fill: '#ef4444'}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h4 className="font-bold mb-4">Top Aumentos de Custo</h4>
            <div className="space-y-4">
               {[
                 { name: 'Picanha Angus', change: '+15.3%', current: '€ 22.50' },
                 { name: 'Vinho Reserva', change: '+8.2%', current: '€ 12.00' },
                 { name: 'Tomate Cereja', change: '+14.2%', current: '€ 3.20' }
               ].map((item, idx) => (
                 <div key={idx} className="flex justify-between items-center">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <div className="flex gap-4">
                      <span className="text-red-500 font-bold">{item.change}</span>
                      <span className="text-slate-900 font-bold">{item.current}</span>
                    </div>
                 </div>
               ))}
            </div>
         </div>
         <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h4 className="font-bold mb-4">Sugestão de Reajuste de Menu</h4>
            <p className="text-sm text-slate-500 mb-4">Baseado no aumento dos custos de carne, sugerimos os seguintes ajustes:</p>
            <div className="space-y-4">
               <div className="p-3 bg-orange-50 rounded-xl flex justify-between items-center">
                  <span className="text-slate-800 font-medium">Prato de Picanha</span>
                  <span className="text-orange-600 font-bold">€ 18.50 → € 21.00</span>
               </div>
               <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                  <span className="text-slate-800 font-medium">Menu Degustação</span>
                  <span className="text-slate-600 font-bold">€ 45.00 → € 49.00</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Reports;

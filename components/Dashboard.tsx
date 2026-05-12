
import React from 'react';
import { Product, Movement, MovementType } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  AlertTriangle,
  Clock,
  Camera
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  products: Product[];
  movements: Movement[];
}

const Dashboard: React.FC<DashboardProps> = ({ products, movements }) => {
  const totalStockValue = products.reduce((acc, p) => acc + (p.currentStock * p.averagePrice), 0);
  const stockAlerts = products.filter(p => p.currentStock <= p.minStock).length;
  
  const entriesThisMonth = movements
    .filter(m => m.type === MovementType.ENTRY)
    .reduce((acc, m) => acc + (m.quantity * (m.price || 0)), 0);

  const wasteThisMonth = movements
    .filter(m => m.type === MovementType.WASTE)
    .reduce((acc, m) => acc + (m.quantity * (m.price || 0)), 0);

  const recentMovements = [...movements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

  const chartData = [
    { name: 'Seg', val: 400 },
    { name: 'Ter', val: 300 },
    { name: 'Qua', val: 550 },
    { name: 'Qui', val: 480 },
    { name: 'Sex', val: 700 },
    { name: 'Sáb', val: 900 },
    { name: 'Dom', val: 650 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Valor em Stock" 
          value={`${totalStockValue.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`}
          icon={<Package className="text-blue-500" />}
          trend="+2.5%"
          trendUp={true}
        />
        <StatCard 
          title="Avisos de Ruptura" 
          value={stockAlerts.toString()}
          icon={<AlertTriangle className="text-amber-500" />}
          trend="Stock Baixo"
          trendUp={false}
          color="amber"
        />
        <StatCard 
          title="Entradas Totais" 
          value={`${entriesThisMonth.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`}
          icon={<TrendingUp className="text-green-500" />}
          trend="Este Mês"
          trendUp={true}
        />
        <StatCard 
          title="Total Quebras" 
          value={`${wasteThisMonth.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`}
          icon={<TrendingDown className="text-red-500" />}
          trend="Perda"
          trendUp={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black uppercase tracking-widest text-slate-800">Fluxo Semanal</h3>
            <select className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none">
              <option>Esta Semana</option>
              <option>Últimos 30 dias</option>
            </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <YAxis hide />
                <Tooltip />
                <Area type="monotone" dataKey="val" stroke="#f97316" strokeWidth={4} fillOpacity={1} fill="url(#colorVal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-black uppercase tracking-widest text-slate-800 mb-8">Atividade</h3>
          <div className="space-y-5">
            {recentMovements.length > 0 ? recentMovements.map(m => {
              const product = products.find(p => p.id === m.productId);
              return (
                <div key={m.id} className="flex items-center gap-4 group">
                  <div className={`p-3 rounded-2xl flex-shrink-0 ${
                    m.type === MovementType.ENTRY ? 'bg-emerald-50 text-emerald-600' : 
                    m.type === MovementType.EXIT ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {m.photoUrl ? <Camera size={18} /> : <Clock size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate">{product?.name || 'Artigo'}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      {m.type} • {m.quantity} {product?.unit} • {new Date(m.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-20">
                <Package className="mx-auto mb-4 opacity-10" size={48} />
                <p className="text-xs font-bold text-slate-400 uppercase">Sem movimentos</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, trendUp, color = 'white' }: any) => (
  <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-200 transition-all hover:shadow-lg hover:translate-y-[-2px]">
    <div className="flex justify-between items-start mb-6">
      <div className="p-3.5 bg-slate-50 rounded-2xl">{icon}</div>
      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
        {trend}
      </span>
    </div>
    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{title}</p>
    <p className="text-2xl font-black text-slate-900 tracking-tighter">{value}</p>
  </div>
);

export default Dashboard;

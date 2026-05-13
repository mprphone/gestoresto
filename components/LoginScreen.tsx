import React from 'react';
import { KeyRound, LogIn, UtensilsCrossed } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = React.useState('mpr@mpr.pt');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message || 'Email ou senha inválidos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
        <div className="p-8 bg-slate-900 text-white">
          <div className="flex items-center gap-3 mb-8">
            <UtensilsCrossed className="text-orange-500" size={34} />
            <h1 className="font-black text-2xl uppercase italic">GestoRestô</h1>
          </div>
          <h2 className="font-black text-xl uppercase">Entrar</h2>
          <p className="text-xs font-bold text-white/40 mt-1">Acesso de funcionários</p>
        </div>

        <div className="p-8 space-y-5">
          {error && <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold">{error}</div>}
          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
            <input className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-orange-500/20" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</span>
            <input className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-orange-500/20" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
          </label>
          <button disabled={isLoading} className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-slate-900 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {isLoading ? <KeyRound className="animate-pulse" size={18} /> : <LogIn size={18} />} Entrar
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginScreen;

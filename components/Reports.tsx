import React, { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCcw, Send } from 'lucide-react';
import { getReportSummary, getSupplierDebt, ReportSummary } from '../data/reportsRepository';
import { EmailMessage, listEmailMessages, sendEmail } from '../data/emailsRepository';
import { Movement, Product } from '../types';

interface ReportsProps {
  products: Product[];
  movements: Movement[];
}

const money = (value: number) => value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

const Reports: React.FC<ReportsProps> = () => {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [supplierDebt, setSupplierDebt] = useState<Array<{ supplier_name: string; open_invoices: string; pending_amount: string }>>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    setError(null);
    const [summaryData, debtData, emailData] = await Promise.all([
      getReportSummary(),
      getSupplierDebt(),
      listEmailMessages()
    ]);
    setSummary(summaryData);
    setSupplierDebt(debtData.data);
    setEmails(emailData);
  };

  useEffect(() => {
    setIsLoading(true);
    loadReports()
      .catch(err => setError(err.message || 'Falha ao carregar relatórios'))
      .finally(() => setIsLoading(false));
  }, []);

  const emailBody = useMemo(() => {
    if (!summary) return '';
    return [
      'Relatório GestoResto',
      '',
      `Valor em stock: ${money(summary.totalStockValue)}`,
      `Compras do mês: ${money(summary.purchasesThisMonth)}`,
      `Dívida pendente: ${money(summary.totalPending)}`,
      `Quebras do mês: ${money(summary.totalWasteThisMonth)}`,
      `Artigos em alerta: ${summary.lowStockCount}`,
      '',
      'Dívida por fornecedor:',
      ...supplierDebt.slice(0, 10).map(row => `- ${row.supplier_name}: ${money(Number(row.pending_amount || 0))} (${row.open_invoices} faturas)`)
    ].join('\n');
  }, [summary, supplierDebt]);

  const handleSend = async () => {
    if (!recipient || !summary) return;
    setIsSending(true);
    setError(null);
    try {
      await sendEmail({
        recipient,
        subject: `Relatório GestoResto - ${new Date().toLocaleDateString('pt-PT')}`,
        body: emailBody,
        relatedEntityTable: 'reports',
        relatedEntityId: 'daily-summary'
      });
      setRecipient('');
      await loadReports();
    } catch (err: any) {
      setError(err.message || 'Falha ao enviar email');
      await loadReports().catch(() => undefined);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return <div className="bg-white p-10 rounded-3xl border border-slate-200 text-slate-400 font-black uppercase text-xs tracking-widest text-center">A carregar relatórios...</div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl font-bold text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Metric title="Valor em Stock" value={money(summary?.totalStockValue || 0)} />
        <Metric title="Compras do Mês" value={money(summary?.purchasesThisMonth || 0)} />
        <Metric title="Dívida Pendente" value={money(summary?.totalPending || 0)} />
        <Metric title="Alertas Stock" value={String(summary?.lowStockCount || 0)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black uppercase text-slate-900">Dívida por Fornecedor</h3>
            <button onClick={() => loadReports()} className="p-2 text-slate-400 hover:text-orange-600"><RefreshCcw size={18} /></button>
          </div>
          <div className="divide-y divide-slate-50">
            {supplierDebt.map(row => (
              <div key={row.supplier_name} className="p-5 flex justify-between items-center">
                <div>
                  <p className="font-black text-sm text-slate-800">{row.supplier_name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{row.open_invoices} faturas abertas</p>
                </div>
                <p className="font-black text-orange-600">{money(Number(row.pending_amount || 0))}</p>
              </div>
            ))}
            {supplierDebt.length === 0 && <p className="p-10 text-center text-slate-300 font-black uppercase text-xs">Sem dívida registada.</p>}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-black uppercase text-slate-900 flex items-center gap-2"><Mail size={18} /> Envio de Relatório</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Cada tentativa fica registada com estado e confirmação.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex gap-3">
              <input className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" placeholder="email@empresa.pt" value={recipient} onChange={e => setRecipient(e.target.value)} />
              <button disabled={!recipient || isSending} onClick={handleSend} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs hover:bg-orange-500 disabled:opacity-40 flex items-center gap-2">
                {isSending ? <RefreshCcw className="animate-spin" size={16} /> : <Send size={16} />} Enviar
              </button>
            </div>
            <textarea readOnly className="w-full min-h-[190px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600" value={emailBody} />
          </div>
        </section>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-black uppercase text-slate-900">Confirmação de Emails</h3>
        </div>
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-widest font-black text-slate-400 border-b border-slate-100">
            <tr>
              <th className="px-5 py-4">Destinatário</th>
              <th className="px-5 py-4">Assunto</th>
              <th className="px-5 py-4">Estado</th>
              <th className="px-5 py-4">Confirmação</th>
              <th className="px-5 py-4">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {emails.map(email => (
              <tr key={email.id}>
                <td className="px-5 py-4 text-xs font-bold text-slate-700">{email.recipient}</td>
                <td className="px-5 py-4 text-xs font-bold text-slate-700">{email.subject}</td>
                <td className="px-5 py-4"><StatusBadge status={email.status} /></td>
                <td className="px-5 py-4 text-[10px] font-bold text-slate-400 break-all">{email.provider_message_id || email.error_message || (email.status === 'SIMULADO' ? 'SMTP não configurado' : '-')}</td>
                <td className="px-5 py-4 text-[10px] font-bold text-slate-400">{new Date(email.sent_at || email.created_at).toLocaleString('pt-PT')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {emails.length === 0 && <div className="p-12 text-center text-slate-300 font-black uppercase text-xs">Sem emails registados.</div>}
      </section>
    </div>
  );
};

const Metric = ({ title, value }: { title: string; value: string }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{title}</p>
    <p className="text-2xl font-black text-slate-900">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: EmailMessage['status'] }) => {
  const style = status === 'ENVIADO'
    ? 'bg-emerald-50 text-emerald-600'
    : status === 'FALHOU'
      ? 'bg-red-50 text-red-600'
      : status === 'SIMULADO'
        ? 'bg-amber-50 text-amber-600'
        : 'bg-slate-100 text-slate-500';
  return <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${style}`}>{status}</span>;
};

export default Reports;


import React, { useState, useEffect } from 'react';
import { ArchiveDocumentType, Category, Product, Movement, MovementType, Supplier, PurchaseInvoice, InvoiceStatus, DefaultCategories, Payment, ProductAlias, PurchaseInvoiceLine, DigitalArchiveDocument, StockEntryLineInput, RestaurantProfile, AppUser } from './types';
import { listProductsPage, upsertProduct, deleteProduct } from './data/productsRepository';
import { listSuppliersPage } from './data/suppliersRepository';
import { listInvoicesPage, listInvoiceLines, createInvoiceWithLines } from './data/invoicesRepository';
import { listAliasesForSupplier } from './data/productAliasesRepository';
import { listArchiveDocumentsForInvoice, uploadArchiveDocument } from './data/archiveRepository';
import { listMovementsPage, createMovement } from './data/movementsRepository';
import { createBatchPayment, listPayments } from './data/paymentsRepository';
import { getRestaurantProfile, saveRestaurantProfile } from './data/restaurantProfileRepository';
import { listUsers, login, saveUser } from './data/authRepository';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import StockEntry from './components/StockEntry';
import StockMovement from './components/StockMovement';
import Reports from './components/Reports';
import AlertsPanel from './components/AlertsPanel';
import ProductCatalog from './components/ProductCatalog';
import SupplierManagement from './components/SupplierManagement';
import PurchasesList from './components/PurchasesList';
import EquivalencesManagement from './components/EquivalencesManagement';
import SystemNotice from './components/SystemNotice';
import RestaurantSettings from './components/RestaurantSettings';
import LoginScreen from './components/LoginScreen';
import EmployeesManagement from './components/EmployeesManagement';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle, 
  ArrowRightLeft, 
  BarChart3, 
  UtensilsCrossed,
  BookOpen,
  Building2,
  Wallet,
  Link2,
  Store,
  Users,
  LogOut
} from 'lucide-react';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(DefaultCategories);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<PurchaseInvoiceLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [productAliases, setProductAliases] = useState<ProductAlias[]>([]);
  const [archiveDocuments, setArchiveDocuments] = useState<DigitalArchiveDocument[]>([]);
  const [restaurantProfile, setRestaurantProfile] = useState<RestaurantProfile | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem('gestoresto_user');
    return saved ? JSON.parse(saved) : null;
  });
  const isFuncionario = currentUser?.role === 'funcionario';
  const [activeTab, setActiveTab] = useState<'dash' | 'inv' | 'entry' | 'move' | 'rep' | 'catalog' | 'suppliers' | 'finance' | 'equiv' | 'restaurant' | 'employees'>(() =>
    currentUser?.role === 'funcionario' ? 'entry' : 'dash'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const runAction = async (work: () => Promise<void>, successMessage?: string) => {
    try {
      await work();
      if (successMessage) setNotice({ type: 'success', message: successMessage });
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message || 'Operação falhou. Os dados anteriores foram preservados.' });
    }
  };

  const refreshData = async () => {
    setLoadError(null);
    const [productsPage, suppliersPage, invoicesPage, aliasesPage, movementsPage, paymentRows, profile, userRows] = await Promise.all([
      listProductsPage({ pageSize: 500 }),
      listSuppliersPage({ pageSize: 500 }),
      listInvoicesPage({ pageSize: 500 }),
      listAliasesForSupplier(undefined, { pageSize: 1000 }),
      listMovementsPage({ pageSize: 500 }),
      listPayments(),
      getRestaurantProfile(),
      listUsers()
    ]);

    setProducts(productsPage.data);
    setSuppliers(suppliersPage.data);
    setInvoices(invoicesPage.data);
    setProductAliases(aliasesPage.data);
    setMovements(movementsPage.data);
    setPayments(paymentRows);
    setRestaurantProfile(profile);
    setUsers(userRows);
    setCategories(Array.from(new Set([...DefaultCategories, ...productsPage.data.map(p => p.category)])));

    const lineGroups = await Promise.all(invoicesPage.data.slice(0, 100).map(inv => listInvoiceLines(inv.id)));
    const archiveGroups = await Promise.all(invoicesPage.data.slice(0, 100).map(inv => listArchiveDocumentsForInvoice(inv.id, { pageSize: 20 })));
    setInvoiceLines(lineGroups.flat());
    setArchiveDocuments(archiveGroups.flatMap(group => group.data));
  };

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    refreshData()
      .catch(error => setLoadError(error.message || 'Falha ao carregar dados'))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  const handleLogin = async (email: string, password: string) => {
    const user = await login(email, password);
    setCurrentUser(user);
    localStorage.setItem('gestoresto_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    localStorage.removeItem('gestoresto_user');
    setCurrentUser(null);
    setProducts([]);
    setInvoices([]);
    setUsers([]);
  };

  const handleCreateProduct = async (data: any) => {
    const draft: Product = {
      name: data.name || 'Novo Artigo Sem Nome',
      category: data.category || 'Outros',
      unit: data.unit || 'un',
      minStock: data.minStock || 0,
      id: data.id || crypto.randomUUID(),
      currentStock: 0, 
      averagePrice: 0, 
      lastUpdated: new Date().toISOString() 
    };
    try {
      const saved = await upsertProduct(draft);
      setProducts(prev => [...prev.filter(p => p.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice({ type: 'success', message: 'Artigo criado.' });
      return saved;
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message || 'Não foi possível criar o artigo.' });
      throw error;
    }
  };

  const handleUpdateProduct = async (id: string, data: Partial<Product>) => {
    const current = products.find(p => p.id === id);
    if (!current) return;
    await runAction(async () => {
      const saved = await upsertProduct({ ...current, ...data, lastUpdated: new Date().toISOString() });
      setProducts(prev => prev.map(p => p.id === id ? saved : p));
    }, 'Artigo atualizado.');
  };

  const handleDeleteProduct = async (id: string) => {
    if(confirm("Tem a certeza que deseja remover este artigo do catálogo?")) {
      await runAction(async () => {
        await deleteProduct(id);
        setProducts(prev => prev.filter(p => p.id !== id));
      }, 'Artigo removido.');
    }
  };

  const handleAddCategory = (name: string) => {
    if (!categories.includes(name)) {
      setCategories(prev => [...prev, name]);
    }
  };

  const handleStockEntry = async (items: StockEntryLineInput[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any, photoUrls?: string[]) => {
    const supplierNif = String(supplierData?.nif || '').replace(/\D/g, '');
    const isDup = invoices.some(inv => inv.docNumber === invoiceData.docNumber && inv.supplierNif.replace(/\D/g, '') === supplierNif);
    if (isDup) {
      alert("Aviso: Esta fatura já foi registada anteriormente!");
      return;
    }

    let archiveDocument: DigitalArchiveDocument | undefined;
    const invoicePhotos = photoUrls?.length ? photoUrls : (photoUrl ? [photoUrl] : []);
    const archiveDocuments: DigitalArchiveDocument[] = [];
    if (invoicePhotos.length > 0) {
      for (const [index, dataUrl] of invoicePhotos.entries()) {
        const mime = /data:(.*?);base64/.exec(dataUrl)?.[1] || 'image/jpeg';
        const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
        const savedDocument = await uploadArchiveDocument({
          dataUrl,
          filename: `${supplierNif || 'sem-nif'}-${invoiceData?.docNumber || 'sn'}-pag-${index + 1}.${extension}`,
          documentType: ArchiveDocumentType.INVOICE,
          qualityOk: invoiceData?.digitalCompliance?.imageQualityOk,
          hasQrCode: invoiceData?.digitalCompliance?.hasQrCode,
          hasAtcud: invoiceData?.digitalCompliance?.hasAtcud,
          atcud: invoiceData?.digitalCompliance?.atcud,
          notes: invoiceData?.digitalCompliance?.complianceNotes
        });
        archiveDocuments.push(savedDocument);
      }
      archiveDocument = archiveDocuments[0];
    }

    const lines = items.map((item, idx) => {
      const product = products.find(p => p.id === item.productId);
      return {
        lineNumber: idx + 1,
        productId: item.productId,
        productAliasId: item.aliasId,
        originalName: item.name,
        supplierItemCode: item.supplierItemCode,
        quantityOriginal: item.quantity,
        unitOriginal: item.unitOriginal || item.unitStock || product?.unit || 'un',
        conversionFactor: item.conversionFactor || 1,
        quantityStock: item.quantityStock ?? item.quantity,
        unitStock: item.unitStock || product?.unit || 'un',
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatRate: item.vatRate,
        expiryDate: item.expiryDate,
        confidence: item.confidence
      };
    });

    await runAction(async () => {
      await createInvoiceWithLines({
      supplierName: supplierData?.name || 'Fornecedor',
      supplierNif,
      supplierEmail: supplierData?.email,
      supplierPhone: supplierData?.phone,
      customerName: invoiceData?.customerName,
      customerNif: invoiceData?.customerNif,
      docNumber: invoiceData?.docNumber || 'S/N',
      totalAmount: invoiceData?.totalAmount || 0,
      dateIssued: new Date().toISOString().split('T')[0],
      status: InvoiceStatus.PENDING,
      paidAmount: 0,
      archiveDocumentId: archiveDocument?.id,
      archiveDocumentIds: archiveDocuments.map(doc => doc.id),
      hasQrCode: invoiceData?.digitalCompliance?.hasQrCode,
      hasAtcud: invoiceData?.digitalCompliance?.hasAtcud,
      atcud: invoiceData?.digitalCompliance?.atcud,
      imageQualityOk: invoiceData?.digitalCompliance?.imageQualityOk,
      isMissingPages: invoiceData?.digitalCompliance?.isMissingPages,
      qrCodeText: invoiceData?.qrCodeText,
      qrTotalAmount: invoiceData?.qrTotalAmount,
      calculatedLinesTotal: invoiceData?.calculatedLinesTotal,
      totalValidationStatus: invoiceData?.totalValidationStatus,
      totalValidationNotes: invoiceData?.totalValidationNotes,
      complianceNotes: invoiceData?.digitalCompliance?.complianceNotes,
      ocrJson: invoiceData,
      lines
      });
      await refreshData();
      setActiveTab('inv');
    }, 'Fatura guardada com arquivo, linhas e stock atualizados.');
  };

  const handleSaveRestaurantProfile = async (profile: RestaurantProfile) => {
    await runAction(async () => {
      const saved = await saveRestaurantProfile(profile);
      setRestaurantProfile(saved);
      await refreshData();
    }, 'Dados do restaurante guardados.');
  };

  const handleSaveUser = async (user: Partial<AppUser> & { name: string; email: string; password?: string }) => {
    await runAction(async () => {
      const saved = await saveUser(user);
      setUsers(prev => [...prev.filter(u => u.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    }, 'Funcionário guardado.');
  };

  const handleStockMovement = async (productId: string, qty: number, type: MovementType, photoUrl?: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (type !== MovementType.ENTRY && product.currentStock < qty) {
      alert(`Erro: Stock insuficiente de ${product.name}!`);
      return;
    }
    await runAction(async () => {
      await createMovement({ productId, type, quantity: qty, price: product.averagePrice, photoUrl });
      await refreshData();
    }, 'Movimento guardado.');
  };

  const handleMarkAsPaid = async (
    ids: string[],
    paymentDetails: { date: string; method: Payment['method']; account?: string; amount?: number; notes?: string; proofDataUrl?: string }
  ) => {
    // Distribuição simples: se amount não for fornecido, assume pagamento total de cada fatura.
    // Se for fornecido e houver múltiplas faturas, aplica ao total por ordem (FIFO) até esgotar.
    let remaining = typeof paymentDetails.amount === 'number' ? paymentDetails.amount : undefined;

    let proofArchive: DigitalArchiveDocument | undefined;
    if (paymentDetails.proofDataUrl) {
      proofArchive = await uploadArchiveDocument({
        dataUrl: paymentDetails.proofDataUrl,
        filename: `comprovativo-${Date.now()}.jpg`,
        documentType: ArchiveDocumentType.PAYMENT_PROOF
      });
    }
    await runAction(async () => {
      await createBatchPayment({
      invoiceIds: ids,
      datePaid: paymentDetails.date,
      method: paymentDetails.method,
      account: paymentDetails.account,
      amount: remaining,
      notes: paymentDetails.notes,
      proofUrl: proofArchive?.publicUrl,
      archiveDocumentId: proofArchive?.id
      });
      await refreshData();
    }, 'Pagamento registado.');
  };

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {notice && <SystemNotice type={notice.type} message={notice.message} onClose={() => setNotice(null)} />}
      <aside className="hidden md:flex w-72 bg-slate-900 text-white flex-col sticky top-0 h-screen overflow-y-auto no-scrollbar">
        <div className="p-8 flex items-center gap-3">
          <UtensilsCrossed className="text-orange-500 w-8 h-8" />
          <h1 className="font-black text-2xl tracking-tighter uppercase italic">GestoRestô</h1>
        </div>
        {isFuncionario ? (
          <nav className="flex-1 px-6 space-y-1">
            <NavItem icon={<PlusCircle />} label="Nova Fatura" active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} />
            <NavItem icon={<ArrowRightLeft />} label="Saída / Quebra" active={activeTab === 'move'} onClick={() => setActiveTab('move')} />
          </nav>
        ) : (
          <nav className="flex-1 px-6 space-y-1">
            <NavItem icon={<LayoutDashboard />} label="Dashboard" active={activeTab === 'dash'} onClick={() => setActiveTab('dash')} />
            <NavItem icon={<Package />} label="Stock Central" active={activeTab === 'inv'} onClick={() => setActiveTab('inv')} />
            <NavItem icon={<ArrowRightLeft />} label="Saída / Quebra" active={activeTab === 'move'} onClick={() => setActiveTab('move')} />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-8 mb-2 px-5 text-center">Gestão IA</p>
            <NavItem icon={<PlusCircle />} label="Nova Fatura" active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} />
            <NavItem icon={<Wallet />} label="Pagamentos" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
            <NavItem icon={<Building2 />} label="Fornecedores" active={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')} />
            <NavItem icon={<Store />} label="Restaurante" active={activeTab === 'restaurant'} onClick={() => setActiveTab('restaurant')} />
            {currentUser.role === 'admin' && <NavItem icon={<Users />} label="Funcionários" active={activeTab === 'employees'} onClick={() => setActiveTab('employees')} />}
            <NavItem icon={<BookOpen />} label="Catálogo" active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')} />
            <NavItem icon={<Link2 />} label="Equivalências" active={activeTab === 'equiv'} onClick={() => setActiveTab('equiv')} />
            <NavItem icon={<BarChart3 />} label="Análises" active={activeTab === 'rep'} onClick={() => setActiveTab('rep')} />
          </nav>
        )}
        <div className="p-6 border-t border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{currentUser.name}</p>
          {isFuncionario && <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mb-2">Funcionário</p>}
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-bold text-sm">
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-6 flex justify-between items-center sticky top-0 z-50">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
            {activeTab === 'entry' ? "Entrada IA no Stock" : activeTab.toUpperCase()}
          </h2>
          <div className="flex items-center gap-3">
            {isFuncionario && <span className="hidden sm:inline text-[10px] font-black text-orange-500 uppercase tracking-widest border border-orange-200 bg-orange-50 rounded-lg px-2 py-1">{currentUser.name}</span>}
            {!isFuncionario && <AlertsPanel products={products} batches={[]} invoices={invoices} restaurantProfile={restaurantProfile} />}
          </div>
        </header>

        <div className="p-6 md:p-10 flex-1 pb-32">
          {isLoading && <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-400 font-black uppercase text-xs tracking-widest">A carregar dados do PostgreSQL...</div>}
          {loadError && <div className="bg-red-50 border border-red-100 rounded-3xl p-6 text-red-600 font-bold text-sm mb-6">{loadError}</div>}
          {!isLoading && !loadError && <>
          {activeTab === 'entry' && <StockEntry products={products} suppliers={suppliers} invoices={invoices} productAliases={productAliases} onComplete={handleStockEntry} onQuickCreateProduct={handleCreateProduct} categories={categories} />}
          {activeTab === 'move' && <StockMovement products={products} movements={movements} onTransfer={handleStockMovement} categories={categories} hideStock={isFuncionario} />}
          {!isFuncionario && <>
            {activeTab === 'dash' && <Dashboard products={products} movements={movements} />}
            {activeTab === 'inv' && <InventoryList products={products} movements={movements} categories={categories} onUpdateProduct={handleUpdateProduct} />}
            {activeTab === 'suppliers' && <SupplierManagement suppliers={suppliers} />}
            {activeTab === 'restaurant' && <RestaurantSettings profile={restaurantProfile} onSave={handleSaveRestaurantProfile} />}
            {activeTab === 'employees' && <EmployeesManagement users={users} onSave={handleSaveUser} />}
            {activeTab === 'finance' && <PurchasesList invoices={invoices} invoiceLines={invoiceLines} products={products} archiveDocuments={archiveDocuments} payments={payments} onMarkAsPaid={handleMarkAsPaid} />}
            {activeTab === 'catalog' && (
              <ProductCatalog
                products={products}
                onAddProduct={handleCreateProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                categories={categories}
                onAddCategory={handleAddCategory}
              />
            )}
            {activeTab === 'equiv' && <EquivalencesManagement products={products} suppliers={suppliers} aliases={productAliases} onChanged={refreshData} />}
            {activeTab === 'rep' && <Reports products={products} movements={movements} />}
          </>}
          </>}
        </div>

        {/* Mobile bottom nav — only for funcionario (sidebar is hidden on mobile) */}
        {isFuncionario && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={() => setActiveTab('entry')}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'entry' ? 'text-orange-500' : 'text-slate-400'}`}
            >
              <PlusCircle size={22} />
              Nova Fatura
            </button>
            <button
              onClick={() => setActiveTab('move')}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'move' ? 'text-orange-500' : 'text-slate-400'}`}
            >
              <ArrowRightLeft size={22} />
              Saída / Quebra
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase text-slate-300"
            >
              <LogOut size={22} />
              Sair
            </button>
          </nav>
        )}
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-orange-500 text-white shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {React.cloneElement(icon as React.ReactElement, { size: 22 })}
    <span>{label}</span>
  </button>
);

export default App;

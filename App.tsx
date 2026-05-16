
import React, { useState, useEffect } from 'react';
import { ArchiveDocumentType, Category, Product, Movement, MovementType, Supplier, PurchaseInvoice, InvoiceStatus, DefaultCategories, Payment, ProductAlias, PurchaseInvoiceLine, DigitalArchiveDocument, StockEntryLineInput, RestaurantProfile, AppUser, Restaurant } from './types';
import { listProductsPage, upsertProduct, deleteProduct } from './data/productsRepository';
import { listSuppliersPage } from './data/suppliersRepository';
import { listInvoicesPage, listInvoiceLines, createInvoiceWithLines } from './data/invoicesRepository';
import { listAliasesForSupplier } from './data/productAliasesRepository';
import { deleteUnlinkedArchiveDocument, listArchiveDocumentsForInvoice, uploadArchiveDocument } from './data/archiveRepository';
import { listMovementsPage, createMovementGuia } from './data/movementsRepository';
import { createBatchPayment, listPayments } from './data/paymentsRepository';
import { getRestaurantProfile, saveRestaurantProfile } from './data/restaurantProfileRepository';
import { getUserContext, listUsers, login, saveUser } from './data/authRepository';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import StockEntry from './components/StockEntry';
import StockMovement, { CartItem } from './components/StockMovement';
import Reports from './components/Reports';
import AlertsPanel from './components/AlertsPanel';
import ProductCatalog from './components/ProductCatalog';
import SupplierManagement from './components/SupplierManagement';
import PurchasesList from './components/PurchasesList';
import EquivalencesManagement from './components/EquivalencesManagement';
import SystemNotice from './components/SystemNotice';
import LoginScreen from './components/LoginScreen';
import InvoiceReview from './components/InvoiceReview';
import Expenses from './components/Expenses';
import CompanyAdmin from './components/CompanyAdmin';
import RestaurantSelector from './components/RestaurantSelector';
import UserMenu from './components/UserMenu';
import { listPendingInvoices, listPendingGuias, subscribePush, getVapidPublicKey } from './data/reviewRepository';
import { switchRestaurant } from './data/companiesRepository';
import { setAuthRestaurant, getAuthRestaurant } from './data/apiClient';
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
  LogOut,
  ClipboardCheck,
  Receipt,
  Settings
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
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [userRestaurants, setUserRestaurants] = useState<Restaurant[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dash' | 'inv' | 'entry' | 'move' | 'rep' | 'catalog' | 'suppliers' | 'finance' | 'equiv' | 'review' | 'expenses' | 'companies'>('dash');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const activeRestaurantProfile: RestaurantProfile | null = restaurantProfile || (currentRestaurant ? {
    id: currentRestaurant.id,
    name: currentRestaurant.name,
    nif: currentRestaurant.nif || '',
    legalName: currentRestaurant.legalName,
    email: currentRestaurant.email,
    phone: currentRestaurant.phone,
    address: currentRestaurant.address,
    postalCode: currentRestaurant.postalCode,
    city: currentRestaurant.city,
    country: currentRestaurant.country,
    notificationEmails: currentRestaurant.notificationEmails
  } : null);

  const runAction = async (work: () => Promise<void>, successMessage?: string) => {
    try {
      await work();
      if (successMessage) setNotice({ type: 'success', message: successMessage });
      return true;
    } catch (error: any) {
      setNotice({ type: 'error', message: error.message || 'Operação falhou. Os dados anteriores foram preservados.' });
      return false;
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.type === 'success' ? 4500 : 9000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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

  // On startup: restore restaurant context for already-logged-in users
  useEffect(() => {
    if (!currentUser) { setRestaurantsLoading(false); return; }
    getUserContext(currentUser.id)
      .then(({ restaurants, currentRestaurant: savedRestaurant }) => {
        setUserRestaurants(restaurants);
        const savedId = getAuthRestaurant();
        const localRestaurant = restaurants.find(r => r.id === savedId);
        const current = savedRestaurant || localRestaurant || null;
        setCurrentRestaurant(current);
        if (current) {
          setAuthRestaurant(current.id);
          if (!savedRestaurant && localRestaurant) {
            switchRestaurant(currentUser.id, localRestaurant.id).catch(() => undefined);
          }
        }
      })
      .catch(() => {})
      .finally(() => setRestaurantsLoading(false));
  }, [currentUser?.id]);

  // Load operational data only after restaurant is selected
  useEffect(() => {
    if (!currentUser || !currentRestaurant) { setIsLoading(false); return; }
    setIsLoading(true);
    refreshData()
      .catch(error => setLoadError(error.message || 'Falha ao carregar dados'))
      .finally(() => setIsLoading(false));
  }, [currentUser?.id, currentRestaurant?.id]);

  // Service worker + push subscription (admins only)
  useEffect(() => {
    if (!currentUser || isFuncionario) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.register('/sw.js').then(async reg => {
      // Handle notification click → navigate to review tab
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'navigate' && e.data.url?.includes('review')) setActiveTab('review');
      });

      // Request permission and subscribe
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      try {
        const publicKey = await getVapidPublicKey();
        if (!publicKey) return;
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey
        });
        await subscribePush(sub, currentUser.id);
      } catch (e) {
        console.warn('Push subscribe failed:', e);
      }
    }).catch(e => console.warn('SW register failed:', e));
  }, [currentUser?.id]);

  // Poll pending review count for badge (admins only, every 60s)
  useEffect(() => {
    if (!currentUser || isFuncionario || !currentRestaurant) {
      setPendingReviewCount(0);
      return;
    }
    let cancelled = false;
    setPendingReviewCount(0);
    const refresh = () => Promise.all([listPendingInvoices(), listPendingGuias()])
      .then(([inv, g]) => { if (!cancelled) setPendingReviewCount(inv.length + g.length); })
      .catch(() => { if (!cancelled) setPendingReviewCount(0); });
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser?.id, isFuncionario, currentRestaurant?.id]);

  const handleLogin = async (email: string, password: string) => {
    const { user, restaurants, currentRestaurant: savedRestaurant } = await login(email, password);
    setCurrentUser(user);
    localStorage.setItem('gestoresto_user', JSON.stringify(user));
    setUserRestaurants(restaurants);
    setRestaurantsLoading(false);
    const localRestaurant = restaurants.find(r => r.id === getAuthRestaurant());
    const current = savedRestaurant || localRestaurant || null;
    setCurrentRestaurant(current);
    if (current) {
      setAuthRestaurant(current.id);
      if (!savedRestaurant && localRestaurant) {
        switchRestaurant(user.id, localRestaurant.id).catch(() => undefined);
      }
    }
  };

  const handleSelectRestaurant = async (restaurant: Restaurant) => {
    if (!currentUser) return;
    let selected = restaurant;
    try { selected = await switchRestaurant(currentUser.id, restaurant.id); } catch { /* ignore */ }
    setCurrentRestaurant(selected);
    setAuthRestaurant(restaurant.id);
    setActiveTab('dash');
  };

  const handleEnterRestaurantStock = async (restaurant: Restaurant) => {
    if (!currentUser) return;
    let selected = restaurant;
    try { selected = await switchRestaurant(currentUser.id, restaurant.id); } catch { /* ignore */ }
    setCurrentRestaurant(selected);
    setAuthRestaurant(restaurant.id);
    setActiveTab('inv');
  };

  const handleLogout = () => {
    localStorage.removeItem('gestoresto_user');
    localStorage.removeItem('gestoresto_restaurant_id');
    setCurrentUser(null);
    setCurrentRestaurant(null);
    setUserRestaurants([]);
    setRestaurantsLoading(true);
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

    const saved = await runAction(async () => {
      await createInvoiceWithLines({
      supplierName: supplierData?.name || 'Fornecedor',
      supplierNif,
      supplierEmail: supplierData?.email,
      supplierPhone: supplierData?.phone,
      customerName: invoiceData?.customerName,
      customerNif: invoiceData?.customerNif,
      docNumber: invoiceData?.docNumber || 'S/N',
      documentType: invoiceData?.documentType,
      totalAmount: invoiceData?.totalAmount || 0,
      dateIssued: invoiceData?.dateIssued || new Date().toISOString().split('T')[0],
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
      aiUsage: invoiceData?.aiUsage,
      ocrJson: invoiceData,
      lines
      });
      await refreshData();
    }, 'Fatura guardada com arquivo, linhas e stock atualizados.');
    if (!saved && archiveDocuments.length > 0) {
      await Promise.allSettled(archiveDocuments.map(doc => deleteUnlinkedArchiveDocument(doc.id)));
    }
    return saved;
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

  const handleMovementGuia = async (cart: CartItem[], movementType: MovementType) => {
    await runAction(async () => {
      await createMovementGuia(
        cart.map(item => ({ productId: item.productId, quantity: item.qty, photoUrl: item.photoUrl })),
        movementType
      );
      await refreshData();
    }, 'Guia enviada para aprovação do administrador.');
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
    const saved = await runAction(async () => {
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
    if (!saved && proofArchive?.id) {
      await deleteUnlinkedArchiveDocument(proofArchive.id).catch(() => undefined);
    }
  };

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!currentRestaurant) {
    return (
      <RestaurantSelector
        restaurants={userRestaurants}
        userName={currentUser.name}
        loading={restaurantsLoading}
        onSelect={handleSelectRestaurant}
        onLogout={handleLogout}
      />
    );
  }

  if (isAdmin && activeTab === 'companies') {
    return (
      <div className="min-h-screen bg-slate-50">
        {notice && <SystemNotice type={notice.type} message={notice.message} onClose={() => setNotice(null)} />}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="text-orange-500 w-7 h-7" />
            <div>
              <h1 className="font-black text-lg tracking-tighter uppercase italic text-slate-900">GestoRestô</h1>
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{currentRestaurant.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('dash')}
              className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase hover:bg-orange-500 transition-colors"
            >
              Voltar ao restaurante
            </button>
            <button onClick={handleLogout} className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-500 text-xs font-black uppercase hover:text-slate-900 transition-colors">
              Sair
            </button>
          </div>
        </header>
        <main className="p-6 md:p-10">
          <CompanyAdmin onEnterRestaurant={handleEnterRestaurantStock} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {notice && <SystemNotice type={notice.type} message={notice.message} onClose={() => setNotice(null)} />}
      <aside className="hidden md:flex w-72 bg-slate-900 text-white flex-col sticky top-0 h-screen overflow-y-auto no-scrollbar">
        <div className="p-8 flex items-center gap-3">
          <UtensilsCrossed className="text-orange-500 w-8 h-8" />
          <div className="min-w-0">
            <h1 className="font-black text-2xl tracking-tighter uppercase italic">GestoRestô</h1>
            {currentRestaurant.companyName && currentRestaurant.companyName !== currentRestaurant.name && (
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">{currentRestaurant.companyName}</p>
            )}
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest truncate">{currentRestaurant.name}</p>
          </div>
        </div>
        <nav className="flex-1 px-6 space-y-1">
            <NavItem icon={<LayoutDashboard />} label="Dashboard" active={activeTab === 'dash'} onClick={() => setActiveTab('dash')} />
            <NavItem icon={<Package />} label="Stock Central" active={activeTab === 'inv'} onClick={() => setActiveTab('inv')} />
            <NavItem icon={<ArrowRightLeft />} label="Saída / Quebra" active={activeTab === 'move'} onClick={() => setActiveTab('move')} />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-6 mb-2 px-5 text-center">Gestão IA</p>
            <NavItem icon={<PlusCircle />} label="Nova Fatura" active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} />
            <NavItem icon={<ClipboardCheck />} label="Rever Faturas" active={activeTab === 'review'} onClick={() => setActiveTab('review')} badge={pendingReviewCount} />
            <NavItem icon={<Receipt />} label="Despesas" active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} />
            <NavItem icon={<Wallet />} label="Pagamentos" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
            <NavItem icon={<Building2 />} label="Fornecedores" active={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')} />
            <NavItem icon={<BookOpen />} label="Catálogo" active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')} />
            <NavItem icon={<Link2 />} label="Equivalências" active={activeTab === 'equiv'} onClick={() => setActiveTab('equiv')} />
            <NavItem icon={<BarChart3 />} label="Análises" active={activeTab === 'rep'} onClick={() => setActiveTab('rep')} />
          </nav>
        <div className="p-6 border-t border-slate-800">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{currentUser.name}</p>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('companies')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm mb-1 text-slate-500 hover:text-white hover:bg-slate-800"
            >
              <Settings size={16} /> Administração
            </button>
          )}
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
            <div className="hidden sm:block text-right">
              {currentRestaurant.companyName && currentRestaurant.companyName !== currentRestaurant.name && (
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Empresa: {currentRestaurant.companyName}</p>
              )}
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Restaurante: {currentRestaurant.name}</p>
            </div>
            {!isFuncionario && <AlertsPanel products={products} batches={[]} invoices={invoices} restaurantProfile={restaurantProfile} />}
            <UserMenu
              user={currentUser}
              currentRestaurant={currentRestaurant}
              canSwitch={userRestaurants.length > 1}
              onSwitchRestaurant={() => setCurrentRestaurant(null)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <div className="p-6 md:p-10 flex-1 pb-32">
          {isLoading && <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-400 font-black uppercase text-xs tracking-widest">A carregar dados do PostgreSQL...</div>}
          {loadError && <div className="bg-red-50 border border-red-100 rounded-3xl p-6 text-red-600 font-bold text-sm mb-6">{loadError}</div>}
          {!isLoading && !loadError && <>
          {activeTab === 'dash' && <Dashboard products={products} movements={movements} />}
          {activeTab === 'inv' && <InventoryList products={products} movements={movements} categories={categories} onUpdateProduct={handleUpdateProduct} />}
          {activeTab === 'entry' && <StockEntry products={products} suppliers={suppliers} invoices={invoices} productAliases={productAliases} onComplete={handleStockEntry} onQuickCreateProduct={handleCreateProduct} categories={categories} restaurantProfile={activeRestaurantProfile} />}
          {activeTab === 'move' && <StockMovement products={products} movements={movements} onFinalize={handleMovementGuia} categories={categories} hideStock={isFuncionario} />}
          {activeTab === 'review' && currentUser && currentRestaurant && (
            <InvoiceReview
              key={currentRestaurant.id}
              currentUser={currentUser}
              restaurantId={currentRestaurant.id}
              onReviewed={() => setPendingReviewCount(c => Math.max(0, c - 1))}
            />
          )}
          {activeTab === 'expenses' && <Expenses onSaved={refreshData} restaurantProfile={restaurantProfile} />}
          {activeTab === 'finance' && <PurchasesList invoices={invoices} invoiceLines={invoiceLines} products={products} archiveDocuments={archiveDocuments} payments={payments} onMarkAsPaid={handleMarkAsPaid} />}
          {activeTab === 'suppliers' && <SupplierManagement suppliers={suppliers} />}
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
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex pb-[env(safe-area-inset-bottom)]">
          <button
            onClick={() => setActiveTab('dash')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'dash' ? 'text-orange-500' : 'text-slate-400'}`}
          >
            <LayoutDashboard size={22} />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('entry')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'entry' ? 'text-orange-500' : 'text-slate-400'}`}
          >
            <PlusCircle size={22} />
            Fatura
          </button>
          <button
            onClick={() => setActiveTab('move')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'move' ? 'text-orange-500' : 'text-slate-400'}`}
          >
            <ArrowRightLeft size={22} />
            Saída
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase transition-colors ${activeTab === 'expenses' ? 'text-orange-500' : 'text-slate-400'}`}
          >
            <Receipt size={22} />
            Despesas
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-black uppercase text-slate-300"
          >
            <LogOut size={22} />
            Sair
          </button>
        </nav>
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick, badge }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-orange-500 text-white shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {React.cloneElement(icon as React.ReactElement, { size: 22 })}
    <span className="flex-1 text-left">{label}</span>
    {badge > 0 && <span className="min-w-[22px] h-[22px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">{badge}</span>}
  </button>
);

export default App;

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FiscalProvider, useFiscal } from './context/FiscalContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { FloatingAssistant } from './components/layout/FloatingAssistant';
import { CfdiDetailModal } from './components/shared/CfdiDetailModal';
import { PdfRepresentationModal } from './components/shared/PdfRepresentationModal';

import { EmpresasPage } from './pages/EmpresasPage';
import { EfirmaPage } from './pages/EfirmaPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { SincronizacionPage } from './pages/SincronizacionPage';
import { CfdisPage } from './pages/CfdisPage';
import { DashboardPage } from './pages/DashboardPage';
import { IvaPage } from './pages/IvaPage';
import { IsrPage } from './pages/IsrPage';
import { VisorSatPage } from './pages/VisorSatPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { IndicadoresPage } from './pages/IndicadoresPage';
import { ContablePage } from './pages/ContablePage';
import { VinculacionesPage } from './pages/VinculacionesPage';
import { ConsumoPage } from './pages/ConsumoPage';
import { AsistentePage } from './pages/AsistentePage';
import { LoginPage } from './pages/LoginPage';

const FiscalShell: React.FC = () => {
  const { activeRoute, activeEmpresa, toastMessage, authUser, authLoading } = useFiscal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <img src="./logotecno.png" alt="Tecnocontrol" className="h-9 w-auto object-contain" />
        <div className="mt-5 flex items-center gap-2.5 text-xs font-medium text-slate-500">
          <span className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-[#0e4b85] animate-spin" />
          <span>Verificando sesión activa...</span>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (activeRoute) {
      case 'empresas':
        return <EmpresasPage />;
      case 'efirma':
        return <EfirmaPage />;
      case 'usuarios':
        return <UsuariosPage />;
      case 'sincronizacion':
        return <SincronizacionPage />;
      case 'emitidos':
        return <CfdisPage direccion="E" />;
      case 'recibidos':
        return <CfdisPage direccion="R" />;
      case 'dashboard':
        return <DashboardPage />;
      case 'iva':
        return <IvaPage />;
      case 'isr':
        return <IsrPage />;
      case 'visor':
        return <VisorSatPage />;
      case 'documentos':
        return <DocumentosPage />;
      case 'indicadores':
        return <IndicadoresPage />;
      case 'contable':
        return <ContablePage />;
      case 'vinculaciones':
        return <VinculacionesPage />;
      case 'consumo':
        return <ConsumoPage />;
      case 'asistente':
        return <AsistentePage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-3.5 py-5 sm:px-6 sm:py-6">
          <div key={`${activeRoute}-${activeEmpresa.id}`} className="animate-page-enter">
            {renderPage()}
          </div>
        </main>
      </div>

      {/* Modales globales y asistente flotante */}
      <CfdiDetailModal />
      <PdfRepresentationModal />
      <FloatingAssistant />

      {/* Toast feedback */}
      {toastMessage && (
        <div className="no-print animate-toast fixed bottom-5 left-1/2 z-[70] flex items-center gap-2 rounded-full bg-blue-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl ring-1 ring-blue-700/60">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => (
  <FiscalProvider>
    <FiscalShell />
  </FiscalProvider>
);

export default App;

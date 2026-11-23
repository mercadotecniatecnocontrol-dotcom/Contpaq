import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFiscal } from './context/FiscalContext';
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

const AuthenticatedShell: React.FC = () => {
  const { activeRoute, activeEmpresa, toastMessage } = useFiscal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

export default AuthenticatedShell;

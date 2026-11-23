import React, { Suspense } from 'react';
import { FiscalProvider, useFiscal } from './context/FiscalContext';
import { LoginPage } from './pages/LoginPage';

// El portal completo se carga de forma diferida y protegida únicamente después de iniciar sesión
const AuthenticatedShell = React.lazy(() => import('./AuthenticatedShell'));

const LoadingScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
    <img src="./logotecno.png" alt="Tecnocontrol" className="h-9 w-auto object-contain" />
    <div className="mt-5 flex items-center gap-2.5 text-xs font-medium text-slate-500">
      <span className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-[#0e4b85] animate-spin" />
      <span>{message}</span>
    </div>
  </div>
);

const FiscalShell: React.FC = () => {
  const { authUser, authLoading, dataLoading, backendOnline, reloadRemoteState, logout } = useFiscal();

  if (authLoading) {
    return <LoadingScreen message="Verificando sesión activa..." />;
  }

  if (!authUser) {
    return <LoginPage />;
  }

  if (dataLoading) {
    return <LoadingScreen message="Cargando información fiscal..." />;
  }

  if (!backendOnline) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <img src="./logotecno.png" alt="Tecnocontrol" className="h-9 w-auto object-contain" />
        <p className="mt-5 text-sm font-semibold text-slate-800">
          No fue posible cargar los datos del portal
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Verifica tu conexión con el servidor interno e intenta nuevamente.
        </p>
        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void reloadRemoteState()}
            className="rounded-xl bg-[#0e4b85] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b3c6c] cursor-pointer"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen message="Cargando módulos del portal..." />}>
      <AuthenticatedShell />
    </Suspense>
  );
};

export const App: React.FC = () => (
  <FiscalProvider>
    <FiscalShell />
  </FiscalProvider>
);

export default App;

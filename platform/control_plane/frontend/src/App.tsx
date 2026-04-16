import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { UserProvider } from './contexts/UserContext';
import SignIn from './components/SignIn';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import Strategy from './components/Strategy';
import TemplateCatalog from './components/TemplateCatalog';
import DeploymentList from './components/DeploymentList';
import DeploymentCreate from './components/DeploymentCreate';
import DeploymentDetail from './components/DeploymentDetail';
import Documentation from './components/Documentation';
import FSIFoundryCatalog from './components/FSIFoundryCatalog';
import ReferenceImplementations from './components/ReferenceImplementations';
import AppDeployCreate from './components/AppDeployCreate';
import RefImplDeployCreate from './components/RefImplDeployCreate';
import Observability from './components/Observability';
import Guardrails from './components/Guardrails';
import Policy from './components/Policy';
import AppFactory from './components/AppFactory';

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) return <SignIn />;

  return (
    <UserProvider>
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        {/* Shared ombre gradient */}
        <div className="fixed inset-0 pointer-events-none z-0" style={{
          background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }} />
        <div className="relative h-full">
          <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/accelerator-guide" element={<Strategy />} />
        <Route path="/strategy" element={<Strategy />} />
        <Route path="/applications/fsi-foundry" element={<FSIFoundryCatalog />} />
        <Route path="/applications/reference-implementations" element={<ReferenceImplementations />} />
        <Route path="/applications/deploy/:useCaseId" element={<AppDeployCreate />} />
        <Route path="/applications/reference-implementations/deploy/:implId" element={<RefImplDeployCreate />} />
        <Route path="/applications/templates" element={<TemplateCatalog />} />
        <Route path="/applications/app-factory" element={<AppFactory />} />
        <Route path="/templates" element={<TemplateCatalog />} />
        <Route path="/observability" element={<Observability />} />
        <Route path="/secure/guardrails" element={<Guardrails />} />
        <Route path="/secure/policy" element={<Policy />} />
        <Route path="/deployments" element={<DeploymentList />} />
        <Route path="/deployments/create" element={<DeploymentCreate />} />
        <Route path="/deployments/:id" element={<DeploymentDetail />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/docs/:section" element={<Documentation />} />
      </Routes>
        </div>
      </main>
    </div>
    </UserProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGate />
      </Router>
    </AuthProvider>
  );
}

export default App;

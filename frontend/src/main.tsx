import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { Dashboard } from './pages/Dashboard';
import { DocumentationPage } from './pages/DocumentationPage';
import { GenerateCodePage } from './pages/GenerateCodePage';
import { LandingPage } from './pages/LandingPage';
import { RealEstateDashboard } from './pages/RealEstateDashboard';
import { AccessibilityProvider, useAccessibility } from './components/accessibility/AccessibilitySystem';
import './styles.css';

function AppRouter() {
  const [path, setPath] = React.useState(window.location.pathname);

  React.useEffect(() => {
    const handleRoute = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  if (path.startsWith('/generate/')) {
    return <GenerateCodePage />;
  }

  if (path === '/dashboard') {
    return <Dashboard />;
  }

  if (path === '/real-estate') {
    return <RealEstateDashboard />;
  }

  if (path === '/documentation') {
    return <DocumentationPage />;
  }

  return <LandingPage />;
}

function MotionAccessibilityShell() {
  const { reduceMotion } = useAccessibility();

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      <AppRouter />
    </MotionConfig>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessibilityProvider>
      <MotionAccessibilityShell />
    </AccessibilityProvider>
  </React.StrictMode>,
);

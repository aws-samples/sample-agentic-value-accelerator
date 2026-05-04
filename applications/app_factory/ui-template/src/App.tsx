import { Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { loadConfig, type RuntimeConfig } from './config';
import Navigation from './components/Navigation';
import Home from './components/Home';
import Console from './components/Console';

export default function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch(() => setError('Failed to load configuration.'));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navigation config={config} />
      <Routes>
        <Route path="/" element={<Home config={config} />} />
        <Route path="/console" element={<Console config={config} />} />
      </Routes>
    </div>
  );
}

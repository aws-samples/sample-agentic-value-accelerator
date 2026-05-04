import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import ChatPage from './pages/ChatPage';
import TransactionsPage from './pages/TransactionsPage';
import NetworkAnalysis from './pages/NetworkAnalysis';
import ConfigManager from './components/ConfigManager';
import SimulatePage from './pages/SimulatePage';
import './App.css';

function App() {
  return (
    <div className="App">
      <Header 
        title="Case Management Dashboard" 
        subtitle="Monitor fraud detection and transaction analysis"
      />
      <Sidebar />
      <Box sx={{ 
        display: 'flex', 
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        maxWidth: '100vw',
        position: 'relative'
      }}>
        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1, 
            marginLeft: '200px', // Account for sidebar width (now on left)
            marginTop: '80px', // Account for header height
            height: 'calc(100vh - 80px)',
            backgroundColor: '#f3f3f3',
            width: 'calc(100vw - 200px)',
            overflow: 'auto',
            boxSizing: 'border-box',
            padding: '20px',
            position: 'relative',
            zIndex: 1100,
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/network" element={<NetworkAnalysis />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/simulate" element={<SimulatePage />} />
            <Route path="/config" element={<ConfigManager />} />
          </Routes>
        </Box>
      </Box>
    </div>
  );
}

export default App;

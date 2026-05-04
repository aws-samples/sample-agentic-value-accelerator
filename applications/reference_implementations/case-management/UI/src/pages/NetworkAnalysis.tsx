import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { fetchTransactions } from '../services/api';
import TransactionNetwork from '../components/TransactionNetwork';

const NetworkAnalysis: React.FC = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTransactions();
        setTransactions(data);
      } catch (err) {
        console.error('Error loading transactions:', err);
        setError(`Failed to load transactions: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, []);

  if (loading) {
    return (
      <Box className="dashboard-container">
        <Box className="loading-spinner">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading network analysis...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Error Message */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            zIndex: 1000,
            mb: 3 
          }}
          action={
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* No Data Message */}
      {!loading && !error && transactions.length === 0 && (
        <Alert 
          severity="info" 
          sx={{ 
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            zIndex: 1000,
            mb: 3 
          }}
          action={
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        >
          No transaction data found. Please check your API connection or try refreshing the data.
        </Alert>
      )}

      {/* Network Visualization - Full Screen */}
      {transactions.length > 0 && (
        <TransactionNetwork transactions={transactions} />
      )}
    </Box>
  );
};

export default NetworkAnalysis;

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { fetchTransactions, getDecisionPolicy, generateSarsReport } from '../services/api';
import { logAuditEvent } from '../services/audit';

const TransactionsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasonTagsDialog, setReasonTagsDialog] = useState<{
    open: boolean;
    transaction: any | null;
  }>({ open: false, transaction: null });
  const [generatingTxnId, setGeneratingTxnId] = useState<string | null>(null);
  const [sarsDialogOpen, setSarsDialogOpen] = useState(false);
  const [sarsDialogText, setSarsDialogText] = useState('');
  const [sarsDialogFileName, setSarsDialogFileName] = useState('sars-report.json');

  // Fetch transactions from API
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTransactions();
        // Remove duplicates based on transaction ID
        const uniqueTransactions = data.filter((transaction, index, self) => 
          index === self.findIndex(t => t.id === transaction.id)
        );
        setTransactions(uniqueTransactions);
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



  // Filter transactions based on search and decision
  
  const filteredTransactions = transactions
    .filter((transaction: any) => {
      // Search filter - search across multiple transaction fields (using transformed field names)
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' || 
        // Search in transaction ID
        transaction.id?.toLowerCase().includes(searchLower) ||
        // Search in source account
        transaction.accountId?.toLowerCase().includes(searchLower) ||
        // Search in destination
        transaction.merchant?.toLowerCase().includes(searchLower) ||
        // Search in amount (convert to string)
        transaction.amount?.toString().includes(searchLower) ||
        // Search in decision
        transaction.decision?.toLowerCase().includes(searchLower) ||
        // Search in fraud score (convert to string)
        transaction.fraudScore?.toString().includes(searchLower) ||
        // Search in location/geo
        transaction.geo?.toLowerCase().includes(searchLower) ||
        // Search in device ID
        transaction.deviceId?.toLowerCase().includes(searchLower) ||
        // Search in date
        transaction.date?.toLowerCase().includes(searchLower) ||
        // Search in reason tags
        transaction.reasonTags?.some((tag: string) => tag.toLowerCase().includes(searchLower));
      
      // Decision filter - exact match only
      const matchesDecision = 
        decisionFilter === 'all' || 
        transaction.decision === decisionFilter;
      
      
      return matchesSearch && matchesDecision;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case 'amount':
          return b.amount - a.amount;
        case 'fraud':
          return b.fraudScore - a.fraudScore;
        case 'date':
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });


  const handleShowReasonTags = (transaction: any) => {
    logAuditEvent({ type: 'REASON_TAGS_VIEW', txnId: transaction.id, timestamp: new Date().toISOString() });
    setReasonTagsDialog({ open: true, transaction });
  };

  const handleCloseReasonTags = () => {
    setReasonTagsDialog({ open: false, transaction: null });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Box className="dashboard-container">
        <Box className="loading-spinner">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading transactions...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="dashboard-container">
      {/* Error Message */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
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
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        >
          No transaction data found. Please check your API connection or try refreshing the data.
        </Alert>
      )}

      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 300 }}
          />
          
          
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Decision</InputLabel>
            <Select
              value={decisionFilter}
              label="Decision"
              onChange={(e) => setDecisionFilter(e.target.value)}
            >
              <MenuItem value="all">All Decisions</MenuItem>
              <MenuItem value="APPROVE">Approved</MenuItem>
              <MenuItem value="HOLD_AND_CASE">Hold & Case</MenuItem>
              <MenuItem value="STEP_UP_REVIEW">Step Up Review</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => setSortBy(e.target.value)}
            >
              <MenuItem value="date">Date</MenuItem>
              <MenuItem value="amount">Amount</MenuItem>
              <MenuItem value="fraud">Fraud Score</MenuItem>
            </Select>
          </FormControl>



          <Chip
            icon={<FilterIcon />}
            label={`${filteredTransactions.length} transactions`}
            color="primary"
            variant="outlined"
          />

          
        </Box>
      </Paper>

      {/* Transactions Table */}
      <TableContainer component={Paper} className="transactions-table">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Transaction ID</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Destination</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Decision</TableCell>
              <TableCell>Fraud Score</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Actions</TableCell>
              <TableCell>SARS Report</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
          {filteredTransactions.map((transaction: any, index: number) => (
            <TableRow 
              key={`${transaction.id}-${index}`}
              hover
              sx={{ 
                backgroundColor: transaction.isFraud ? 'rgba(244, 67, 54, 0.04)' : 'inherit',
                '&:hover': {
                  backgroundColor: transaction.isFraud ? 'rgba(244, 67, 54, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                }
              }}
            >
              <TableCell>
                <Typography variant="body2" fontFamily="monospace">
                  {transaction.id}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {transaction.accountId}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {transaction.merchant}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {formatDate(transaction.date)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography 
                  variant="body2" 
                  fontWeight="bold"
                  color="success.main"
                >
                  {formatCurrency(transaction.amount)}
                </Typography>
              </TableCell>
              <TableCell>
                <Tooltip title={getDecisionPolicy(transaction.decision || 'REJECT').guidance}>
                  <Chip
                    label={transaction.decision || 'UNKNOWN'}
                    color={
                      transaction.decision === 'APPROVE' ? 'success' :
                      transaction.decision === 'HOLD_AND_CASE' ? 'warning' :
                      transaction.decision === 'STEP_UP_REVIEW' ? 'info' :
                      transaction.decision === 'REJECT' ? 'error' : 'default'
                    }
                    size="small"
                  />
                </Tooltip>
              </TableCell>
              <TableCell>
                <Typography 
                  variant="body2" 
                  fontWeight="bold"
                  color={transaction.fraudScore >= 0.85 ? 'error.main' : 'textSecondary'}
                >
                  {(transaction.fraudScore * 100).toFixed(1)}%
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {transaction.geo}
                </Typography>
              </TableCell>
              <TableCell>
                <Tooltip title="Show Reason Tags">
                  <IconButton
                    size="small"
                    onClick={() => handleShowReasonTags(transaction)}
                    color="primary"
                  >
                    <FilterIcon />
                  </IconButton>
                </Tooltip>
              </TableCell>
              <TableCell>
                {transaction.decision === 'HOLD_AND_CASE' ? (
                  <Button
                    variant="contained"
                    color="error"
                    size="small"
                    disabled={generatingTxnId !== null}
                    onClick={async () => {
                      try {
                        setGeneratingTxnId(transaction.id);
                        const blob = await generateSarsReport([transaction], { 
                          reporter: 'Analyst Team',
                          notes: `SARS report for transaction ${transaction.id}`
                        });
                        const text = await blob.text();
                        setSarsDialogText(text);
                        setSarsDialogFileName(`sars-report-${transaction.id}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.md`);
                        setSarsDialogOpen(true);
                      } catch (e) {
                        alert('Failed to generate SARS report');
                      } finally {
                        setGeneratingTxnId(null);
                      }
                    }}
                  >
                    {generatingTxnId === transaction.id ? 'Generating...' : 'Generate SARS'}
                  </Button>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    N/A
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>

      {filteredTransactions.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="textSecondary">
            {transactions.length === 0 
              ? 'No transaction data available' 
              : 'No transactions found matching your criteria'
            }
          </Typography>
        </Box>
      )}

      {/* Reason Tags Dialog */}
      <Dialog 
        open={reasonTagsDialog.open} 
        onClose={handleCloseReasonTags}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Reason Tags for Transaction {reasonTagsDialog.transaction?.id}
        </DialogTitle>
        <DialogContent>
          {reasonTagsDialog.transaction?.reasonTags && reasonTagsDialog.transaction.reasonTags.length > 0 ? (
            <Box>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                The following reason tags were identified for this transaction:
              </Typography>
              <List>
                {reasonTagsDialog.transaction.reasonTags.map((tag: string, index: number) => (
                  <ListItem key={index} sx={{ py: 0.5 }}>
                    <ListItemText 
                      primary={
                        <Chip 
                          label={tag.replace(/_/g, ' ').toUpperCase()} 
                          color="primary" 
                          variant="outlined"
                          size="small"
                        />
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <Typography variant="body2" color="textSecondary">
              No reason tags available for this transaction.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReasonTags} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* SARS Report Dialog */}
      <Dialog 
        open={sarsDialogOpen}
        onClose={() => setSarsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#232f3e', color: '#fff' }}>
          SAR Report — {sarsDialogFileName}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{
            p: 2,
            fontSize: '0.9rem',
            lineHeight: 1.7,
            fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
            '& h1, & h2, & h3': { color: '#232f3e', mt: 2, mb: 1 },
            '& strong': { color: '#d13212' },
            '& li': { mb: 0.5 },
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
            dangerouslySetInnerHTML={{
              __html: sarsDialogText
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/⚠️/g, '⚠️')
                .replace(/^- (.*$)/gm, '<li>$1</li>')
                .replace(/^---$/gm, '<hr/>')
                .replace(/\n\n/g, '<br/><br/>')
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSarsDialogOpen(false)}>Close</Button>
          <Button onClick={() => {
            const blob = new Blob([sarsDialogText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = sarsDialogFileName.replace('.json', '.md');
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }} variant="contained" color="primary">Download Report</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TransactionsPage;

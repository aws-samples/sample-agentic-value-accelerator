import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, Chip, Alert, LinearProgress, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Avatar, IconButton, Tooltip, Collapse, Select, MenuItem, FormControl,
  InputLabel,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getConfig } from '../config.js';

const GEOS = ['US-NY','US-CA','US-TX','CA-BC','GB-LN','AU-NS','DE-BE','FR-PA','IT-RM','JP-TK','BR-SP','IN-MH','SG-01'];

interface TxnFields {
  txn_id: string; src: string; dst: string; amount: number;
  geo: string; device_id: string; minuteOffset: number;
}

interface Scenario {
  id: string; name: string; description: string;
  transactions: TxnFields[];
}

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: 'benign', name: 'Benign Transaction', description: 'Normal low-value — should APPROVE',
    transactions: [{ txn_id: `B${makeId()}`, src: 'SK123', dst: 'M100', amount: 27.5, geo: 'US-NY', device_id: 'D1', minuteOffset: 0 }],
  },
  {
    id: 'smurfing', name: 'Smurfing / Structuring', description: '12 x $98 near-threshold (same minute)',
    transactions: Array.from({ length: 12 }, (_, i) => ({
      txn_id: `S${makeId()}${i}`, src: 'A705', dst: `M00${i+1}`, amount: 98.0,
      geo: GEOS[i % GEOS.length], device_id: `D900${i+1}`, minuteOffset: 0,
    })),
  },
  {
    id: 'velocity', name: 'High Velocity', description: '15 rapid $98 transactions (same minute)',
    transactions: Array.from({ length: 15 }, (_, i) => ({
      txn_id: `H${makeId()}${i}`, src: 'HV345', dst: `Z30${i+1}`, amount: 98,
      geo: 'US-NY', device_id: 'HV', minuteOffset: 0,
    })),
  },
  {
    id: 'fanin', name: 'Fan-In to Destination', description: '10 senders → M900 (same minute). Triggers FAN_IN_TO_DST reason tag but model score stays low — detection is rule-based, not ML',
    transactions: Array.from({ length: 10 }, (_, i) => ({
      txn_id: `R${makeId()}${i}`, src: `U3${String(i+1).padStart(2,'0')}`, dst: 'M900', amount: 45.0,
      geo: GEOS[i % GEOS.length], device_id: `DFAN${i+1}`, minuteOffset: 0,
    })),
  },
  {
    id: 'large', name: 'Large Amount + New Beneficiary', description: '$65,800 to new dst',
    transactions: [{ txn_id: `N${makeId()}`, src: 'B8890', dst: 'M777', amount: 65800.0, geo: 'US-CA', device_id: 'DNB', minuteOffset: 0 }],
  },
  {
    id: 'time', name: 'Time Anomaly (3 AM)', description: 'Odd-hour transaction',
    transactions: [{ txn_id: `T${makeId()}`, src: 'TYUIq', dst: 'dfh', amount: 120.0, geo: 'US-NY', device_id: 'D3AM', minuteOffset: -540 }],
  },
  {
    id: 'geohop', name: 'Geo Hop (US→DE)', description: 'Same src, country change in 1 min',
    transactions: [
      { txn_id: `G${makeId()}1`, src: 'A830', dst: 'M130', amount: 90.0, geo: 'US-NY', device_id: 'DNY', minuteOffset: 0 },
      { txn_id: `G${makeId()}2`, src: 'A830', dst: 'M131', amount: 110.0, geo: 'DE-BE', device_id: 'DNY', minuteOffset: 1 },
    ],
  },
  {
    id: 'device', name: 'Rapid Device Change', description: 'Same src, different device in 1 min',
    transactions: [
      { txn_id: `D${makeId()}1`, src: 'A840', dst: 'M140', amount: 60.0, geo: 'US-CA', device_id: 'D-OLD', minuteOffset: 0 },
      { txn_id: `D${makeId()}2`, src: 'A840', dst: 'M141', amount: 75.0, geo: 'US-CA', device_id: 'D-NEW', minuteOffset: 1 },
    ],
  },
  {
    id: 'geodevice', name: 'Geo + Device Change', description: 'GB→IN + device switch',
    transactions: [
      { txn_id: `GD${makeId()}1`, src: 'A850', dst: 'M150', amount: 85.0, geo: 'GB-LN', device_id: 'DLON', minuteOffset: 0 },
      { txn_id: `GD${makeId()}2`, src: 'A850', dst: 'M151', amount: 96.0, geo: 'IN-MH', device_id: 'DIN', minuteOffset: 1 },
    ],
  },
];

type RunStatus = 'idle' | 'running' | 'success' | 'error';
interface TxnResult { txn_id: string; decision: string; score: number; tags: string[]; }
interface ScenarioResult { status: RunStatus; sent: number; results: TxnResult[]; error?: string; }

const SimulatePage: React.FC = () => {
  const [scenarios, setScenarios] = useState<Scenario[]>(JSON.parse(JSON.stringify(DEFAULT_SCENARIOS)));
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);

  const getScoreUrl = () => {
    const config = getConfig();
    return `${config.SAR_API_URL || ''}/fraudscore`;
  };

  const updateTxn = (scenarioId: string, txnIdx: number, field: keyof TxnFields, value: any) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId) return s;
      const txns = [...s.transactions];
      txns[txnIdx] = { ...txns[txnIdx], [field]: field === 'amount' || field === 'minuteOffset' ? Number(value) : value };
      return { ...s, transactions: txns };
    }));
  };

  const updateScenarioName = (scenarioId: string, name: string) => {
    setScenarios(prev => prev.map(s => s.id === scenarioId ? { ...s, name } : s));
  };

  const addTxn = (scenarioId: string) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId) return s;
      const last = s.transactions[s.transactions.length - 1];
      return { ...s, transactions: [...s.transactions, {
        txn_id: makeId(), src: last?.src || 'SRC', dst: `DST${s.transactions.length}`,
        amount: last?.amount || 50, geo: last?.geo || 'US-NY', device_id: last?.device_id || 'D1',
        minuteOffset: (last?.minuteOffset || 0) + 1,
      }]};
    }));
  };

  const removeTxn = (scenarioId: string, idx: number) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId || s.transactions.length <= 1) return s;
      return { ...s, transactions: s.transactions.filter((_, i) => i !== idx) };
    }));
  };

  const sendTransaction = async (txn: TxnFields) => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + txn.minuteOffset);
    const res = await fetch(getScoreUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txn_id: txn.txn_id + Date.now().toString().slice(-4),
        src: txn.src, dst: txn.dst, amount: txn.amount,
        timestamp: now.toISOString().replace(/\.\d+Z$/, 'Z'),
        geo: txn.geo, device_id: txn.device_id,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const runScenario = async (scenario: Scenario) => {
    setResults(prev => ({ ...prev, [scenario.id]: { status: 'running', sent: 0, results: [] } }));
    const txnResults: TxnResult[] = [];
    try {
      for (let i = 0; i < scenario.transactions.length; i++) {
        const data = await sendTransaction(scenario.transactions[i]);
        txnResults.push({ txn_id: data.txn_id || scenario.transactions[i].txn_id, decision: data.decision || 'UNKNOWN', score: data.fraud_score || 0, tags: data.reason_tags || [] });
        setResults(prev => ({ ...prev, [scenario.id]: { status: 'running', sent: i + 1, results: [...txnResults] } }));
        if (i < scenario.transactions.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      setResults(prev => ({ ...prev, [scenario.id]: { status: 'success', sent: txnResults.length, results: txnResults } }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, [scenario.id]: { status: 'error', sent: txnResults.length, results: txnResults, error: e.message } }));
    }
  };

  const runAll = async () => { setRunningAll(true); for (const s of scenarios) await runScenario(s); setRunningAll(false); };
  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <Box className="dashboard-container">
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#131921', color: 'white', borderBottom: '3px solid #FF9900' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: '#FF9900' }}><PlayIcon /></Avatar>
            <Box>
              <Typography variant="h6" fontWeight={600}>Transaction Simulator</Typography>
              <Typography variant="body2" sx={{ color: '#FFB84D' }}>Edit fields, then run scenarios against the fraud scoring API</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" startIcon={<PlayIcon />} onClick={runAll} disabled={runningAll}
              sx={{ bgcolor: '#FF9900', color: '#131921', '&:hover': { bgcolor: '#FFB84D' } }}>
              {runningAll ? 'Running...' : 'Run All'}
            </Button>
            <Tooltip title="Reset to defaults">
              <IconButton onClick={() => { setScenarios(JSON.parse(JSON.stringify(DEFAULT_SCENARIOS))); setResults({}); }} sx={{ color: 'white' }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {runningAll && <LinearProgress sx={{ mb: 2, '& .MuiLinearProgress-bar': { bgcolor: '#FF9900' } }} />}

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Detection Thresholds</strong> (configurable via Lambda environment variables):
        </Typography>
        <Typography variant="body2" component="div">
          • <strong>Structuring:</strong> Amounts $95–$100 flagged as "near reporting threshold" (real AML uses $9,500–$10,000). Needs 8+ from same sender to trigger HOLD_AND_CASE.<br/>
          • <strong>Large Amount:</strong> Transactions ≥ $5,000 trigger LARGE_AMOUNT tag (env: LARGE_AMT_MIN).<br/>
          • <strong>New Beneficiary:</strong> First-time sender→receiver pair with amount ≥ $500 (env: NEW_BENEF_AMT_MIN).<br/>
          • <strong>Fan-In:</strong> 5+ distinct senders to same destination in 1 hour (env: FANIN_DISTINCT_MIN).<br/>
          • <strong>Geo Hop:</strong> Country change within 30 minutes (env: GEO_HOP_WINDOW_MIN).<br/>
          • <strong>Device Change:</strong> Different device within 30 minutes (env: DEVICE_CHANGE_WINDOW).
        </Typography>
      </Alert>

      {scenarios.map(scenario => {
        const r = results[scenario.id];
        const isOpen = expanded[scenario.id];
        return (
          <Paper key={scenario.id} sx={{ mb: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }}
              onClick={() => toggle(scenario.id)}>
              <IconButton size="small">{isOpen ? <CollapseIcon /> : <ExpandIcon />}</IconButton>
              <Box sx={{ flex: 1 }}>
                <TextField value={scenario.name} variant="standard" size="small"
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateScenarioName(scenario.id, e.target.value)}
                  sx={{ fontWeight: 600, '& input': { fontWeight: 600, fontSize: '1rem' } }} />
                <Typography variant="body2" color="textSecondary">{scenario.description}</Typography>
              </Box>
              <Chip label={`${scenario.transactions.length} txn${scenario.transactions.length > 1 ? 's' : ''}`} size="small" />
              {r?.status === 'success' && <Chip icon={<SuccessIcon />} label={`${r.sent} sent`} size="small" color="success" />}
              {r?.status === 'error' && <Chip icon={<ErrorIcon />} label="Failed" size="small" color="error" />}
              {r?.status === 'running' && <Chip label={`Sending ${r.sent}...`} size="small" color="info" />}
              <Button size="small" variant="outlined" startIcon={<PlayIcon />}
                disabled={r?.status === 'running' || runningAll}
                onClick={e => { e.stopPropagation(); runScenario(scenario); }}>
                Run
              </Button>
            </Box>

            <Collapse in={isOpen}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Txn ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Destination</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Geo</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Device</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Min Offset</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Result</TableCell>
                      <TableCell sx={{ width: 40 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scenario.transactions.map((txn, idx) => {
                      const txnResult = r?.results[idx];
                      return (
                        <TableRow key={idx} hover>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell><TextField value={txn.txn_id} size="small" variant="standard" fullWidth
                            onChange={e => updateTxn(scenario.id, idx, 'txn_id', e.target.value)} /></TableCell>
                          <TableCell><TextField value={txn.src} size="small" variant="standard" fullWidth
                            onChange={e => updateTxn(scenario.id, idx, 'src', e.target.value)} /></TableCell>
                          <TableCell><TextField value={txn.dst} size="small" variant="standard" fullWidth
                            onChange={e => updateTxn(scenario.id, idx, 'dst', e.target.value)} /></TableCell>
                          <TableCell><TextField value={txn.amount} size="small" variant="standard" type="number" sx={{ width: 90 }}
                            onChange={e => updateTxn(scenario.id, idx, 'amount', e.target.value)} /></TableCell>
                          <TableCell>
                            <FormControl size="small" variant="standard" sx={{ minWidth: 80 }}>
                              <Select value={txn.geo} onChange={e => updateTxn(scenario.id, idx, 'geo', e.target.value)}>
                                {GEOS.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell><TextField value={txn.device_id} size="small" variant="standard" sx={{ width: 80 }}
                            onChange={e => updateTxn(scenario.id, idx, 'device_id', e.target.value)} /></TableCell>
                          <TableCell><TextField value={txn.minuteOffset} size="small" variant="standard" type="number" sx={{ width: 50 }}
                            onChange={e => updateTxn(scenario.id, idx, 'minuteOffset', e.target.value)} /></TableCell>
                          <TableCell>
                            {txnResult ? (
                              <Box>
                                <Typography variant="body2" fontWeight={600}
                                  color={txnResult.decision === 'APPROVE' ? 'success.main' : txnResult.decision === 'HOLD_AND_CASE' ? 'error.main' : 'warning.main'}>
                                  {txnResult.decision} ({(txnResult.score*100).toFixed(1)}%)
                                </Typography>
                                {txnResult.tags.length > 0 && (
                                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.3 }}>
                                    {txnResult.tags.join(', ')}
                                  </Typography>
                                )}
                              </Box>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => removeTxn(scenario.id, idx)}
                              disabled={scenario.transactions.length <= 1}><DeleteIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addTxn(scenario.id)}>Add Transaction</Button>
              </Box>
            </Collapse>
          </Paper>
        );
      })}

      {Object.values(results).every(r => r?.status === 'success') && Object.keys(results).length === scenarios.length && (
        <Alert severity="success" sx={{ mt: 2 }}>All scenarios complete. Check the Transactions page for results.</Alert>
      )}
    </Box>
  );
};

export default SimulatePage;

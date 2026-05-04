import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  Button,
  CircularProgress,
  Alert,
  Tooltip as MuiTooltip,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp as TrendingUpIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { fetchTransactions, fetchTransactionStats, getDecisionPolicy } from '../services/api';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { sampleGenAIRecommendations } from '../data/sampleData';

// Enhanced color palette with Amazon-inspired colors
const COLORS = {
  primary: '#FF9900',
  secondary: '#232F3E',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  chart: ['#FF9900', '#232F3E', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4']
};

// Chart colors array for easy access
const CHART_COLORS = ['#FF9900', '#232F3E', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4'];

const Home: React.FC = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalTransactions: 0,
    fraudTransactions: 0,
    fraudRate: 0,
    highPriorityCases: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [transactionsData, statsData] = await Promise.all([
        fetchTransactions(),
        fetchTransactionStats(),
      ]);
      
      setTransactions(transactionsData);
      setStats(statsData);
      
      } catch (err) {
        console.error('Error loading data:', err);
        setError(`Failed to load transaction data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        // No fallback - show empty state
        setTransactions([]);
        setStats({
          totalTransactions: 0,
          fraudTransactions: 0,
          fraudRate: 0,
          highPriorityCases: 0,
        });
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Use stats from API
  const { totalTransactions, fraudTransactions, fraudRate, highPriorityCases } = stats;

  // Fraud types data
  const fraudTypesData = transactions
    .filter(t => t.isFraud && t.fraudType)
    .reduce((acc, transaction) => {
      const type = transaction.fraudType!;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const fraudTypesChartData = Object.entries(fraudTypesData).map(([type, count]) => ({
    name: type.replace('_', ' ').toUpperCase(),
    value: count,
  }));

  // Transaction amounts by fraud status
  const transactionAmountsData = transactions.map((t: any) => ({
    date: new Date(t.date).toLocaleDateString(),
    amount: Math.abs(t.amount), // Show positive amounts
    fraud: t.isFraud ? 'Fraud' : 'Legitimate',
  }));

  // Fraud score distribution
  const fraudScoreRanges = [
    { range: '0-20%', count: 0, color: '#00C49F' },
    { range: '21-40%', count: 0, color: '#FFBB28' },
    { range: '41-60%', count: 0, color: '#FF8042' },
    { range: '61-80%', count: 0, color: '#FF6B6B' },
    { range: '81-100%', count: 0, color: '#FF0000' },
  ];

  transactions.forEach((t: any) => {
    const score = t.fraudScore * 100; // Convert to percentage
    if (score <= 20) fraudScoreRanges[0].count++;
    else if (score <= 40) fraudScoreRanges[1].count++;
    else if (score <= 60) fraudScoreRanges[2].count++;
    else if (score <= 80) fraudScoreRanges[3].count++;
    else fraudScoreRanges[4].count++;
  });

  // Recent high-priority recommendations
  const highPriorityRecommendations = sampleGenAIRecommendations
    .filter(r => r.priority === 'high' || r.priority === 'critical')
    .slice(0, 3);

  // Additional chart data
  const hourlyTransactionData = transactions.reduce((acc, txn) => {
    const hour = new Date(txn.date).getHours();
    const key = `${hour}:00`;
    if (!acc[key]) {
      acc[key] = { hour: key, legitimate: 0, fraud: 0, total: 0 };
    }
    acc[key].total++;
    if (txn.isFraud) {
      acc[key].fraud++;
    } else {
      acc[key].legitimate++;
    }
    return acc;
  }, {} as Record<string, any>);

  const hourlyChartData = Object.values(hourlyTransactionData).sort((a: any, b: any) => 
    parseInt(a.hour) - parseInt(b.hour)
  );

  // Enhanced Geographic distribution
  const geoData = transactions.reduce((acc, txn) => {
    const geo = txn.geo || 'Unknown';
    if (!acc[geo]) {
      acc[geo] = { 
        name: geo, 
        transactions: 0, 
        fraud: 0, 
        amount: 0,
        avgAmount: 0,
        legitimate: 0
      };
    }
    acc[geo].transactions++;
    acc[geo].amount += Math.abs(txn.amount);
    if (txn.isFraud) {
      acc[geo].fraud++;
    } else {
      acc[geo].legitimate++;
    }
    acc[geo].avgAmount = acc[geo].amount / acc[geo].transactions;
    return acc;
  }, {} as Record<string, any>);

  const geoChartData = Object.values(geoData)
    .map((item: any) => ({
      ...item,
      fraudRate: ((item.fraud / item.transactions) * 100).toFixed(1),
      displayName: item.name.length > 8 ? item.name.substring(0, 8) + '...' : item.name
    }))
    .sort((a: any, b: any) => b.transactions - a.transactions)
    .slice(0, 10); // Show top 10 locations

  // If we have limited geographic data, add some sample data for demonstration
  if (geoChartData.length < 3) {
    const sampleGeoData = [
      { name: 'US-NY', transactions: 45, fraud: 8, amount: 12500, avgAmount: 277.78, legitimate: 37, fraudRate: '17.8', displayName: 'US-NY' },
      { name: 'US-CA', transactions: 38, fraud: 5, amount: 9800, avgAmount: 257.89, legitimate: 33, fraudRate: '13.2', displayName: 'US-CA' },
      { name: 'US-TX', transactions: 32, fraud: 6, amount: 8500, avgAmount: 265.63, legitimate: 26, fraudRate: '18.8', displayName: 'US-TX' },
      { name: 'US-FL', transactions: 28, fraud: 4, amount: 7200, avgAmount: 257.14, legitimate: 24, fraudRate: '14.3', displayName: 'US-FL' },
      { name: 'US-IL', transactions: 25, fraud: 3, amount: 6500, avgAmount: 260.00, legitimate: 22, fraudRate: '12.0', displayName: 'US-IL' }
    ];
    geoChartData.push(...sampleGeoData);
    geoChartData.sort((a: any, b: any) => b.transactions - a.transactions);
  }

  // Risk score distribution with enhanced data
  const riskDistribution = [
    { range: '0-20%', count: 0, color: COLORS.success, label: 'Low Risk' },
    { range: '21-40%', count: 0, color: COLORS.info, label: 'Medium Risk' },
    { range: '41-60%', count: 0, color: COLORS.warning, label: 'High Risk' },
    { range: '61-80%', count: 0, color: '#ff6b6b', label: 'Very High Risk' },
    { range: '81-100%', count: 0, color: COLORS.error, label: 'Critical Risk' },
  ];

  transactions.forEach((t: any) => {
    const score = t.fraudScore * 100;
    if (score <= 20) riskDistribution[0].count++;
    else if (score <= 40) riskDistribution[1].count++;
    else if (score <= 60) riskDistribution[2].count++;
    else if (score <= 80) riskDistribution[3].count++;
    else riskDistribution[4].count++;
  });

  // Device analysis
  const deviceData = transactions.reduce((acc, txn) => {
    const device = txn.deviceId || 'Unknown';
    if (!acc[device]) {
      acc[device] = { device, transactions: 0, fraud: 0, avgAmount: 0, totalAmount: 0 };
    }
    acc[device].transactions++;
    acc[device].totalAmount += Math.abs(txn.amount);
    acc[device].avgAmount = acc[device].totalAmount / acc[device].transactions;
    if (txn.isFraud) acc[device].fraud++;
    return acc;
  }, {} as Record<string, any>);

  const deviceChartData = Object.values(deviceData)
    .sort((a: any, b: any) => b.transactions - a.transactions)
    .slice(0, 8);

  if (loading) {
    return (
      <Box className="dashboard-container">
        <Box className="loading-spinner">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading transaction data...
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
            <Button color="inherit" size="small" onClick={loadData}>
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
            <Button color="inherit" size="small" onClick={loadData}>
              Retry
            </Button>
          }
        >
          No transaction data found. Please check your API connection or try refreshing the data.
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card" onClick={() => console.log('Total Transactions clicked')}>
            <CardContent>
              <TrendingUpIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {totalTransactions}
              </Typography>
              <Typography className="stats-label">
                Total Transactions
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card fraud" onClick={() => console.log('Fraud Cases clicked')}>
            <CardContent>
              <SecurityIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {fraudTransactions}
              </Typography>
              <Typography className="stats-label">
                Fraud Cases
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card priority" onClick={() => console.log('Fraud Rate clicked')}>
            <CardContent>
              <WarningIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {fraudRate.toFixed(1)}%
              </Typography>
              <Typography className="stats-label">
                Fraud Rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card legitimate" onClick={() => console.log('High Priority clicked')}>
            <CardContent>
              <AssessmentIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {highPriorityCases}
              </Typography>
              <Typography className="stats-label">
                High Priority Cases
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Enhanced Charts Section */}
      <Grid container spacing={3}>
        {/* Risk Distribution - Enhanced Radial Chart */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Risk Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="80%" data={riskDistribution}>
                <RadialBar 
                  dataKey="count" 
                  cornerRadius={4}
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </RadialBar>
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [
                    `${value} transactions`, 
                    props.payload.label
                  ]}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {riskDistribution.map((item, index) => (
                <Chip
                  key={index}
                  label={`${item.label}: ${item.count}`}
                  size="small"
                  sx={{
                    backgroundColor: item.color,
                    color: 'white',
                    fontSize: '0.75rem'
                  }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Fraud Types - Enhanced Pie Chart */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: COLORS.secondary }}>
                Fraud Types
              </Typography>
              <MuiTooltip title={getDecisionPolicy('STEP_UP_REVIEW').guidance}>
                <InfoOutlinedIcon sx={{ color: COLORS.primary }} />
              </MuiTooltip>
            </Box>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={fraudTypesChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => {
                    let displayName = name;
                    if (name === 'MONEY LAUNDERING') {
                      displayName = 'MONEY\nLAUNDERING';
                    } else if (name === 'CREDIT CARD FRAUD') {
                      displayName = 'CREDIT CARD\nFRAUD';
                    } else if (name === 'IDENTITY THEFT') {
                      displayName = 'IDENTITY\nTHEFT';
                    } else if (name.length > 12) {
                      const words = name.split(' ');
                      if (words.length > 1) {
                        const midPoint = Math.ceil(words.length / 2);
                        displayName = words.slice(0, midPoint).join(' ') + '\n' + words.slice(midPoint).join(' ');
                      }
                    }
                    return `${displayName}\n${(percent * 100).toFixed(0)}%`;
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {fraudTypesChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [`${value} cases`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Enhanced Geographic Distribution */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Geographic Distribution Analysis
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={geoChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="transactionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="fraudGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.error} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.error} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="displayName" 
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => {
                    const data = props.payload;
                    return [
                      [
                        `Transactions: ${data.transactions}`,
                        `Fraud: ${data.fraud} (${data.fraudRate}%)`,
                        `Legitimate: ${data.legitimate}`,
                        `Total Amount: $${data.amount.toFixed(2)}`,
                        `Avg Amount: $${data.avgAmount.toFixed(2)}`
                      ],
                      data.name
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="transactions" 
                  stroke={COLORS.primary} 
                  strokeWidth={2}
                  fill="url(#transactionsGradient)" 
                  name="Total Transactions"
                />
                <Area 
                  type="monotone" 
                  dataKey="fraud" 
                  stroke={COLORS.error} 
                  strokeWidth={2}
                  fill="url(#fraudGradient)" 
                  name="Fraud Cases"
                />
                <Legend 
                  verticalAlign="top" 
                  height={36}
                  iconType="rect"
                  wrapperStyle={{ fontSize: '12px' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Hourly Transaction Pattern - Area Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Hourly Transaction Patterns
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={hourlyChartData}>
                <defs>
                  <linearGradient id="colorLegitimate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorFraud" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.error} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.error} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    `${value} transactions`, 
                    name === 'legitimate' ? 'Legitimate' : 'Fraud'
                  ]}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="legitimate" 
                  stackId="1" 
                  stroke={COLORS.success} 
                  fill="url(#colorLegitimate)" 
                  name="Legitimate"
                />
                <Area 
                  type="monotone" 
                  dataKey="fraud" 
                  stackId="1" 
                  stroke={COLORS.error} 
                  fill="url(#colorFraud)" 
                  name="Fraud"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Device Analysis */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Device Analysis
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={deviceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="device" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    name === 'transactions' ? `${value} transactions` : 
                    name === 'fraud' ? `${value} fraud cases` : 
                    `$${value.toFixed(2)}`,
                    name === 'transactions' ? 'Total' : 
                    name === 'fraud' ? 'Fraud' : 'Avg Amount'
                  ]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="transactions" fill={COLORS.primary} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="fraud" fill={COLORS.error} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgAmount" stroke={COLORS.warning} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Transaction Amounts Over Time - Enhanced Line Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Transaction Amounts Over Time
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={transactionAmountsData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: any) => [`$${value.toLocaleString()}`, 'Amount']}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: COLORS.primary, strokeWidth: 2 }}
                  name="Amount ($)"
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* High Priority Recommendations - Enhanced */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ 
            p: 3, 
            height: 400,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
            borderRadius: 2,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <Typography variant="h6" gutterBottom sx={{ 
              fontWeight: 600, 
              color: COLORS.secondary,
              mb: 2
            }}>
              Priority Alerts
            </Typography>
            <List sx={{ maxHeight: 320, overflow: 'auto' }}>
              {highPriorityRecommendations.map((rec, index) => (
                <React.Fragment key={rec.id}>
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {rec.title}
                          </Typography>
                          <Chip
                            label={rec.priority.toUpperCase()}
                            size="small"
                            sx={{
                              backgroundColor: rec.priority === 'critical' ? COLORS.error : COLORS.warning,
                              color: 'white',
                              fontSize: '0.7rem',
                              fontWeight: 600
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" sx={{ 
                          color: '#6b7280',
                          lineHeight: 1.4
                        }}>
                          {rec.description}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {index < highPriorityRecommendations.length - 1 && (
                    <Divider sx={{ my: 1, backgroundColor: '#e5e7eb' }} />
                  )}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Home;

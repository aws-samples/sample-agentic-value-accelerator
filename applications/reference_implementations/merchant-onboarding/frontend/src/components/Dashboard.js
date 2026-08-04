import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import {
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckCircleIcon,
  Pause as PauseIcon,
  Visibility as VisibilityIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { customerAPI } from '../services/api';
import { 
  formatDate, 
  formatDateOnly, 
  getStatusColorForCustomer,
  getStatusTextForCustomer,
  getCurrentStageForCustomer,
  calculateStats,
  generateCompanyName,
  generateApplicationId,
} from '../utils/helpers';
import NewMerchantForm from './NewCustomerForm';

const Dashboard = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    completed: 0,
    onHold: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCustomerFormOpen, setNewCustomerFormOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [customerCreatedMessage, setCustomerCreatedMessage] = useState(null);

  // Fetch data from API
  const fetchData = async () => {
    console.log('=== FETCH DATA CALLED ===');
    console.log('hasLoaded:', hasLoaded, 'loading:', loading);
    
    try {
      console.log('=== STARTING API CALL ===');
      setError(null);
      setLoading(true);
      
      // Fetch customers with timeout
      console.log('=== CALLING API: getAllCustomers ===');
      const customersData = await Promise.race([
        customerAPI.getAllCustomers(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API timeout')), 10000)
        )
      ]);
      console.log('=== API CALL COMPLETED ===');
      
      console.log('Raw customers data:', customersData);
      
      const customersList = customersData.customers || [];
      console.log('Processed customers list:', customersList);
      console.log('Customers count:', customersList.length);
      
      // Sort customers by creation date (newest first) immediately
      const sortedCustomers = customersList.sort((a, b) => {
        const dateA = new Date(a.created_date || 0);
        const dateB = new Date(b.created_date || 0);
        return dateB - dateA;
      });
      
      console.log('Sorted customers (newest first):', sortedCustomers.map(c => ({ id: c.id, name: c.name, created: c.created_date })));
      
      setCustomers(sortedCustomers);
      
      // Calculate statistics
      const calculatedStats = calculateStats(sortedCustomers);
      setStats(calculatedStats);

      console.log('Dashboard data loaded successfully:', {
        customers: sortedCustomers.length,
        stats: calculatedStats,
      });
      
      setHasLoaded(true);
      
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(`Failed to load dashboard data: ${err.message}`);
      setCustomers([]);
      setStats({
        total: 0,
        inProgress: 0,
        completed: 0,
        onHold: 0,
      });
    } finally {
      console.log('=== FETCH DATA COMPLETED ===');
      setLoading(false);
      console.log('Loading state reset: loading=false');
    }
  };

  // Initial data load
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Handle row click
  const handleRowClick = (params) => {
    navigate(`/customer/${params.row.id}`);
  };

  // Handle view action
  const handleViewAction = (id) => {
    navigate(`/customer/${id}`);
  };

  // Handle new customer form
  const handleNewCustomerClick = () => {
    setNewCustomerFormOpen(true);
  };

  const handleNewCustomerClose = () => {
    setNewCustomerFormOpen(false);
  };

  const handleCustomerCreated = (newCustomer) => {
    console.log('=== CUSTOMER CREATED CALLBACK TRIGGERED ===');
    console.log('New customer data:', newCustomer);
    
    // Show success message
    setCustomerCreatedMessage(`Merchant "${newCustomer.name}" created successfully!`);
    
    // Simple refresh - just call fetchData directly
    console.log('=== STARTING REFRESH AFTER CUSTOMER CREATION ===');
    fetchData();
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setCustomerCreatedMessage(null);
    }, 3000);
  };

  // Data grid columns
  const columns = [
    {
      field: 'name',
      headerName: 'Company',
      flex: 1,
      minWidth: 200,
      sortable: true,
      filterable: true,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {generateCompanyName(params.row)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {params.row.email}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'id',
      headerName: 'Application ID',
      flex: 1,
      minWidth: 180,
      sortable: true,
      filterable: true,
      renderCell: (params) => (
        <Typography variant="body2" fontFamily="monospace">
          {generateApplicationId(params.row.id)}
        </Typography>
      ),
    },
    {
      field: 'created_date',
      headerName: 'Submission Date',
      flex: 1,
      minWidth: 150,
      sortable: true,
      filterable: true,
      renderCell: (params) => (
        <Typography variant="body2">
          {formatDateOnly(params.row.created_date)}
        </Typography>
      ),
    },
    {
      field: 'current_stage',
      headerName: 'Current Stage',
      flex: 1,
      minWidth: 160,
      sortable: true,
      filterable: true,
      renderCell: (params) => (
        <Typography variant="body2" fontWeight={500}>
          {getCurrentStageForCustomer(params.row.status, params.row.name, params.row.stage_status)}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      minWidth: 150,
      sortable: true,
      filterable: true,
      valueGetter: (params) => {
        return getStatusTextForCustomer(params.row.status, params.row.name, params.row.stage_status);
      },
      renderCell: (params) => {
        const statusColor = getStatusColorForCustomer(params.row.status, params.row.name, params.row.stage_status);
        const isCompleted = statusColor === 'completed';
        
        return (
          <Chip
            label={getStatusTextForCustomer(params.row.status, params.row.name, params.row.stage_status)}
            className={`status-chip ${statusColor}`}
            size="small"
            sx={{
              backgroundColor: isCompleted ? '#10b981' : undefined,
              color: isCompleted ? 'white' : undefined,
              fontWeight: isCompleted ? 600 : undefined,
              background: isCompleted ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
            }}
          />
        );
      },
    },
    {
      field: 'last_updated',
      headerName: 'Last Updated',
      flex: 1,
      minWidth: 150,
      sortable: true,
      filterable: true,
      renderCell: (params) => (
        <Typography variant="body2">
          {formatDate(params.row.last_updated)}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      type: 'actions',
      flex: 0.5,
      minWidth: 100,
      sortable: false,
      filterable: false,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<VisibilityIcon />}
          label="View Details"
          onClick={() => handleViewAction(params.row.id)}
          sx={{
            color: 'primary.main',
          }}
        />,
      ],
    },
  ];

  if (loading) {
    return (
      <Box className="dashboard-container">
        <Box className="loading-spinner">
          <CircularProgress size={60} />
        </Box>
      </Box>
    );
  }

  return (
    <Box className="dashboard-container">
      {/* Header Section */}
      <Box className="header-section">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography className="header-title">
              Merchant Onboarding Dashboard
            </Typography>
            <Typography className="header-subtitle">
              Manage and track merchant onboarding progress
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleNewCustomerClick}
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
              },
            }}
          >
            New Merchant
          </Button>
        </Box>
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Customer Created Message */}
      {customerCreatedMessage && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {customerCreatedMessage}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card" onClick={() => console.log('Total Customers clicked')}>
            <CardContent>
              <PeopleIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {stats.total}
              </Typography>
              <Typography className="stats-label">
                Total Merchants
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card in-progress" onClick={() => console.log('In Progress clicked')}>
            <CardContent>
              <TrendingUpIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {stats.inProgress}
              </Typography>
              <Typography className="stats-label">
                In Progress
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card completed" onClick={() => console.log('Completed clicked')}>
            <CardContent>
              <CheckCircleIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {stats.completed}
              </Typography>
              <Typography className="stats-label">
                Completed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card className="stats-card on-hold" onClick={() => console.log('On Hold clicked')}>
            <CardContent>
              <PauseIcon sx={{ fontSize: 40, mb: 2, opacity: 0.9 }} />
              <Typography className="stats-number">
                {stats.onHold}
              </Typography>
              <Typography className="stats-label">
                On Hold
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Data Grid */}
      <Card className="data-grid-container">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" fontWeight={600}>
            Merchant Applications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {customers.length} total applications
            {loading && ' (loading...)'}
          </Typography>
        </Box>
        
        <DataGrid
          key={`customers-${customers.length}`}
          loading={loading}
          rows={customers.map(customer => ({ ...customer, id: customer.id || customer.customer_id }))}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 10 },
            },
            sorting: {
              sortModel: [{ field: 'created_date', sort: 'desc' }], // Default sort by creation date descending
            },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          onRowClick={handleRowClick}
          slots={{
            toolbar: GridToolbar,
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: { debounceMs: 500 },
            },
          }}
          getRowId={(row) => row.id || row.customer_id}
          autoHeight
          sx={{
            border: 'none',
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid #f0f0f0',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: '#f8fafc',
              borderBottom: '2px solid #e2e8f0',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
            },
            '& .MuiDataGrid-columnSeparator': {
              color: '#e2e8f0',
              width: '2px',
            },
            '& .MuiDataGrid-columnSeparator--resizing': {
              color: '#3b82f6',
              width: '3px',
            },
            '& .MuiDataGrid-columnHeader:focus': {
              outline: 'none',
            },
            '& .MuiDataGrid-cell:focus': {
              outline: 'none',
            },
          }}
        />
      </Card>

      {/* New Merchant Form */}
      <NewMerchantForm
        open={newCustomerFormOpen}
        onClose={handleNewCustomerClose}
        onCustomerCreated={handleCustomerCreated}
        initialDocuments={{}}
      />
    </Box>
  );
};

export default Dashboard; 
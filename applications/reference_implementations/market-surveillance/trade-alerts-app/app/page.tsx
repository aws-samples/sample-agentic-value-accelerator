'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth/authService';
import { getAlerts, isApiConfigured, triggerInvestigation } from '@/lib/api/alertsService';
import { summariesService } from '@/lib/api/summariesService';

const ITEMS_PER_PAGE = 10;

export default function Home() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigationSuccess, setInvestigationSuccess] = useState(false);
  const [investigationError, setInvestigationError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Investigation summary status per alert
  const [summaryStatuses, setSummaryStatuses] = useState<Record<string, string | null>>({});

  // Search filters
  const [isinFilter, setIsinFilter] = useState('');
  const [accountNumberFilter, setAccountNumberFilter] = useState('');
  const [accountNameFilter, setAccountNameFilter] = useState('');
  const [alertIdFilter, setAlertIdFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [alertAgeMinFilter, setAlertAgeMinFilter] = useState('');
  const [alertAgeMaxFilter, setAlertAgeMaxFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'alertAge'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await authService.isAuthenticated();

      if (!isAuth) {
        // Redirect to login with current page as redirect target
        router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      } else {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch alerts from API when filters change
  useEffect(() => {
    if (isCheckingAuth) return;

    const fetchAlerts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getAlerts({
          status: statusFilter === 'all' ? undefined : statusFilter,
          isin: isinFilter || undefined,
          accountNumber: accountNumberFilter || undefined,
          accountName: accountNameFilter || undefined,
          alertId: alertIdFilter || undefined,
          dateFrom: dateFromFilter || undefined,
          dateTo: dateToFilter || undefined,
          sortBy,
          sortOrder,
          limit: 1000, // Get all for client-side pagination
          offset: 0,
        });

        setAlerts(response.alerts || []);
      } catch (err: any) {
        console.error('Failed to fetch alerts:', err);
        setError(err.message || 'Failed to load alerts');
        setAlerts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlerts();
  }, [isCheckingAuth, statusFilter, isinFilter, accountNumberFilter, accountNameFilter, alertIdFilter, dateFromFilter, dateToFilter, sortBy, sortOrder]);

  // Fetch investigation summary statuses for current page alerts
  // Derive visible alert IDs from state (can't reference currentAlerts — it's defined after the early return)
  useEffect(() => {
    // Recompute the current page slice from alerts + filters
    const filtered = alerts.filter(alert => {
      const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
      const matchesIsin = !isinFilter || alert.ISIN?.toLowerCase().includes(isinFilter.toLowerCase());
      const matchesAccountNumber = !accountNumberFilter || alert.Account_Number?.toLowerCase().includes(accountNumberFilter.toLowerCase());
      const matchesAccountName = !accountNameFilter || alert.Account_Name?.toLowerCase().includes(accountNameFilter.toLowerCase());
      const ageDays = Math.floor((Date.now() - new Date(alert.Alert_Date).getTime()) / (1000 * 60 * 60 * 24));
      const matchesAgeMin = !alertAgeMinFilter || ageDays >= parseInt(alertAgeMinFilter);
      const matchesAgeMax = !alertAgeMaxFilter || ageDays <= parseInt(alertAgeMaxFilter);
      return matchesStatus && matchesIsin && matchesAccountNumber && matchesAccountName && matchesAgeMin && matchesAgeMax;
    });
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageAlerts = filtered.slice(start, start + ITEMS_PER_PAGE);

    if (pageAlerts.length === 0) return;

    const fetchSummaryStatuses = async () => {
      const results: Record<string, string | null> = {};
      await Promise.all(
        pageAlerts.map(async (alert) => {
          if (summaryStatuses[alert.Alert_ID] !== undefined) {
            results[alert.Alert_ID] = summaryStatuses[alert.Alert_ID];
            return;
          }
          try {
            const response = await summariesService.getLatestSummary(alert.Alert_ID);
            results[alert.Alert_ID] = response?.summary?.status ?? null;
          } catch {
            results[alert.Alert_ID] = null;
          }
        })
      );
      setSummaryStatuses(prev => ({ ...prev, ...results }));
    };

    fetchSummaryStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, currentPage, statusFilter, isinFilter, accountNumberFilter, accountNameFilter, alertAgeMinFilter, alertAgeMaxFilter]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-[#232F3E] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Pending Review
          </span>
        );
      case 'investigating':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Under Investigation
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Resolved
          </span>
        );
      default:
        return null;
    }
  };

  const pendingCount = alerts.filter(a => a.status === 'pending').length;

  const getInvestigationBadge = (alertId: string) => {
    const status = summaryStatuses[alertId];
    if (status === undefined) {
      // Still loading
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200">
          <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
      );
    }
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
            </svg>
            Summary Ready
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
            <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Investigating
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed
          </span>
        );
      default:
        // null = no summary exists
        return null;
    }
  };

  // Helper to compute alert age in days
  const getAlertAgeDays = (alertDate: string): number => {
    const date = new Date(alertDate);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Filter alerts by status and search criteria
  const filteredAlerts = alerts.filter(alert => {
    // Status filter
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;

    // ISIN filter (case-insensitive partial match)
    const matchesIsin = !isinFilter || alert.ISIN.toLowerCase().includes(isinFilter.toLowerCase());

    // Account Number filter (case-insensitive partial match)
    const matchesAccountNumber = !accountNumberFilter || alert.Account_Number.toLowerCase().includes(accountNumberFilter.toLowerCase());

    // Account Name filter (case-insensitive partial match)
    const matchesAccountName = !accountNameFilter || alert.Account_Name.toLowerCase().includes(accountNameFilter.toLowerCase());

    // Alert Age range filter (client-side)
    const ageDays = getAlertAgeDays(alert.Alert_Date);
    const matchesAgeMin = !alertAgeMinFilter || ageDays >= parseInt(alertAgeMinFilter);
    const matchesAgeMax = !alertAgeMaxFilter || ageDays <= parseInt(alertAgeMaxFilter);

    return matchesStatus && matchesIsin && matchesAccountNumber && matchesAccountName && matchesAgeMin && matchesAgeMax;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredAlerts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentAlerts = filteredAlerts.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusFilter = (status: 'all' | 'pending' | 'resolved') => {
    setStatusFilter(status);
    setCurrentPage(1); // Reset to first page when filter changes
    setSelectedAlerts(new Set()); // Clear selection when filter changes
  };

  const handleClearFilters = () => {
    setIsinFilter('');
    setAccountNumberFilter('');
    setAccountNameFilter('');
    setAlertIdFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setAlertAgeMinFilter('');
    setAlertAgeMaxFilter('');
    setSortBy('date');
    setSortOrder('desc');
    setStatusFilter('all');
    setCurrentPage(1);
    setSelectedAlerts(new Set());
  };

  const hasActiveFilters = isinFilter || accountNumberFilter || accountNameFilter || alertIdFilter || dateFromFilter || dateToFilter || alertAgeMinFilter || alertAgeMaxFilter || statusFilter !== 'all';

  const toggleSelectAlert = (alertId: string) => {
    const newSelected = new Set(selectedAlerts);
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId);
    } else {
      newSelected.add(alertId);
    }
    setSelectedAlerts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedAlerts.size === currentAlerts.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(currentAlerts.map(a => a.Alert_ID)));
    }
  };

  const handleBulkInvestigate = () => {
    console.log('Starting investigation for alerts:', Array.from(selectedAlerts));
    setShowBulkModal(true);
  };

  const confirmBulkInvestigation = async () => {
    setIsInvestigating(true);
    setInvestigationError(null);
    setInvestigationSuccess(false);

    try {
      const alertIds = Array.from(selectedAlerts);
      
      // Call the investigation API
      const result = await triggerInvestigation({
        alertIds,
        triggeredBy: 'manual',
      });

      console.log('Investigation triggered:', result);
      
      // Show success
      setInvestigationSuccess(true);
      setShowBulkModal(false);
      
      // Clear selection and summary cache so badges refresh
      setTimeout(() => {
        setSelectedAlerts(new Set());
        setInvestigationSuccess(false);
        // Clear cached statuses for investigated alerts so they re-fetch
        setSummaryStatuses(prev => {
          const updated = { ...prev };
          alertIds.forEach(id => delete updated[id]);
          return updated;
        });
      }, 3000);

    } catch (error: any) {
      console.error('Failed to trigger investigation:', error);
      setInvestigationError(error.message || 'Failed to trigger investigation');
    } finally {
      setIsInvestigating(false);
    }
  };

  const isAllSelected = currentAlerts.length > 0 && selectedAlerts.size === currentAlerts.length;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-7xl">
        {/* Header Section */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#232F3E] mb-1">Market Surveillance Alert Disposition</h1>
          <p className="text-sm text-gray-600">Monitor and investigate suspicious trading activities</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Alerts</p>
                <p className="text-2xl font-bold text-[#232F3E]">{alerts.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-[#232F3E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Pending Review</p>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 card-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Resolved</p>
                <p className="text-2xl font-bold text-emerald-600">{alerts.filter(a => a.status === 'resolved').length}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Search Filters */}
        <div className="bg-white rounded-xl card-shadow p-4 mb-4 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#232F3E]">Search & Filter</h2>
            <div className="flex items-center space-x-3">
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs text-[#007FAA] hover:text-[#005276] font-medium flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              )}
            </div>
          </div>

          {/* Alert ID Search */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Alert ID</label>
            <input
              type="text"
              value={alertIdFilter}
              onChange={(e) => {
                setAlertIdFilter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Alert ID..."
              className="w-full md:w-64 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
            />
          </div>

          {/* Existing text filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ISIN</label>
              <input
                type="text"
                value={isinFilter}
                onChange={(e) => {
                  setIsinFilter(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by ISIN..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Number</label>
              <input
                type="text"
                value={accountNumberFilter}
                onChange={(e) => {
                  setAccountNumberFilter(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by account number..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Name</label>
              <input
                type="text"
                value={accountNameFilter}
                onChange={(e) => {
                  setAccountNameFilter(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by account name..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
              />
            </div>
          </div>

          {/* Date Range & Alert Age Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => {
                    setDateFromFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
                />
                <span className="text-xs text-gray-500 flex-shrink-0">to</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => {
                    setDateToFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Alert Age (days)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  value={alertAgeMinFilter}
                  onChange={(e) => {
                    setAlertAgeMinFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Min"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
                />
                <span className="text-xs text-gray-500 flex-shrink-0">to</span>
                <input
                  type="number"
                  min="0"
                  value={alertAgeMaxFilter}
                  onChange={(e) => {
                    setAlertAgeMaxFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Max"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Sort Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-700">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'date' | 'alertAge');
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#232F3E] focus:border-transparent"
            >
              <option value="date">Alert Date</option>
              <option value="alertAge">Alert Age</option>
            </select>
            <button
              onClick={() => {
                setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                setCurrentPage(1);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? (
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              )}
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start">
            <svg className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-red-800 mb-1">Error Loading Alerts</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Investigation Success Message */}
        {investigationSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-start">
            <svg className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-green-800 mb-1">Investigation Triggered Successfully</h3>
              <p className="text-sm text-green-700">
                AI agents are now investigating the selected alerts. Results will be available shortly.
              </p>
            </div>
          </div>
        )}

        {/* Investigation Error Message */}
        {investigationError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start">
            <svg className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-red-800 mb-1">Investigation Failed</h3>
              <p className="text-sm text-red-700">{investigationError}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-xl card-shadow p-8 text-center border border-gray-200 mb-4">
            <svg className="animate-spin h-12 w-12 text-[#232F3E] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Loading alerts...</p>
          </div>
        )}

        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-700">Status:</span>
            <button
              onClick={() => handleStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === 'all'
                ? 'bg-[#232F3E] text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => handleStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => handleStatusFilter('resolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === 'resolved'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              Resolved ({alerts.filter(a => a.status === 'resolved').length})
            </button>
          </div>

          {/* Bulk Actions */}
          {selectedAlerts.size > 0 && (
            <button
              onClick={handleBulkInvestigate}
              className="inline-flex items-center px-4 py-2 bg-[#007FAA] text-white rounded-lg text-sm font-semibold hover:bg-[#005276] transition-all duration-200 card-shadow"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Investigate Selected ({selectedAlerts.size})
            </button>
          )}
        </div>

        {/* Alerts List */}
        {!isLoading && filteredAlerts.length > 0 && (
          <div className="bg-white rounded-xl card-shadow overflow-hidden border border-gray-200">
            {/* Select All Header */}
            <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-[#007FAA] border-gray-300 rounded focus:ring-[#007FAA] focus:ring-2 cursor-pointer"
                />
                <span className="ml-2 text-xs font-medium text-gray-700">
                  {isAllSelected ? 'Deselect All' : 'Select All'}
                </span>
              </label>
              {selectedAlerts.size > 0 && (
                <span className="ml-4 text-xs text-gray-600">
                  {selectedAlerts.size} alert{selectedAlerts.size !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>

            <div className="divide-y divide-gray-200">
              {currentAlerts.map((alert) => (
                <div
                  key={alert.Alert_ID}
                  className={`flex items-start hover:bg-blue-50 transition-colors ${selectedAlerts.has(alert.Alert_ID) ? 'bg-blue-50/50' : ''
                    }`}
                >
                  {/* Checkbox */}
                  <div className="flex items-center px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedAlerts.has(alert.Alert_ID)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectAlert(alert.Alert_ID);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-[#007FAA] border-gray-300 rounded focus:ring-[#007FAA] focus:ring-2 cursor-pointer"
                    />
                  </div>

                  {/* Alert Content */}
                  <Link
                    href={`/alerts/${alert.Alert_ID}`}
                    className="flex-1 p-3 pl-0"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#232F3E]">
                          Alert #{alert.Alert_ID}
                        </h3>
                        {getStatusBadge(alert.status)}
                        {getInvestigationBadge(alert.Alert_ID)}
                      </div>
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    <p className="text-xs text-gray-700 mb-2">{alert.Alert_Summary}</p>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Account</p>
                        <p className="font-medium text-gray-900 text-xs">{alert.Account_Name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Account Number</p>
                        <p className="font-medium text-gray-900 text-xs">{alert.Account_Number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Date & Time</p>
                        <p className="font-medium text-gray-900 text-xs">
                          {new Date(alert.Alert_Date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} {alert.Alert_time}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Alert Age</p>
                        <p className="font-medium text-gray-900 text-xs">{getAlertAgeDays(alert.Alert_Date)}d</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">ISIN</p>
                        <p className="font-medium text-gray-900 font-mono text-xs">{alert.ISIN}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Risk Score</p>
                        <p className="font-medium text-gray-900 text-xs">
                          {alert.Alert_Risk_Score != null ? alert.Alert_Risk_Score : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results Message */}
        {!isLoading && filteredAlerts.length === 0 && (
          <div className="bg-white rounded-xl card-shadow p-8 text-center border border-gray-200">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No alerts found</h3>
            <p className="text-sm text-gray-600 mb-4">
              No alerts match your current filters. Try adjusting your search criteria.
            </p>
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center px-4 py-2 bg-[#232F3E] text-white rounded-lg text-sm font-semibold hover:bg-[#001a4d] transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="text-sm text-gray-600 text-center sm:text-left">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredAlerts.length)} of {filteredAlerts.length} alerts
              {hasActiveFilters && ` (filtered)`}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
              {/* Previous Button */}
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-[#232F3E] hover:bg-blue-50 border border-gray-200'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Page Numbers */}
              {getPageNumbers().map((page, index) => (
                <button
                  key={index}
                  onClick={() => typeof page === 'number' && goToPage(page)}
                  disabled={page === '...'}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${page === currentPage
                    ? 'bg-[#232F3E] text-white'
                    : page === '...'
                      ? 'bg-transparent text-gray-400 cursor-default'
                      : 'bg-white text-[#232F3E] hover:bg-blue-50 border border-gray-200'
                    }`}
                >
                  {page}
                </button>
              ))}

              {/* Next Button */}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-[#232F3E] hover:bg-blue-50 border border-gray-200'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Investigation Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 card-shadow">
            <div className="flex items-start mb-6">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[#232F3E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-2xl font-bold text-[#232F3E] mb-2">Start Bulk Investigation</h2>
                <p className="text-gray-600">
                  You are about to start an AI-powered investigation for {selectedAlerts.size} selected alert{selectedAlerts.size !== 1 ? 's' : ''}.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-[#232F3E] mb-2">Selected Alerts:</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedAlerts).map((alertId) => (
                  <span key={alertId} className="inline-flex items-center px-3 py-1 bg-white rounded-lg text-sm font-medium text-gray-700 border border-blue-200">
                    #{alertId}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">What happens next:</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-[#007FAA] mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Investigation request will be submitted immediately</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-[#007FAA] mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>AI agents will process each alert in the background</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-[#007FAA] mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>You can continue working while investigations run</span>
                </li>
              </ul>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowBulkModal(false)}
                disabled={isInvestigating}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkInvestigation}
                disabled={isInvestigating}
                className="flex-1 px-6 py-3 bg-[#007FAA] text-white rounded-lg font-semibold hover:bg-[#005276] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isInvestigating ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Triggering...
                  </>
                ) : (
                  'Start Investigation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

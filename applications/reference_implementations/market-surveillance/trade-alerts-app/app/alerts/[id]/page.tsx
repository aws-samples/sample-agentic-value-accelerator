'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    getAlertDetails,
    getAlertAccount,
    getAlertProduct,
    getAlertCustomerTrade,
    getAlertRelatedTrades,
    isApiConfigured,
    triggerInvestigation
} from '@/lib/api/alertsService';
import { summariesService } from '@/lib/api/summariesService';

// Synthetic data generator based on schema
const generateAlertData = (id: string) => ({
    Alert_ID: parseInt(id),
    Alert_Date: '5/10/2025',
    Alert_time: '11:44:11',
    Alert_Summary: 'Possible market surveillance alert',
    Disposition_scenario: 'Specific book',

    Account_ID: 'FIG708',
    Account_number: 'HGIX-X14',
    Account_Name: 'Vanguard Demo Capital',
    Account_Type: 'Client',
    Account_Sub_Type: 'Pension Fund',
    FRB_Code: 'FISY-sub2',
    MLI_Number: 'KH-(number)',

    ISIN: 'ARFMCGDEL1',
    CUSIP: 'A7XNUCNU',
    BBGID: 'A7XNUCGDEL1',
    Product_Description: '4.875 % 02/15/2030',
    Country_of_issue: 'US',
    Currency_of_issue: 'USD',
    Issue_Date: '9/27/2020',
    Product_Sub_Type: 'Corporate Bond',
    Product_Type: 'Corporate Bond',

    // Single customer trade that triggered the alert
    Customer_Trade: {
        Account_Name: 'Vanguard Demo Capital',
        Count: 1,
        Lowest_Trade_Type: 'Trade',
        Trade_Side: 'B',
        Book_Code: 'HGCV/WiWest',
        Standard_ID: 'EXBHZQVE',
        Trade_Qty: 20000000,
        Trade_Price: 101.65,
        Trade_Date: '9/27/2020',
        Trade_Time: '16:05:00',
        Trade_entry_date: 'Intermed',
        Event_Type: 'Inside',
        Trader_Capacity: 'Dealer',
        Trade_Source: 'Soccr23',
        Legal_Entity: 'LE3',
        Algo: 'FALSE',
        Trade_Type: 'TypeC',
        Trader_ID: 'HGCV/WiWest',
        Trader_Name: 'Ethan Kim',
        Venue: 'Venue1',
        Dealer_Name: 'Soccr23',
        Trade_Venue: 'Soccr23',
        Is_Voice_Trade: 'N'
    },

    Related_Trades: Array.from({ length: 10 }, (_, i) => ({
        Account_Name: [
            'Acme Capital Partners', 'Globex Asset Management',
            'Pinnacle Investment Group', 'Summit Demo Partners', 'Atlas Wealth Advisors',
            'Apex Fund Strategies', 'Meridian Global Holdings', 'Zenith Investment Group',
            'Nexus Asset Management', 'Vanguard Demo Capital'
        ][i],
        Count: i + 1,
        Lowest_Trade_Type: 'Trade',
        Trade_Side: i % 2 === 0 ? 'B' : 'S',
        Book_Code: ['HGCV/WiWest', 'TGBJ35', 'FZGJ50', 'NZLJ67', 'MXLJ89'][i % 5],
        Standard_ID: `${['EXBH', 'VVMJ', 'VVTJ', 'PQRS', 'WXYZ'][i % 5]}${String(i).padStart(4, '0')}`,
        Trade_Qty: [20000000, 10000000, 5000000, 15000000, 8000000][i % 5],
        Trade_Price: 101.65 + (i * 0.01),
        Trade_Date: '9/27/2020',
        Trade_Time: `${15 + Math.floor(i / 4)}:${String((i % 4) * 15).padStart(2, '0')}:00`,
        Trader_ID: `Trader${String(i + 1).padStart(3, '0')}`,
        Trader_Name: [
            'Olivia Wang', 'Mia Garcia', 'Liam Chen', 'Emma Johnson',
            'Noah Martinez', 'Ava Rodriguez', 'William Lee', 'Sophia Taylor', 'James Anderson',
            'Isabella Thomas'
        ][i],
        Venue: ['Venue1', 'Venue2', 'Venue3'][i % 3],
        Trade_ID: `HGCV${String(i + 1000).padStart(4, '0')}`,
        Trade_State: ['Soccr2', 'Soccr3'][i % 2],
        Align_Type: ['TRUE', 'FALSE'][i % 2],
        Trader_Capacity: 'Dealer',
        Legal_Entity: ['LE1', 'LE2', 'LE3'][i % 3],
        Trade_Type: ['TypeA', 'TypeB', 'TypeC'][i % 3],
        Is_Voice_Trade: ['Y', 'N'][i % 2]
    }))
});

export default function AlertDetailPage() {
    const params = useParams();
    const id = params.id as string;

    const [alertData, setAlertData] = useState<any>(null);
    const [accountData, setAccountData] = useState<any>(null);
    const [productData, setProductData] = useState<any>(null);
    const [customerTradeData, setCustomerTradeData] = useState<any>(null);
    const [relatedTradesData, setRelatedTradesData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summaryStatus, setSummaryStatus] = useState<string | null | undefined>(undefined); // undefined=loading, null=no summary, string=status
    const [isTriggering, setIsTriggering] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);
    const [triggerError, setTriggerError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const [alert, account, product, customerTrade, relatedTrades] = await Promise.all([
                    getAlertDetails(id),
                    getAlertAccount(id),
                    getAlertProduct(id),
                    getAlertCustomerTrade(id),
                    getAlertRelatedTrades(id, 50)
                ]);

                console.log('customer trade response', customerTrade);
                console.log('related trades response', relatedTrades);

                setAlertData(alert.alert);
                setAccountData(account.account);
                setProductData(product.product);
                setCustomerTradeData(customerTrade.customerTrade);
                setRelatedTradesData(relatedTrades.relatedTrades || []);
            } catch (err: any) {
                console.error('Failed to fetch alert data:', err);
                setError(err.message || 'Failed to load alert details');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id]);

    // Fetch investigation summary status
    useEffect(() => {
        const fetchSummaryStatus = async () => {
            try {
                const response = await summariesService.getLatestSummary(id);
                setSummaryStatus(response?.summary?.status ?? null);
            } catch {
                setSummaryStatus(null);
            }
        };
        fetchSummaryStatus();
    }, [id, triggerSuccess]);

    const handleStartInvestigation = async () => {
        setIsTriggering(true);
        setTriggerError(null);
        try {
            await triggerInvestigation({ alertId: id });
            setTriggerSuccess(true);
            setSummaryStatus(undefined); // reset to loading so it re-fetches
            setTimeout(() => setTriggerSuccess(false), 3000);
        } catch (err: any) {
            setTriggerError(err.message || 'Failed to trigger investigation');
        } finally {
            setIsTriggering(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <svg className="animate-spin h-12 w-12 text-[#232F3E] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-600">Loading alert details...</p>
                </div>
            </div>
        );
    }

    if (!alertData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Alert Not Found</h2>
                    <p className="text-gray-600 mb-4">{error || 'The requested alert could not be loaded.'}</p>
                    <Link href="/" className="inline-flex items-center px-4 py-2 bg-[#007FAA] text-white rounded-lg hover:bg-[#005276] transition-colors">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Alerts
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-[1600px]">
                <div className="mb-6">
                    <Link href="/" className="inline-flex items-center text-[#232F3E] hover:text-[#007FAA] font-medium transition-colors">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Alerts
                    </Link>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start">
                        <svg className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 className="text-sm font-semibold text-red-800 mb-1">Error Loading Alert</h3>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                )}

                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold text-[#007FAA]">Alert detail</h1>
                    <div className="flex flex-wrap gap-2 items-center">
                        {/* Investigation trigger feedback */}
                        {triggerSuccess && (
                            <span className="text-sm text-emerald-600 font-medium">Investigation triggered</span>
                        )}
                        {triggerError && (
                            <span className="text-sm text-red-600 font-medium">{triggerError}</span>
                        )}

                        {/* Conditional summary/investigation button */}
                        {summaryStatus === undefined ? (
                            <span className="inline-flex items-center px-4 py-2 text-sm text-gray-400">
                                <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </span>
                        ) : summaryStatus === 'completed' || summaryStatus === 'pending' || summaryStatus === 'failed' ? (
                            <Link
                                href={`/alerts/${id}/summary`}
                                className="px-4 py-2 bg-white border-2 border-[#007FAA] text-[#007FAA] rounded-lg font-medium hover:bg-[#007FAA] hover:text-white transition-colors"
                            >
                                View Investigation Summary
                            </Link>
                        ) : (
                            <button
                                onClick={handleStartInvestigation}
                                disabled={isTriggering}
                                className="px-4 py-2 bg-[#007FAA] text-white rounded-lg font-medium hover:bg-[#005276] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                            >
                                {isTriggering ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Starting...
                                    </>
                                ) : (
                                    'Start Investigation'
                                )}
                            </button>
                        )}

                        <Link
                            href={`/alerts/${id}/chat`}
                            className="px-4 py-2 bg-[#007FAA] text-white rounded-lg font-medium hover:bg-[#005276] transition-colors"
                        >
                            Chat with AI Agent
                        </Link>
                    </div>
                </div>

                {/* Alert Section - Using Real Data from API */}
                <div className="bg-white rounded-lg border border-gray-200 mb-4">
                    <div className="bg-[#007FAA] text-white px-4 py-2 rounded-t-lg">
                        <h2 className="text-sm font-semibold">Alert</h2>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-3 text-sm">
                            <div><span className="text-gray-600">Alert ID:</span><span className="ml-2 font-medium">{alertData.Alert_ID}</span></div>
                            <div><span className="text-gray-600">Date:</span><span className="ml-2 font-medium">{new Date(alertData.Alert_Date).toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' })}</span></div>
                            <div><span className="text-gray-600">Time:</span><span className="ml-2 font-medium">{alertData.Alert_time}</span></div>
                            <div><span className="text-gray-600">Age:</span><span className="ml-2 font-medium">{Math.floor((new Date().getTime() - new Date(alertData.Alert_Date).getTime()) / (1000 * 60 * 60 * 24))}d</span></div>
                            <div>
                                <span className="text-gray-600">Status:</span>
                                {alertData.status === 'pending' && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
                                )}
                                {alertData.status === 'investigating' && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Investigating</span>
                                )}
                                {alertData.status === 'resolved' && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Resolved</span>
                                )}
                            </div>
                            <div>
                                <span className="text-gray-600">Trade Side:</span>
                                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${alertData.Trade_Side === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {alertData.Trade_Side === 'B' ? 'BUY' : 'SELL'}
                                </span>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4 xl:col-span-6"><span className="text-gray-600">Summary:</span><span className="ml-2 font-medium">{alertData.Alert_Summary}</span></div>
                            <div><span className="text-gray-600">ISIN:</span><span className="ml-2 font-medium font-mono">{alertData.ISIN}</span></div>
                            <div><span className="text-gray-600">Account:</span><span className="ml-2 font-medium">{alertData.Account_Name}</span></div>
                            <div><span className="text-gray-600">Account #:</span><span className="ml-2 font-medium">{alertData.Account_Number}</span></div>
                            <div><span className="text-gray-600">Qty:</span><span className="ml-2 font-medium">{alertData.Trade_Qty.toLocaleString()}</span></div>
                            <div><span className="text-gray-600">Price:</span><span className="ml-2 font-medium">{alertData.Trade_Price.toFixed(2)}</span></div>
                            <div><span className="text-gray-600">Notional Amount:</span><span className="ml-2 font-medium">${((alertData.Trade_Price / 100) * alertData.Trade_Qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                        </div>
                    </div>
                </div>

                {/* Account Section - Using Real Data from API */}
                {accountData && (
                    <div className="bg-white rounded-lg border border-gray-200 mb-4">
                        <div className="bg-[#007FAA] text-white px-4 py-2 rounded-t-lg">
                            <h2 className="text-sm font-semibold">Account</h2>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div><span className="text-gray-600">Account ID:</span><span className="ml-2 font-medium">{accountData.Account_ID}</span></div>
                                <div><span className="text-gray-600">Account Type:</span><span className="ml-2 font-medium">{accountData.Account_Type}</span></div>
                                <div><span className="text-gray-600">FRB Code:</span><span className="ml-2 font-medium">{accountData.FRB_Code || 'N/A'}</span></div>
                                <div></div>
                                <div><span className="text-gray-600">Account number:</span><span className="ml-2 font-medium">{accountData.Account_Number || accountData.Account_number}</span></div>
                                <div><span className="text-gray-600">Account Sub Type:</span><span className="ml-2 font-medium">{accountData.Account_Sub_Type}</span></div>
                                <div><span className="text-gray-600">MLI Number:</span><span className="ml-2 font-medium">{accountData.MLI_Number || 'N/A'}</span></div>
                                <div></div>
                                <div className="sm:col-span-2"><span className="text-gray-600">Account Name:</span><span className="ml-2 font-medium">{accountData.Account_Name}</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Product Section - Using Real Data from API */}
                {productData && (
                    <div className="bg-white rounded-lg border border-gray-200 mb-4">
                        <div className="bg-[#007FAA] text-white px-4 py-2 rounded-t-lg">
                            <h2 className="text-sm font-semibold">Product</h2>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div><span className="text-gray-600">ISIN:</span><span className="ml-2 font-medium">{productData.ISIN}</span></div>
                                <div><span className="text-gray-600">Product Description:</span><span className="ml-2 font-medium">{productData.Product_Description}</span></div>
                                <div><span className="text-gray-600">Product Type:</span><span className="ml-2 font-medium">{productData.Product_Type}</span></div>
                                <div><span className="text-gray-600">Maturity Date:</span><span className="ml-2 font-medium">{productData.Maturity_Date ? new Date(productData.Maturity_Date).toLocaleDateString() : 'N/A'}</span></div>
                                <div><span className="text-gray-600">CUSIP:</span><span className="ml-2 font-medium">{productData.CUSIP}</span></div>
                                <div><span className="text-gray-600">Country of issue:</span><span className="ml-2 font-medium">{productData.Country_of_issue}</span></div>
                                <div><span className="text-gray-600">Product Sub Type:</span><span className="ml-2 font-medium">{productData.Product_Sub_Type}</span></div>
                                <div></div>
                                <div><span className="text-gray-600">BBGID:</span><span className="ml-2 font-medium">{productData.BBGID}</span></div>
                                <div><span className="text-gray-600">Currency of issue:</span><span className="ml-2 font-medium">{productData.Currency_of_issue}</span></div>
                                <div><span className="text-gray-600">Issue Date:</span><span className="ml-2 font-medium">{productData.Issue_Date ? new Date(productData.Issue_Date).toLocaleDateString() : 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Pivot Trade Section - Using Real Data from API */}
                {customerTradeData && (
                    <div className="bg-white rounded-lg border border-gray-200 mb-4">
                        <div className="bg-[#007FAA] text-white px-4 py-2 rounded-t-lg">
                            <h2 className="text-sm font-semibold">Pivot Trade</h2>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                                <div>
                                    <span className="text-gray-600 block mb-1">Account Name</span>
                                    <span className="font-medium">{customerTradeData.Account_Name}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Side</span>
                                    <span className="font-medium">{customerTradeData.Trade_Side}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Qty</span>
                                    <span className="font-medium">{customerTradeData.Trade_Qty?.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Price</span>
                                    <span className="font-medium">{customerTradeData.Trade_Price}</span>
                                </div>

                                <div>
                                    <span className="text-gray-600 block mb-1">Book Code</span>
                                    <span className="font-medium">{customerTradeData.Book_Code}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trader Standard ID</span>
                                    <span className="font-medium">{customerTradeData.Standard_ID}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Date</span>
                                    <span className="font-medium">{customerTradeData.Trade_Date ? new Date(customerTradeData.Trade_Date).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Time</span>
                                    <span className="font-medium">{customerTradeData.Trade_Time}</span>
                                </div>

                                <div>
                                    <span className="text-gray-600 block mb-1">Trader Name</span>
                                    <span className="font-medium">{customerTradeData.Trader_Name}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trader ID</span>
                                    <span className="font-medium">{customerTradeData.Trader_ID}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trader Capacity</span>
                                    <span className="font-medium">{customerTradeData.Trader_Capacity}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Venue</span>
                                    <span className="font-medium">{customerTradeData.Venue}</span>
                                </div>

                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Type</span>
                                    <span className="font-medium">{customerTradeData.Trade_Type}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Event Type</span>
                                    <span className="font-medium">{customerTradeData.Event_Type}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Legal Entity</span>
                                    <span className="font-medium">{customerTradeData.Legal_Entity}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Source</span>
                                    <span className="font-medium">{customerTradeData.Trade_Source}</span>
                                </div>

                                <div>
                                    <span className="text-gray-600 block mb-1">Dealer Name</span>
                                    <span className="font-medium">{customerTradeData.Dealer_Name}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Trade Venue</span>
                                    <span className="font-medium">{customerTradeData.Trade_Venue || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Is Voice Trade</span>
                                    <span className="font-medium">{customerTradeData.Is_Voice_Trade}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600 block mb-1">Is Algo Trade</span>
                                    <span className="font-medium">{customerTradeData.Algo}</span>
                                </div>

                                <div>
                                    <span className="text-gray-600 block mb-1">Notional Amount</span>
                                    <span className="font-medium">{customerTradeData.Trade_Notional != null ? `$${customerTradeData.Trade_Notional.toLocaleString()}` : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Flagged Trades Section - Using Real Data from API */}
                {relatedTradesData && relatedTradesData.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200">
                        <div className="bg-[#007FAA] text-white px-4 py-2 rounded-t-lg">
                            <h2 className="text-sm font-semibold">Flagged Trades ({relatedTradesData.length})</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Account Name</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Side</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Book Code</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Standard ID</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Qty</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Price</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Date</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Time</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trader ID</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trader Name</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Venue</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade ID</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade State</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trader Capacity</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Legal Entity</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Trade Type</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-700">Is Voice Trade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {relatedTradesData.map((trade, index) => (
                                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-2 py-2">{trade.Account_Name}</td>
                                            <td className="px-2 py-2">{trade.Trade_Side}</td>
                                            <td className="px-2 py-2">{trade.Book_Code}</td>
                                            <td className="px-2 py-2">{trade.Standard_ID}</td>
                                            <td className="px-2 py-2 text-right">{trade.Trade_Qty?.toLocaleString()}</td>
                                            <td className="px-2 py-2 text-right">{trade.Trade_Price?.toFixed(2)}</td>
                                            <td className="px-2 py-2">{trade.Trade_Date ? new Date(trade.Trade_Date).toLocaleDateString() : ''}</td>
                                            <td className="px-2 py-2">{trade.Trade_Time}</td>
                                            <td className="px-2 py-2">{trade.Trader_ID}</td>
                                            <td className="px-2 py-2">{trade.Trader_Name}</td>
                                            <td className="px-2 py-2">{trade.Venue}</td>
                                            <td className="px-2 py-2">{trade.Trade_ID}</td>
                                            <td className="px-2 py-2">{trade.Trade_State}</td>
                                            <td className="px-2 py-2">{trade.Trader_Capacity}</td>
                                            <td className="px-2 py-2">{trade.Legal_Entity}</td>
                                            <td className="px-2 py-2">{trade.Trade_Type}</td>
                                            <td className="px-2 py-2">{trade.Is_Voice_Trade}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

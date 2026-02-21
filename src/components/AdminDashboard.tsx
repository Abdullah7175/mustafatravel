import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import StatCard from './StatCard';
import BarChart from './BarChart';
import { http } from '../lib/http';
import { 
  Calendar, 
  MessageSquare, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  XCircle,
  AlertTriangle,
  Download
} from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { inquiries, agents, approveChange, rejectChange, fetchAgents, fetchInquiries } = useData();
  const [chartType, setChartType] = React.useState<'bookings' | 'profit' | 'revenue'>('bookings');
  const [agentChartType, setAgentChartType] = React.useState<'bookings' | 'profit' | 'revenue'>('bookings');
  const [dashboardPeriod, setDashboardPeriod] = React.useState<'week' | 'month' | 'year'>('year');

  // Dashboard fetches its own bookings (same as Bookings tab) so stats/charts always show data
  const [dashboardBookings, setDashboardBookings] = React.useState<any[]>([]);
  const loadDashboardBookings = React.useCallback(async () => {
    try {
      const usr = JSON.parse(localStorage.getItem('user') || '{}');
      const endpoint = usr?.role === 'admin' ? '/api/bookings' : '/api/bookings/my';
      const { data } = await http.get(endpoint);
      const raw = Array.isArray(data) ? data : data?.data || data?.bookings || [];
      const idOf = (v: any) => (v && (v._id || v.id)) ? String(v._id || v.id) : undefined;
      const toMoneyString = (v: any) => { if (v == null) return undefined; if (typeof v === 'number') return `$${v}`; const n = Number(v); return Number.isFinite(n) ? `$${n}` : undefined; };
      const mapped = raw.map((b: any) => ({
        ...b,
        id: idOf(b),
        agentId: b?.agentId ?? (typeof b?.agent === 'string' ? b.agent : idOf(b?.agent?._id ?? b?.agent?.id)),
        agentName: (typeof b?.agent === 'object' && b?.agent?.name) ? b.agent.name : b?.agentName ?? '',
        amount: toMoneyString(b?.amount ?? b?.totalAmount),
      }));
      setDashboardBookings(mapped);
    } catch (e) {
      console.error('Dashboard fetch bookings failed', e);
      setDashboardBookings([]);
    }
  }, []);

  React.useEffect(() => {
    loadDashboardBookings();
    fetchInquiries();
    fetchAgents();
  }, [loadDashboardBookings, fetchInquiries, fetchAgents]);

  // Helper function to calculate profit from booking
  const getProfit = (booking: any): number => {
    // Prioritize calculated profit from costing.totals
    const costingTotals = booking?.costing?.totals || booking?.pricing?.totals || {};
    if (typeof costingTotals.profit === 'number') {
      return costingTotals.profit;
    }
    
    // Calculate profit as totalSale - totalCost
    const totalCost = costingTotals.totalCostPrice || costingTotals.totalCost || 0;
    const totalSale = costingTotals.totalSalePrice || costingTotals.totalSale || (booking?.totalAmount || booking?.amount || 0);
    if (totalSale > 0 || totalCost > 0) {
      return totalSale - totalCost;
    }
    
    // Fallback to totalAmount if no profit calculation available
    if (typeof booking?.totalAmount === 'number') {
      return booking.totalAmount;
    }
    if (typeof booking?.amount === 'number') {
      return booking.amount;
    }
    if (typeof booking?.totalAmount === 'string') {
      const n = Number(String(booking.totalAmount).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof booking?.amount === 'string') {
      const n = Number(String(booking.amount).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    
    return 0;
  };

  // Filter bookings by dashboard period (use createdAt = when booking was made; include if date missing/invalid so none are hidden)
  const getFilteredBookingsByDashboardPeriod = () => {
    const now = new Date();
    let startDate: Date;

    switch (dashboardPeriod) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    return dashboardBookings.filter(booking => {
      // Prefer createdAt (when booking was made); do not use travel date so future trips are not excluded
      const raw = (booking as any).createdAt ?? (booking as any).date;
      if (raw == null || raw === '') return true; // include if no date so we don't hide bookings
      const bookingDate = new Date(raw);
      if (Number.isNaN(bookingDate.getTime())) return true; // include if invalid date
      return bookingDate >= startDate && bookingDate <= now;
    });
  };

  // Filter inquiries by dashboard period
  const getFilteredInquiriesByDashboardPeriod = () => {
    const now = new Date();
    let startDate: Date;

    switch (dashboardPeriod) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    return inquiries.filter(inquiry => {
      const inquiryDate = new Date(inquiry.createdAt || 0);
      return inquiryDate >= startDate && inquiryDate <= now;
    });
  };

  // Get filtered data based on dashboard period
  const filteredDashboardBookings = getFilteredBookingsByDashboardPeriod();
  const filteredDashboardInquiries = getFilteredInquiriesByDashboardPeriod();

  // Get pending approvals from filtered data
  const pendingBookings = filteredDashboardBookings.filter(b => b.approvalStatus === 'pending');
  const pendingInquiries = filteredDashboardInquiries.filter(i => i.approvalStatus === 'pending');
  const totalPendingApprovals = pendingBookings.length + pendingInquiries.length;

  // Calculate total profit from filtered bookings
  const totalProfit = filteredDashboardBookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => {
      return sum + getProfit(b);
    }, 0);

  const activeInquiries = filteredDashboardInquiries.filter(i => i.status === 'pending').length;
  const resolvedInquiries = filteredDashboardInquiries.filter(i => i.status === 'responded' || i.status === 'closed').length;
  // Get period label for trends
  const getPeriodLabel = () => {
    switch (dashboardPeriod) {
      case 'week': return 'this week';
      case 'month': return 'this month';
      case 'year': return 'this year';
      default: return 'this month';
    }
  };

  const stats = [
    {
      title: 'Total Bookings',
      value: filteredDashboardBookings.length.toString(),
      icon: Calendar,
      color: 'bg-blue-500',
      trend: filteredDashboardBookings.length > 0 ? `${filteredDashboardBookings.length} ${getPeriodLabel()}` : `No bookings ${getPeriodLabel()}`,
    },
    {
      title: 'Active Inquiries',
      value: activeInquiries.toString(),
      icon: MessageSquare,
      color: 'bg-emerald-500',
      trend: `${resolvedInquiries} resolved`,
    },
    {
      title: 'Pending Approvals',
      value: totalPendingApprovals.toString(),
      icon: Clock,
      color: 'bg-orange-500',
      trend: totalPendingApprovals > 0 ? 'Needs attention' : 'All clear',
    },
    {
      title: 'Total Profit',
      value: `$${totalProfit.toLocaleString()}`,
      icon: TrendingUp,
      color: 'bg-purple-500',
      trend: `${filteredDashboardBookings.filter(b => b.status === 'confirmed').length} confirmed`,
    },
  ];



  // Filter bookings based on dashboard period (same logic: use createdAt, include if missing/invalid)
  const getFilteredBookings = () => {
    const now = new Date();
    let startDate: Date;

    switch (dashboardPeriod) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    return dashboardBookings.filter(booking => {
      const raw = (booking as any).createdAt ?? (booking as any).date;
      if (raw == null || raw === '') return true;
      const bookingDate = new Date(raw);
      if (Number.isNaN(bookingDate.getTime())) return true;
      return bookingDate >= startDate && bookingDate <= now;
    });
  };

  // Calculate real-time booking performance grouped by dates
  const filteredBookings = getFilteredBookings();

  // Helper function to get agent ID from booking
  const getAgentIdFromBooking = (booking: any): string | null => {
    // Try multiple possible fields in order of preference
    // The agent field can be:
    // 1. A direct agentId field
    // 2. An agent object with _id (populated)
    // 3. An agent object with id
    // 4. A string ObjectId (not populated)
    // 5. An ObjectId object (Mongoose)
    
    // First check for direct agentId field
    if (booking.agentId) {
      const id = String(booking.agentId).trim();
      if (id && id !== 'undefined' && id !== 'null') {
        return id;
      }
    }
    
    // Check if agent is an object with _id (populated User/Agent)
    if (booking.agent && typeof booking.agent === 'object') {
      if (booking.agent._id) {
        const id = String(booking.agent._id).trim();
        if (id && id !== 'undefined' && id !== 'null') {
          return id;
        }
      }
      if (booking.agent.id) {
        const id = String(booking.agent.id).trim();
        if (id && id !== 'undefined' && id !== 'null') {
          return id;
        }
      }
    }
    
    // Check if agent is a string ObjectId (not populated)
    if (booking.agent && typeof booking.agent === 'string') {
      const id = booking.agent.trim();
      if (id && id !== 'undefined' && id !== 'null') {
        return id;
      }
    }
    
    // Handle Mongoose ObjectId objects
    if (booking.agent && booking.agent.toString) {
      try {
        const id = String(booking.agent.toString()).trim();
        if (id && id !== 'undefined' && id !== 'null') {
          return id;
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Last resort: convert to string
    if (booking.agent) {
      const id = String(booking.agent).trim();
      if (id && id !== 'undefined' && id !== 'null' && id.length > 0) {
        return id;
      }
    }
    
    return null;
  };

  // Helper function to normalize agent ID
  const normalizeId = (id: any): string | null => {
    if (!id) return null;
    const idStr = String(id).trim();
    return idStr || null;
  };

  // Helper function to get agent name (from agents list or booking data)
  const getAgentName = (agentId: string | null, bookingAgentName?: string): string => {
    if (!agentId) return 'Unassigned';
    
    const normalizedAgentId = normalizeId(agentId);
    if (!normalizedAgentId) return 'Unassigned';
    
    // First try to find in agents list
    if (agents && agents.length > 0) {
      for (const agent of agents) {
        const agentIdNormalized = normalizeId(agent.id);
        if (!agentIdNormalized) continue;
        
        // Try multiple matching strategies
        const agentIdStr = String(agentIdNormalized).trim().toLowerCase();
        const bookingAgentIdStr = String(normalizedAgentId).trim().toLowerCase();
        
        // Direct match
        if (agentIdStr === bookingAgentIdStr) {
          const name = agent.name || '';
          if (name) {
            // If name contains admin/super, show as "Admin"
            if (name.toLowerCase().includes('admin') || name.toLowerCase().includes('super')) {
              return 'Admin';
            }
            // Otherwise return the agent name
            return name;
          }
        }
        
        // Match without spaces
        if (agentIdStr.replace(/\s+/g, '') === bookingAgentIdStr.replace(/\s+/g, '')) {
          const name = agent.name || '';
          if (name) {
            if (name.toLowerCase().includes('admin') || name.toLowerCase().includes('super')) {
              return 'Admin';
            }
            return name;
          }
        }
        
        // Match only the last part if IDs are similar (handle ObjectId string variations)
        const agentIdLast12 = agentIdStr.slice(-12);
        const bookingIdLast12 = bookingAgentIdStr.slice(-12);
        if (agentIdLast12.length >= 8 && agentIdLast12 === bookingIdLast12) {
          const name = agent.name || '';
          if (name) {
            if (name.toLowerCase().includes('admin') || name.toLowerCase().includes('super')) {
              return 'Admin';
            }
            return name;
          }
        }
      }
    }
    
    // Fallback to booking agent name
    if (bookingAgentName) {
      const name = String(bookingAgentName).trim();
      if (name && name.length > 0) {
        // If name contains admin/super, show as "Admin"
        if (name.toLowerCase().includes('admin') || name.toLowerCase().includes('super')) {
          return 'Admin';
        }
        // Otherwise return the agent name
        return name;
      }
    }
    
    // Check if agentId matches current user (admin creating their own bookings)
    const currentUserId = (user as any)?._id || (user as any)?.id;
    if (currentUserId) {
      const normalizedCurrentUserId = normalizeId(currentUserId);
      const normalizedCurrentUserIdStr = normalizedCurrentUserId ? String(normalizedCurrentUserId).trim().toLowerCase() : '';
      if (normalizedCurrentUserId && normalizedCurrentUserIdStr === String(normalizedAgentId).trim().toLowerCase()) {
        // Check if current user is admin
        const userRole = (user as any)?.role || '';
        if (userRole === 'admin' || String(userRole).toLowerCase().includes('admin') || String(userRole).toLowerCase().includes('super')) {
          return 'Admin';
        }
        // Return user name if available
        if (user?.name) {
          return user.name;
        }
      }
    }
    
    // Last resort: return Unknown Agent (but log it for debugging)
    console.warn('[AgentChart] Could not resolve agent name:', {
      agentId: normalizedAgentId,
      bookingAgentName: bookingAgentName,
      availableAgentIds: agents?.map(a => normalizeId(a.id))
    });
    return 'Unknown Agent';
  };

  // Calculate agent performance data grouped by agent names
  const agentPerformanceByNames = React.useMemo(() => {
    const result: Array<{ name: string; value: number; color: string }> = [];
    
    if (filteredBookings.length === 0) {
      return result;
    }

    // Build agent metrics map
    const agentMetricsMap: Record<string, { bookings: number; profit: number; revenue: number }> = {};
    let unassignedMetrics = { bookings: 0, profit: 0, revenue: 0 };

    filteredBookings.forEach(booking => {
      const bookingAgentId = getAgentIdFromBooking(booking);
      const bookingAgentName = (booking as any)?.agentName || (booking as any)?.agent?.name || '';
      
      // Debug logging for problematic bookings
      if (!bookingAgentId && (booking as any)?.agent) {
        console.log('[AgentChart] Booking without matched agentId:', {
          bookingId: (booking as any)?.id || (booking as any)?._id,
          agent: (booking as any)?.agent,
          agentId: (booking as any)?.agentId,
          agentName: bookingAgentName,
          agentType: typeof (booking as any)?.agent,
          fullBooking: JSON.stringify(booking, null, 2).substring(0, 500)
        });
      }
      
      // Calculate profit and revenue
      const costingTotals = (booking as any)?.costing?.totals || (booking as any)?.pricing?.totals || {};
      const totalCost = costingTotals.totalCostPrice || costingTotals.totalCost || 0;
      const totalSale = costingTotals.totalSalePrice || costingTotals.totalSale || (booking as any)?.totalAmount || (booking as any)?.amount || 0;
      const profit = costingTotals.profit ?? (totalSale - totalCost);
      const revenue = totalSale;

      if (bookingAgentId) {
        // Get agent name for this booking
        const agentName = getAgentName(bookingAgentId, bookingAgentName);
        
        // Debug logging for agent name resolution
        if (agentName === 'Unknown Agent' || agentName === 'Unassigned') {
          console.log('[AgentChart] Agent name resolution issue:', {
            bookingId: (booking as any)?.id || (booking as any)?._id,
            agentId: bookingAgentId,
            resolvedName: agentName,
            bookingAgentName: bookingAgentName,
            availableAgents: agents?.map(a => ({ id: a.id, name: a.name }))
          });
        }
        
        if (!agentMetricsMap[agentName]) {
          agentMetricsMap[agentName] = { bookings: 0, profit: 0, revenue: 0 };
        }
        
        agentMetricsMap[agentName].bookings += 1;
        agentMetricsMap[agentName].profit += profit;
        agentMetricsMap[agentName].revenue += revenue;
      } else {
        // Unassigned bookings
        unassignedMetrics.bookings += 1;
        unassignedMetrics.profit += profit;
        unassignedMetrics.revenue += revenue;
      }
    });

    // Convert to chart data format
    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    let colorIndex = 0;

    Object.keys(agentMetricsMap).forEach(agentName => {
      const metrics = agentMetricsMap[agentName];
      
      let value = 0;
      if (agentChartType === 'bookings') {
        value = metrics.bookings;
      } else if (agentChartType === 'profit') {
        value = metrics.profit;
      } else if (agentChartType === 'revenue') {
        value = metrics.revenue;
      }

      if (value > 0) {
        result.push({
          name: agentName,
          value: value,
          color: colors[colorIndex % colors.length]
        });
        colorIndex++;
      }
    });

    // Add unassigned if any
    let unassignedValue = 0;
    if (agentChartType === 'bookings') {
      unassignedValue = unassignedMetrics.bookings;
    } else if (agentChartType === 'profit') {
      unassignedValue = unassignedMetrics.profit;
    } else if (agentChartType === 'revenue') {
      unassignedValue = unassignedMetrics.revenue;
    }

    if (unassignedValue > 0) {
      result.push({
        name: 'Unassigned',
        value: unassignedValue,
        color: '#9CA3AF'
      });
    }

    // Sort by value (descending)
    return result.sort((a, b) => b.value - a.value);
  }, [filteredBookings, agentChartType, agents, user]);

  // Helper function to format date labels based on period
  const formatDateLabel = (date: Date, period: 'week' | 'month' | 'year'): string => {
    if (period === 'week') {
      // Show day name and date (e.g., "Mon, Jan 1")
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else if (period === 'month') {
      // Show day number (e.g., "1", "2", "31")
      return date.getDate().toString();
    } else {
      // Show month name (e.g., "Jan", "Feb", "Mar")
      return date.toLocaleDateString('en-US', { month: 'short' });
    }
  };

  // Calculate performance data grouped by dates based on selected period
  const agentPerformanceData = React.useMemo(() => {
    const result: Array<{ name: string; value: number; color: string }> = [];
    
    if (filteredBookings.length === 0) {
      return result;
    }

    // Create date buckets based on period
    const now = new Date();
    let dateBuckets: Date[] = [];
    let startDate: Date;

    if (dashboardPeriod === 'week') {
      // 7 days: today and 6 days before
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        date.setHours(0, 0, 0, 0);
        dateBuckets.push(date);
      }
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === 'month') {
      // Days of current month
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        dateBuckets.push(date);
      }
      startDate = new Date(currentYear, currentMonth, 1);
    } else {
      // 12 months of the year
      for (let month = 0; month < 12; month++) {
        const date = new Date(now.getFullYear(), month, 1);
        dateBuckets.push(date);
      }
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    // Group bookings by date buckets
    const dateMetricsMap: Record<string, { bookings: number; profit: number; revenue: number }> = {};
    
    // Initialize all date buckets with zeros
    dateBuckets.forEach(date => {
      const key = dashboardPeriod === 'week' 
        ? date.toISOString().split('T')[0] // Full date for weekly
        : dashboardPeriod === 'month'
        ? date.getDate().toString() // Day number for monthly
        : date.getMonth().toString(); // Month index for yearly
      
      dateMetricsMap[key] = { bookings: 0, profit: 0, revenue: 0 };
    });

    // Aggregate bookings into date buckets
    filteredBookings.forEach(booking => {
      const bookingDate = new Date(booking.createdAt || (booking as any).date || 0);
      
      // Calculate profit and revenue
      const costingTotals = (booking as any)?.costing?.totals || (booking as any)?.pricing?.totals || {};
      const totalCost = costingTotals.totalCostPrice || costingTotals.totalCost || 0;
      const totalSale = costingTotals.totalSalePrice || costingTotals.totalSale || (booking as any)?.totalAmount || (booking as any)?.amount || 0;
      const profit = costingTotals.profit ?? (totalSale - totalCost);
      const revenue = totalSale;

      let bucketKey: string;
      
      if (dashboardPeriod === 'week') {
        // Match to specific day
        const dayStart = new Date(bookingDate);
        dayStart.setHours(0, 0, 0, 0);
        bucketKey = dayStart.toISOString().split('T')[0];
      } else if (dashboardPeriod === 'month') {
        // Match to day of month (only if in current month)
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        if (bookingDate.getMonth() === currentMonth && bookingDate.getFullYear() === currentYear) {
          bucketKey = bookingDate.getDate().toString();
        } else {
          return; // Skip bookings not in current month
        }
      } else {
        // Match to month (only if in current year)
        const currentYear = now.getFullYear();
        if (bookingDate.getFullYear() === currentYear) {
          bucketKey = bookingDate.getMonth().toString();
        } else {
          return; // Skip bookings not in current year
        }
      }

      if (dateMetricsMap[bucketKey]) {
        dateMetricsMap[bucketKey].bookings += 1;
        dateMetricsMap[bucketKey].profit += profit;
        dateMetricsMap[bucketKey].revenue += revenue;
      }
    });

    // Convert to chart data format
    const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    
    dateBuckets.forEach((date, index) => {
      const key = dashboardPeriod === 'week' 
        ? date.toISOString().split('T')[0]
        : dashboardPeriod === 'month'
        ? date.getDate().toString()
        : date.getMonth().toString();
      
      const metrics = dateMetricsMap[key] || { bookings: 0, profit: 0, revenue: 0 };
      
      let value = 0;
      if (chartType === 'bookings') {
        value = metrics.bookings;
      } else if (chartType === 'profit') {
        value = metrics.profit;
      } else if (chartType === 'revenue') {
        value = metrics.revenue;
      }

      const label = formatDateLabel(date, dashboardPeriod);
      
      result.push({
        name: label,
        value: value,
        color: colors[index % colors.length]
      });
    });

    return result;
  }, [filteredBookings, dashboardPeriod, chartType]);


  const handleApproveBooking = async (bookingId: string) => {
    await approveChange('booking', bookingId);
  };

  const handleRejectBooking = async (bookingId: string) => {
    await rejectChange('booking', bookingId);
  };

  const handleApproveInquiry = async (inquiryId: string) => {
    await approveChange('inquiry', inquiryId);
  };

  const handleRejectInquiry = async (inquiryId: string) => {
    await rejectChange('inquiry', inquiryId);
  };

  // Helper functions for PDF generation (same as Bookings.tsx)
  const cleanDate = (d?: string) => {
    if (!d) return '';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = new Date(d);
    if (Number.isNaN(t.valueOf())) return s.slice(0, 10) || '';
    return t.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const ensureArray = <T,>(v: T[] | T | undefined | null): T[] => {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  };

  const normalizeForPdf = (b: any) => {
    const hotels = Array.isArray(b?.hotels) && b.hotels.length > 0 ? ensureArray(b.hotels) : 
                  b?.hotel ? [b.hotel] : [];
    const visas = Array.isArray(b?.visas) ? ensureArray(b.visas) : 
                  b?.visas?.passengers && b.visas.passengers.length > 0 ? ensureArray(b.visas.passengers) : 
                  b?.visa && Object.keys(b.visa).length > 0 ? [{
                    name: b?.customerName || '',
                    nationality: b.visa.nationality || '',
                    visaType: b.visa.visaType || '',
                  }] : [];
    const legs = b?.transport?.legs ? ensureArray(b.transport.legs) : 
                 b?.transportation?.legs ? ensureArray(b.transportation.legs) : [];
    const costingRows = b?.pricing?.table ? ensureArray(b.pricing.table) : 
                        b?.costing?.rows ? ensureArray(b.costing.rows) : 
                        (b?.costingRows ? ensureArray(b.costingRows) : []);

    return {
      id: b?._id || b?.id || '',
      customerName: b?.customerName || b?.customer || '',
      email: b?.customerEmail || b?.email || '',
      phone: b?.contactNumber || b?.phone || '',
      agentName: b?.agent?.name || b?.agentName || '',
      pkg: b?.package || b?.pricing?.packageName || '',
      status: b?.status || 'pending',
      approvalStatus: b?.approvalStatus || 'pending',
      dates: {
        bookingDate: cleanDate(b?.date),
        departureDate: cleanDate(b?.departureDate),
        returnDate: cleanDate(b?.returnDate),
      },
      flight: {
        itinerary: b?.flights?.raw || b?.flight?.itinerary || '',
        route: [b?.flight?.departureCity || b?.departureCity, b?.flight?.arrivalCity || b?.arrivalCity].filter(Boolean).join(' → '),
        class: b?.flight?.flightClass || b?.flightClass || '',
        pnr: (b?.flight?.pnr || b?.pnr || '').toUpperCase(),
        payment: b?.flightPayments?.mode || b?.flight?.paymentMethod || '',
      },
      hotels: hotels.map((h: any) => ({
        hotelName: h?.name || h?.hotelName || '',
        roomType: h?.roomType || '',
        checkIn: cleanDate(h?.checkIn),
        checkOut: cleanDate(h?.checkOut),
      })),
      visas: visas.map((v: any) => ({
        name: v?.name || v?.fullName || v?.passengerName || '',
        nationality: v?.nationality || '',
        visaType: v?.visaType || b?.visaType || '',
      })),
      transport: {
        pickupLocation: b?.transport?.pickupLocation || b?.pickupLocation || '',
        transportType: b?.transport?.transportType || b?.transportType || '',
        legs: legs.map((l: any) => ({
          from: l?.from || '',
          to: l?.to || '',
          vehicleType: l?.vehicleType || '',
          date: cleanDate(l?.date),
          time: l?.time || '',
        })),
      },
      pricing: {
        totals: {
          totalCostPrice: b?.pricing?.totals?.totalCostPrice ?? b?.costing?.totals?.totalCost ?? 0,
          totalSalePrice: b?.amount ?? b?.totalAmount ?? b?.pricing?.totals?.totalSalePrice ?? b?.costing?.totals?.totalSale ?? 0,
          profit: b?.pricing?.totals?.profit ?? b?.costing?.totals?.profit ?? 0,
        },
        table: costingRows.map((r: any) => ({
          label: r?.label ?? r?.item ?? '',
          quantity: Number(r?.quantity ?? 0),
          costPerQty: Number(r?.costPerQty ?? 0),
          salePerQty: Number(r?.salePerQty ?? 0),
          totalCost: r?.totalCost ?? Number(r?.quantity ?? 0) * Number(r?.costPerQty ?? 0),
          totalSale: r?.totalSale ?? Number(r?.quantity ?? 0) * Number(r?.salePerQty ?? 0),
          profit: r?.profit ?? (Number(r?.quantity ?? 0) * Number(r?.salePerQty ?? 0)) - (Number(r?.quantity ?? 0) * Number(r?.costPerQty ?? 0)),
        })),
        packagePrice: Number(b?.packagePrice ?? b?.pricing?.packagePrice ?? 0),
        additionalServices: b?.additionalServices ?? b?.pricing?.additionalServices ?? '',
        paymentMethod: b?.paymentMethod ?? b?.pricing?.paymentMethod ?? '',
      },
      payment: {
        method: b?.flightPayments?.mode || b?.payment?.method || b?.paymentMethod || '',
        cardNumber: b?.cardNumber || b?.payment?.cardNumber || '',
        cardLast4: b?.payment?.cardLast4 || b?.cardLast4 || '',
        cardholderName: b?.payment?.cardholderName || b?.cardholderName || '',
        expiryDate: b?.payment?.expiryDate || b?.expiryDate || '',
      },
      pax: {
        passengers: b?.passengers ?? '',
        adults: b?.adults ?? '',
        children: b?.children ?? '',
      },
    };
  };

  // Download PDF - uses same format as FULL PDF from Bookings.tsx
  const handleDownloadPDF = async (bookingId: string) => {
    try {
      const { data } = await http.get(`/api/bookings/${bookingId}`);
      if (!data) {
        throw new Error('No booking data received');
      }
      const full = normalizeForPdf(data);

      const jsPDFMod = await import('jspdf');
      const autoTableMod = await import('jspdf-autotable');
      const jsPDF = (jsPDFMod as any).default || jsPDFMod;
      const autoTable = (autoTableMod as any).default || autoTableMod;

      const doc = new jsPDF({ 
        unit: 'pt', 
        format: 'a4',
        compress: true 
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 50;
      const contentWidth = pageWidth - (2 * margin);
      let y = 0;

      const primaryColor = [30, 58, 138];
      const accentColor = [220, 38, 38];
      const lightGray = [248, 249, 250];
      const darkGray = [75, 85, 99];

      const formatDatePdf = (d: string) => {
        if (!d) return '—';
        try {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d).trim())
            ? new Date(d + 'T12:00:00.000Z')
            : new Date(d);
          return date.toLocaleDateString('en-US', {
            timeZone: 'Asia/Karachi',
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } catch {
          return d;
        }
      };

      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(amount);
      };

      const addHeader = (pageNumber: number) => {
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(0, 0, pageWidth, 8, 'F');
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 8, pageWidth, 85, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('MUSTAFA TRAVEL', margin, 50);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Your Journey, Our Commitment', margin, 68);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('BOOKING CONFIRMATION', pageWidth - margin, 50, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${pageNumber}`, pageWidth - margin, 68, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        return 110;
      };

      const addFooter = () => {
        const footerY = pageHeight - 60;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY, pageWidth - margin, footerY);
        doc.setFontSize(9);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('MUSTAFA TRAVEL', margin, footerY + 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('info@mustafatravel.com', margin, footerY + 28);
        doc.text('+92 (316) 503-2128', margin, footerY + 40);
        doc.text('www.mustafatravel.com', pageWidth / 2, footerY + 28, { align: 'center' });
        doc.text('24/7 Customer Support', pageWidth / 2, footerY + 40, { align: 'center' });
        doc.text('Licensed Travel Agency', pageWidth - margin, footerY + 28, { align: 'right' });
        doc.text('IATA Certified', pageWidth - margin, footerY + 40, { align: 'right' });
        doc.setTextColor(0, 0, 0);
      };

      const drawSectionHeader = (title: string, yPos: number) => {
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.roundedRect(margin, yPos, contentWidth, 28, 3, 3, 'F');
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(margin, yPos, 4, 28, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(title, margin + 12, yPos + 18);
        doc.setTextColor(0, 0, 0);
        return yPos + 40;
      };

      const checkPageBreak = (requiredSpace: number) => {
        if (y + requiredSpace > pageHeight - 80) {
          addFooter();
          doc.addPage();
          currentPage++;
          y = addHeader(currentPage);
          return true;
        }
        return false;
      };

      let currentPage = 1;
      y = addHeader(currentPage);

      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.roundedRect(margin, y, contentWidth, 60, 5, 5, 'FD');
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(2);
      doc.roundedRect(margin, y, contentWidth, 60, 5, 5, 'S');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('Booking Reference', margin + 15, y + 20);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(full.id, margin + 15, y + 42);
      
      const statusX = pageWidth - margin - 100;
      const statusColor = full.status === 'confirmed' ? [34, 197, 94] : 
                         full.status === 'pending' ? [234, 179, 8] : [239, 68, 68];
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(statusX, y + 15, 85, 30, 4, 4, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(full.status.toUpperCase(), statusX + 42.5, y + 35, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      y += 75;

      const costingTotals = data?.costing?.totals || data?.pricing?.totals || {};
      const totalCost = costingTotals.totalCostPrice || costingTotals.totalCost || 0;
      const totalSale = costingTotals.totalSalePrice || costingTotals.totalSale || 0;
      const profit = costingTotals.profit || (totalSale - totalCost) || 0;
      
      if (totalCost || totalSale || profit) {
        checkPageBreak(80);
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(margin, y, contentWidth, 70, 5, 5, 'F');
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(1.5);
        doc.roundedRect(margin, y, contentWidth, 70, 5, 5, 'S');
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text('PROFIT SUMMARY', margin + 15, y + 18);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        const profitLabelX = margin + 15;
        const profitValueX = margin + 120;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Total Cost:', profitLabelX, y + 38);
        doc.setFont('helvetica', 'normal');
        doc.text(formatCurrency(totalCost), profitValueX, y + 38);
        
        doc.setFont('helvetica', 'bold');
        doc.text('Total Sale:', profitLabelX + 200, y + 38);
        doc.setFont('helvetica', 'normal');
        doc.text(formatCurrency(totalSale), profitValueX + 200, y + 38);
        
        doc.setFont('helvetica', 'bold');
        doc.text('Profit:', profitLabelX, y + 55);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text(formatCurrency(profit), profitValueX, y + 55);
        
        doc.setTextColor(0, 0, 0);
        y += 85;
      }

      y = drawSectionHeader('TRAVELER INFORMATION', y);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const labelX = margin + 15;
      const valueX = margin + 150;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Full Name:', labelX, y); 
      doc.setFont('helvetica', 'normal');
      doc.text(full.customerName, valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Email Address:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(full.email, valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Contact Number:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(full.phone || '—', valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Assigned Agent:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(full.agentName || 'Not Assigned', valueX, y); y += 25;

      checkPageBreak(150);
      y = drawSectionHeader('TRAVEL DATES & PACKAGE', y);
      doc.setFontSize(10);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Booking Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDatePdf(full.dates.bookingDate), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Departure Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDatePdf(full.dates.departureDate), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Return Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDatePdf(full.dates.returnDate), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Package:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(full.pkg, valueX, y); y += 25;

      checkPageBreak(200);
      y = drawSectionHeader('FLIGHT DETAILS', y);
      doc.setFontSize(10);
      
      if (full.flight.route) {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(margin + 15, y, contentWidth - 30, 35, 3, 3, 'S');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(full.flight.route.replace('✈', 'to').replace('→', 'to'), margin + 25, y + 23);
        doc.setTextColor(0, 0, 0);
        y += 45;
      }
      
      doc.setFontSize(10);
      if (full.flight.class) {
        doc.setFont('helvetica', 'bold');
        doc.text('Travel Class:', labelX, y);
        doc.setFont('helvetica', 'normal');
        doc.text(full.flight.class.toUpperCase(), valueX, y); y += 16;
      }
      if (full.flight.pnr) {
        doc.setFont('helvetica', 'bold');
        doc.text('PNR Code:', labelX, y);
        doc.setFont('helvetica', 'normal');
        doc.text(full.flight.pnr, valueX, y); y += 16;
      }
      
      if (full.flight.itinerary) {
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Flight Itinerary:', labelX, y); y += 16;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = String(full.flight.itinerary).split('\n').filter((l: string) => l.trim());
        lines.forEach((line: string) => {
          checkPageBreak(15);
          doc.text(line.trim(), labelX + 10, y);
          y += 13;
        });
        y += 5;
      }
      y += 10;

      if (full.hotels.length) {
        checkPageBreak(100);
        y = drawSectionHeader('ACCOMMODATION DETAILS', y);
        
        autoTable(doc, {
          startY: y,
          head: [['Hotel Name', 'Room Type', 'Check-In Date', 'Check-Out Date']],
          body: full.hotels.map((h: any) => [
            h.hotelName || 'Not specified', 
            h.roomType || 'Standard', 
            formatDatePdf(h.checkIn), 
            formatDatePdf(h.checkOut)
          ]),
          styles: { 
            fontSize: 9,
            cellPadding: 8,
            lineColor: [220, 220, 220],
            lineWidth: 0.5
          },
          headStyles: { 
            fillColor: primaryColor,
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            fontSize: 10 
          },
          alternateRowStyles: { fillColor: lightGray },
          margin: { left: margin, right: margin },
          theme: 'grid'
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      if (full.visas.length) {
        checkPageBreak(100);
        y = drawSectionHeader('VISA INFORMATION', y);
        
        autoTable(doc, {
          startY: y,
          head: [['Passenger Name', 'Nationality', 'Visa Type']],
          body: full.visas.map((v: any) => [
            v.name || '—', 
            v.nationality || '—', 
            v.visaType || '—'
          ]),
          styles: { 
            fontSize: 9,
            cellPadding: 8,
            lineColor: [220, 220, 220],
            lineWidth: 0.5
          },
          headStyles: { 
            fillColor: primaryColor,
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            fontSize: 10 
          },
          alternateRowStyles: { fillColor: lightGray },
          margin: { left: margin, right: margin },
          theme: 'grid'
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      if (full.transport.legs.length) {
        checkPageBreak(100);
        y = drawSectionHeader('TRANSPORTATION DETAILS', y);
        
        autoTable(doc, {
          startY: y,
          head: [['From', 'To', 'Vehicle', 'Date', 'Time']],
          body: full.transport.legs.map((l: any) => [
            l.from || '—', 
            l.to || '—', 
            l.vehicleType || '—', 
            formatDatePdf(l.date), 
            l.time || '—'
          ]),
          styles: { 
            fontSize: 9,
            cellPadding: 8,
            lineColor: [220, 220, 220],
            lineWidth: 0.5
          },
          headStyles: { 
            fillColor: primaryColor,
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            fontSize: 10 
          },
          alternateRowStyles: { fillColor: lightGray },
          margin: { left: margin, right: margin },
          theme: 'grid'
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      if (full.pricing.table?.length) {
        checkPageBreak(150);
        y = drawSectionHeader(' PRICING BREAKDOWN', y);
        
        const totalAmount = full.pricing.table.reduce((sum: number, r: any) => sum + (r.totalSale || 0), 0);
        
        autoTable(doc, {
          startY: y,
          head: [['Service/Item', 'Qty', 'Unit Price', 'Total']],
          body: [
            ...full.pricing.table.map((r: any) => [
              r.label || '—',
              String(r.quantity ?? 0),
              formatCurrency(r.salePerQty || 0),
              formatCurrency(r.totalSale || 0)
            ]),
            ['', '', { content: 'TOTAL:', styles: { fontStyle: 'bold', halign: 'right' } }, 
             { content: formatCurrency(totalAmount), styles: { fontStyle: 'bold', fillColor: lightGray } }]
          ],
          styles: { 
            fontSize: 9,
            cellPadding: 8,
            lineColor: [220, 220, 220],
            lineWidth: 0.5
          },
          headStyles: { 
            fillColor: primaryColor,
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            fontSize: 10 
          },
          alternateRowStyles: { fillColor: [255, 255, 255] },
          margin: { left: margin, right: margin },
          theme: 'grid',
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40, halign: 'center' },
            2: { cellWidth: 70, halign: 'right' },
            3: { cellWidth: 70, halign: 'right' }
          }
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      if (data?.paymentReceived || data?.paymentDue) {
        checkPageBreak(150);
        y = drawSectionHeader('PAYMENT INFORMATION', y);
        
        if (data?.paymentReceived) {
          doc.setFillColor(220, 252, 231);
          doc.roundedRect(margin + 15, y, (contentWidth / 2) - 25, 90, 3, 3, 'F');
          doc.setDrawColor(34, 197, 94);
          doc.setLineWidth(1);
          doc.roundedRect(margin + 15, y, (contentWidth / 2) - 25, 90, 3, 3, 'S');
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(34, 197, 94);
          doc.text('PAYMENT RECEIVED', margin + 25, y + 20);
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(`Amount: ${formatCurrency(data.paymentReceived.amount || 0)}`, margin + 25, y + 38);
          doc.text(`Method: ${(data.paymentReceived.method || '—').replace('_', ' ').toUpperCase()}`, margin + 25, y + 52);
          if (data.paymentReceived.date) {
            doc.text(`Date: ${formatDatePdf(data.paymentReceived.date)}`, margin + 25, y + 66);
          }
          if (data.paymentReceived.reference) {
            doc.text(`Ref: ${data.paymentReceived.reference}`, margin + 25, y + 80);
          }
        }
        
        if (data?.paymentDue) {
          const xPos = pageWidth - margin - (contentWidth / 2) + 10;
          doc.setFillColor(254, 226, 226);
          doc.roundedRect(xPos, y, (contentWidth / 2) - 25, 90, 3, 3, 'F');
          doc.setDrawColor(239, 68, 68);
          doc.setLineWidth(1);
          doc.roundedRect(xPos, y, (contentWidth / 2) - 25, 90, 3, 3, 'S');
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(239, 68, 68);
          doc.text('PAYMENT DUE', xPos + 10, y + 20);
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(`Amount: ${formatCurrency(data.paymentDue.amount || 0)}`, xPos + 10, y + 38);
          doc.text(`Method: ${(data.paymentDue.method || '—').replace('_', ' ').toUpperCase()}`, xPos + 10, y + 52);
          if (data.paymentDue.dueDate) {
            doc.text(`Due: ${formatDatePdf(data.paymentDue.dueDate)}`, xPos + 10, y + 66);
          }
          if (data.paymentDue.notes) {
            doc.text(`Notes: ${data.paymentDue.notes}`, xPos + 10, y + 80);
          }
        }
        
        y += 110;
      }

      checkPageBreak(100);
      y = drawSectionHeader('CREDIT CARD INFORMATION', y);
      
      const hasCardInfo = full.payment?.cardNumber || data.cardNumber || full.payment?.cardholderName || full.payment?.cardLast4 || full.payment?.expiryDate || full.payment?.method;
      
      if (hasCardInfo) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        if (full.payment?.cardholderName) {
          doc.text(`Cardholder Name: ${full.payment.cardholderName}`, margin + 20, y);
          y += 18;
        }
        
        if (full.payment?.cardNumber) {
          doc.text(`Card Number: ${full.payment.cardNumber}`, margin + 20, y);
          y += 18;
        } else if (data.cardNumber) {
          doc.text(`Card Number: ${data.cardNumber}`, margin + 20, y);
          y += 18;
        } else if (full.payment?.cardLast4) {
          doc.text(`Card Number: **** **** **** ${full.payment.cardLast4}`, margin + 20, y);
          y += 18;
        }
        
        if (full.payment?.expiryDate) {
          doc.text(`Expiry Date: ${full.payment.expiryDate}`, margin + 20, y);
          y += 18;
        }
        
        if (full.payment?.method) {
          const methodNames: Record<string, string> = {
            'credit_card': 'Credit Card',
            'bank_transfer': 'Bank Transfer',
            'cash': 'Cash',
            'installments': 'Installments'
          };
          doc.text(`Payment Method: ${methodNames[full.payment.method] || full.payment.method}`, margin + 20, y);
          y += 18;
        }
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(128, 128, 128);
        doc.text('No credit card information provided', margin + 20, y);
      }
      
      y += 25;

      checkPageBreak(80);
      doc.setFillColor(255, 243, 205);
      doc.roundedRect(margin, y, contentWidth, 60, 3, 3, 'F');
      doc.setDrawColor(234, 179, 8);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, contentWidth, 60, 3, 3, 'S');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('IMPORTANT NOTICE:', margin + 15, y + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const noticeText = 'Please ensure all travel documents are valid for at least 6 months. Arrive at the airport 3 hours before departure. Contact your agent for any changes or cancellations.';
      const splitNotice = doc.splitTextToSize(noticeText, contentWidth - 30);
      doc.text(splitNotice, margin + 15, y + 30);
      y += 70;

      // ============= TERMS AND CONDITIONS SECTION =============
      checkPageBreak(100);
      y = drawSectionHeader('TERMS AND CONDITIONS', y);
      
      // Helper function to add terms text
      const addTermsText = (text: string, isBold: boolean = false, isSubHeader: boolean = false) => {
        checkPageBreak(30);
        
        if (isSubHeader) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.text(text, margin + 15, y);
          y += 20;
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          return;
        }
        
        if (isBold) {
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFont('helvetica', 'normal');
        }
        
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(text, contentWidth - 30);
        doc.text(lines, margin + 15, y);
        y += (lines.length * 14) + 6;
      };

      // Flight Policies
      addTermsText('FLIGHT POLICIES', false, true);
      addTermsText('• Cancellation / Refund / Date Change: An estimated penalty of $250 or more from the airline as per their policy + $100 service fee per person from the company.');
      addTermsText('• Flights can be Cancelled / Changed without any fee within 24 hours time span.');
      addTermsText('• Change of flight can only be done with same airline.');
      addTermsText('• Airline is responsible for the schedule change or layover time change.');
      addTermsText('• In case of a no show all the round trip will be cancelled by the airline and there will be no refund.');
      
      // Land Package Policies
      addTermsText('LAND PACKAGE POLICIES', false, true);
      addTermsText('• Land package cancellations must be informed at least one week before travel; otherwise, a 50% charge applies (except for December and Ramadan bookings).');
      addTermsText('• If an HCN is issued at the time of booking, no refund will be provided for that particular hotel, including hotels outside of Makkah and Madinah.');
      addTermsText('• Full amount will be refunded in case of any emergency.');
      
      // Visa Policies
      addTermsText('VISA POLICIES', false, true);
      addTermsText('• No Visa amount will be refunded if the visa is issued.');
      
      // Transportation Policies
      addTermsText('TRANSPORTATION POLICIES', false, true);
      addTermsText('• Transportation is fully refundable before traveling.');
      addTermsText('• Only the transportation included in the package will be provided; any additional services will incur extra charges.');
      
      // Payment Options
      addTermsText('PAYMENT OPTIONS', false, true);
      addTermsText('Payment Options for the tickets:', true);
      addTermsText('1. Credit Card');
      addTermsText('2. Zelle');
      addTermsText('3. Wire Transfer / Bank Deposit');
      addTermsText('Payment Options for the Land Package:', true);
      addTermsText('1. Zelle');
      addTermsText('2. Bank Deposit');
      addTermsText('3. Wire Transfer');
      addTermsText('Note: In case of payment of land package through credit card there will be a Merchant charge.');

      addFooter();

      doc.save(`MUSTAFA-Booking-${full.id}.pdf`);
    } catch (e: any) {
      console.error('Full PDF failed', e);
      const errorMessage = e?.response?.data?.message || e?.message || 'Failed to generate full PDF';
      if (e?.response?.status === 403) {
        alert('You do not have permission to generate this PDF. Only the booking owner or admin can generate PDFs.');
      } else {
        alert(`Failed to generate full PDF: ${errorMessage}`);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.name}</p>
        </div>
        {/* Dashboard Period Filter Buttons */}
        <div className="mt-4 sm:mt-0 flex items-center space-x-2">
          <button
            onClick={() => setDashboardPeriod('week')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              dashboardPeriod === 'week'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setDashboardPeriod('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              dashboardPeriod === 'month'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setDashboardPeriod('year')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              dashboardPeriod === 'year'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Agent Performance Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {chartType === 'bookings' && 'Bookings Over Time'}
            {chartType === 'profit' && 'Profit Over Time'}
            {chartType === 'revenue' && 'Revenue Over Time'}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {/* Chart Type selector */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setChartType('bookings')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  chartType === 'bookings'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Bookings
              </button>
              <button
                onClick={() => setChartType('profit')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                  chartType === 'profit'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Profit
              </button>
              <button
                onClick={() => setChartType('revenue')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                  chartType === 'revenue'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Revenue
              </button>
            </div>
          <button
            onClick={() => {
              console.log('🔄 Manual refresh triggered');
              fetchAgents();
                loadDashboardBookings();
            }}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>
        </div>
        <div className="text-sm text-gray-500 mb-6">
          {dashboardPeriod === 'week' && 'Current Week'}
          {dashboardPeriod === 'month' && 'Current Month'}
          {dashboardPeriod === 'year' && 'Current Year'}
          {' - '}
          {chartType === 'bookings' && `${filteredBookings.length} booking${filteredBookings.length !== 1 ? 's' : ''}`}
          {chartType === 'profit' && `Total profit: $${agentPerformanceData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}`}
          {chartType === 'revenue' && `Total revenue: $${agentPerformanceData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}`}
        </div>
        {agentPerformanceData.length > 0 ? (
          <BarChart 
            data={agentPerformanceData} 
            isCurrency={chartType === 'profit' || chartType === 'revenue'}
            metricLabel={chartType === 'bookings' ? 'Bookings' : chartType === 'profit' ? 'Profit' : 'Revenue'}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            {agents.length === 0 ? (
              <div>
                <p>No agents available</p>
                <p className="text-sm mt-2">
                  {!localStorage.getItem('token') ? 'Please log in to view agents' : 'Loading agents...'}
                </p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div>
                <p>No booking data available for {dashboardPeriod === 'week' ? 'current week' : dashboardPeriod === 'month' ? 'current month' : 'current year'}</p>
                <p className="text-sm mt-2">Try selecting a different time period</p>
              </div>
            ) : (
              <div>
                <p>No agents have bookings in this period</p>
                <p className="text-sm mt-2">Try selecting a different time period</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent Performance Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {agentChartType === 'bookings' && 'Bookings by Agents'}
            {agentChartType === 'profit' && 'Profit by Agents'}
            {agentChartType === 'revenue' && 'Revenue by Agents'}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {/* Agent Chart Type selector */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setAgentChartType('bookings')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  agentChartType === 'bookings'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Bookings
              </button>
              <button
                onClick={() => setAgentChartType('profit')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                  agentChartType === 'profit'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Profit
              </button>
              <button
                onClick={() => setAgentChartType('revenue')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                  agentChartType === 'revenue'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Revenue
              </button>
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-500 mb-6">
          {dashboardPeriod === 'week' && 'Current Week'}
          {dashboardPeriod === 'month' && 'Current Month'}
          {dashboardPeriod === 'year' && 'Current Year'}
          {' - '}
          {agentChartType === 'bookings' && `${filteredBookings.length} booking${filteredBookings.length !== 1 ? 's' : ''}`}
          {agentChartType === 'profit' && `Total profit: $${agentPerformanceByNames.reduce((sum, item) => sum + item.value, 0).toLocaleString()}`}
          {agentChartType === 'revenue' && `Total revenue: $${agentPerformanceByNames.reduce((sum, item) => sum + item.value, 0).toLocaleString()}`}
        </div>
        {agentPerformanceByNames.length > 0 ? (
          <BarChart 
            data={agentPerformanceByNames} 
            isCurrency={agentChartType === 'profit' || agentChartType === 'revenue'}
            metricLabel={agentChartType === 'bookings' ? 'Bookings' : agentChartType === 'profit' ? 'Profit' : 'Revenue'}
            xAxisLabel="Agents"
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            {filteredBookings.length === 0 ? (
              <div>
                <p>No booking data available for {dashboardPeriod === 'week' ? 'current week' : dashboardPeriod === 'month' ? 'current month' : 'current year'}</p>
                <p className="text-sm mt-2">Try selecting a different time period</p>
              </div>
            ) : (
              <div>
                <p>No agent bookings found in this period</p>
                <p className="text-sm mt-2">All bookings may be unassigned</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending Approvals */}
      {totalPendingApprovals > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
            Pending Approvals ({totalPendingApprovals})
          </h3>
          <div className="space-y-4">
            {/* Pending Bookings */}
            {pendingBookings.map((booking) => (
              <div key={`booking-${booking.id}`} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <h4 className="font-medium text-gray-900">Booking Update - {booking.customer}</h4>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Pending
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Agent: {booking.agentName}</p>
                    <p className="text-sm text-gray-600">Package: {booking.package}</p>
                    <p className="text-sm text-gray-600">Amount: {booking.amount}</p>
                    <p className="text-sm text-gray-600">Customer: {booking.customer}</p>
                    <p className="text-sm text-gray-600">Email: {booking.email}</p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleDownloadPDF(booking.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Download className="h-4 w-4" />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => handleApproveBooking(booking.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleRejectBooking(booking.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Pending Inquiries */}
            {pendingInquiries.map((inquiry) => (
              <div key={`inquiry-${inquiry.id}`} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-green-500" />
                      <h4 className="font-medium text-gray-900">Inquiry Update - {inquiry.subject}</h4>
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Pending
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Agent: {inquiry.agentName || 'Unassigned'}</p>
                    <p className="text-sm text-gray-600">Customer: {inquiry.name}</p>
                    <p className="text-sm text-gray-600">Email: {inquiry.email}</p>
                    <p className="text-sm text-gray-600">Priority: {inquiry.priority}</p>
                    <p className="text-sm text-gray-600">Message: {inquiry.message?.substring(0, 100)}...</p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleApproveInquiry(inquiry.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleRejectInquiry(inquiry.id)}
                      className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import BookingModal from './BookingModal';
import { http } from '../lib/http';
import {
  Search,
  Plus,
  Calendar,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Download,
  Ticket,
  Settings, // for Status button icon
  FileText, // for Invoice button icon
} from 'lucide-react';

/* =========================
   Helpers / Types
   ========================= */

type UiBooking = {
  id: string;
  customer: string;
  email: string;
  phone: string;
  package: string;
  departureDate: string; // YYYY-MM-DD or ''
  returnDate: string; // YYYY-MM-DD or ''
  status: 'pending' | 'confirmed' | 'cancelled' | string;
  amount: number;
  agentId?: string;
  agentName?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | string;

  // NEW (optional display fields)
  pnr?: string;
  flightPaymentMethod?: 'credit_card' | 'installments' | string;

  // enrichment used in card details (kept as any to be tolerant)
  flight?: any;
  hotel?: any;
  visa?: any;
  transport?: any;
  payment?: any;
  passengers?: any;
  adults?: any;
  children?: any;
  paymentMethod?: any;
  packagePrice?: any;
  additionalServices?: any;

  // Optionally present on some APIs:
  pricing?: any;
  hotels?: any[];
  visas?: any[];
};

function formatDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.valueOf())) return '';
  return dt.toISOString().slice(0, 10);
}

function toNumberMaybe(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number((v as string).replace?.(/[$,]/g, '') ?? v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function currency(n: number) {
  try {
    return n.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    });
  } catch {
    return `$${n.toLocaleString()}`;
  }
}

function cleanDate(d?: string) {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.valueOf()) ? d : t.toISOString().slice(0, 10);
}

function ensureArray<T>(v: T[] | T | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Build a normalized object for PDF so every section exists */
function normalizeForPdf(b: any) {
  // Handle the actual stored data structure from API response - mixed legacy and new
  const hotels = Array.isArray(b?.hotels) && b.hotels.length > 0 ? ensureArray(b.hotels) : 
                b?.hotel ? [b.hotel] : [];
  const visas = Array.isArray(b?.visas) ? ensureArray(b.visas) : 
                b?.visas?.passengers && b.visas.passengers.length > 0 ? ensureArray(b.visas.passengers) : 
                b?.visa && Object.keys(b.visa).length > 0 ? [{
                  name: b?.customerName || '', // Use customer name as passenger name
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
      transportType: (() => {
        // If we have legs, use the vehicle type from the first leg
        if (legs.length > 0 && legs[0]?.vehicleType) {
          return legs[0].vehicleType;
        }
        // Otherwise use the stored transportType
        return b?.transport?.transportType || b?.transportType || '';
      })(),
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
        // Prioritize 'amount' field (actual database value) over 'totalAmount'
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
}

/** Normalize API booking -> UI booking */
function mapBooking(b: any): UiBooking {
  const id =
    b?._id ||
    b?.id ||
    (globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const customer = b?.customerName ?? b?.customer ?? 'Unknown';
  const email = b?.customerEmail ?? b?.email ?? '';
  const phone = b?.contactNumber ?? b?.phone ?? '';
  const pkg = b?.package ?? b?.pricing?.packageName ?? '—';

  const amount =
    toNumberMaybe(b?.costing?.totals?.totalSale) ||
    toNumberMaybe(b?.pricing?.totals?.totalSalePrice) ||
    toNumberMaybe(b?.amount) || 
    toNumberMaybe(b?.pricing?.totalAmount) || 
    toNumberMaybe(b?.totalAmount) || 0;

  const dep = b?.flight?.departureDate ?? b?.departureDate ?? '';
  const ret = b?.flight?.returnDate ?? b?.returnDate ?? '';

  const status = (b?.status ?? 'pending') as UiBooking['status'];
  const approvalStatus = b?.approvalStatus ?? 'pending';

  const agentId = b?.agentId ?? b?.agent?._id ?? b?.agent?.id;
  const agentName = b?.agentName ?? b?.agent?.name ?? '';

  // NEW: pnr & flightPaymentMethod (accept flat or nested)
  const pnr = b?.pnr ?? b?.flight?.pnr ?? '';
  const flightPaymentMethod = b?.flightPaymentMethod ?? b?.flight?.paymentMethod ?? undefined;

  return {
    id,
    customer,
    email,
    phone,
    package: pkg,
    departureDate: formatDate(dep),
    returnDate: formatDate(ret),
    status,
    amount,
    agentId,
    agentName,
    approvalStatus,
    pnr,
    flightPaymentMethod,
    // Include detailed information for enhanced display
    flight: b?.flight,
    hotel: b?.hotel,
    visa: b?.visa,
    transport: b?.transport,
    payment: b?.payment,
    passengers: b?.passengers,
    adults: b?.adults,
    children: b?.children,
    paymentMethod: b?.paymentMethod,
    packagePrice: b?.packagePrice,
    additionalServices: b?.additionalServices,
    pricing: b?.pricing,
    hotels: b?.hotels,
    visas: b?.visas,
  };
}

/* =========================
   Component
   ========================= */

const Bookings: React.FC = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<UiBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  // Full Edit modal (BookingModal in edit mode)
  const [isFullEditOpen, setIsFullEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // Status-only modal (existing)
  const [editingBooking, setEditingBooking] = useState<UiBooking | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [groupByCustomer, setGroupByCustomer] = useState(false);

  const isAdmin = user?.role === 'admin';

  const fetchBookings = async () => {
    setLoading(true);
    setErr('');
    try {
      const url = isAdmin ? '/api/bookings' : '/api/bookings/my';
      const { data } = await http.get(url);
      const list = Array.isArray(data) ? data : data?.bookings ?? [];
      setBookings(list.map(mapBooking));
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.response?.data === 'string' ? e.response.data : '') ||
        e?.message ||
        'Failed to load bookings';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleCreateBooking = async (created: any) => {
    const ui = mapBooking(created);
    setBookings((prev) => [ui, ...prev]);
  };

  const handleDelete = async (id: string) => {
    const yes = window.confirm('Delete this booking?');
    if (!yes) return;
    const prev = bookings;
    setBookings((p) => p.filter((b) => b.id !== id));
    try {
      await http.delete(`/api/bookings/${id}`);
    } catch {
      setBookings(prev);
      alert('Delete failed');
    }
  };

  // Status-only edit (old behavior)
  const handleEditStatus = (booking: UiBooking) => {
    setEditingBooking(booking);
    setIsEditModalOpen(true);
  };

  // NEW: Full edit opens BookingModal with initialData + bookingId
  const handleOpenFullEdit = async (booking: UiBooking) => {
    try {
      // Fetch the latest booking data from API to get the actual stored structure
      const { data: apiBooking } = await http.get(`/api/bookings/${booking.id}`);
      
      console.log('API Booking Data:', apiBooking); // Debug log
      
      // Extract agent ID
      const agentId = apiBooking?.agent?._id || apiBooking?.agent || '';
      
      // Map costing rows - handle both 'item' and 'label' field names
      const costingRows = (apiBooking?.pricing?.table || apiBooking?.costing?.rows || []).map((row: any) => ({
        label: row.label || row.item || '',
        quantity: row.quantity || 0,
        costPerQty: row.costPerQty || 0,
        salePerQty: row.salePerQty || 0,
      }));
      
      // Map the API response to BookingFormData structure
      const initialData = {
        // contact
        name: apiBooking?.customerName || '',
        email: apiBooking?.customerEmail || '',
        contactNumber: apiBooking?.contactNumber || '',
        passengers: apiBooking?.passengers || '',
        adults: apiBooking?.adults || '',
        children: apiBooking?.children || '',
        agent: agentId,

        // credit card - map from payment object
        cardNumber: apiBooking?.cardNumber || '',
        expiryDate: apiBooking?.expiryDate || apiBooking?.payment?.expiryDate || '',
        cvv: apiBooking?.cvv || '',
        cardholderName: apiBooking?.cardholderName || apiBooking?.payment?.cardholderName || '',

        // flights
        departureCity: apiBooking?.flight?.departureCity || apiBooking?.departureCity || '',
        arrivalCity: apiBooking?.flight?.arrivalCity || apiBooking?.arrivalCity || '',
        departureDate: cleanDate(apiBooking?.departureDate || apiBooking?.flight?.departureDate),
        returnDate: cleanDate(apiBooking?.returnDate || apiBooking?.flight?.returnDate),
        flightClass: apiBooking?.flight?.flightClass || apiBooking?.flightClass || 'economy',
        pnr: apiBooking?.pnr || apiBooking?.flight?.pnr || '',
        flightsItinerary: apiBooking?.flights?.raw || apiBooking?.flight?.itinerary || '',

        // hotels - map both legacy single fields AND array
        hotelName: apiBooking?.hotel?.name || apiBooking?.hotel?.hotelName || '',
        roomType: apiBooking?.hotel?.roomType || '',
        checkIn: cleanDate(apiBooking?.hotel?.checkIn),
        checkOut: cleanDate(apiBooking?.hotel?.checkOut),
        hotels: (Array.isArray(apiBooking?.hotels) && apiBooking.hotels.length > 0) 
          ? apiBooking.hotels.map((h: any) => ({
              hotelName: h.name || h.hotelName || '',
              name: h.name || h.hotelName || '',
              roomType: h.roomType || '',
              checkIn: cleanDate(h.checkIn),
              checkOut: cleanDate(h.checkOut),
            }))
          : (apiBooking?.hotel ? [{
              hotelName: apiBooking.hotel.name || apiBooking.hotel.hotelName || '',
              name: apiBooking.hotel.name || apiBooking.hotel.hotelName || '',
              roomType: apiBooking.hotel.roomType || '',
              checkIn: cleanDate(apiBooking.hotel.checkIn),
              checkOut: cleanDate(apiBooking.hotel.checkOut),
            }] : []),

        // visas - map both legacy single fields AND array
        visaType: apiBooking?.visa?.visaType || apiBooking?.visaType || 'umrah',
        passportNumber: apiBooking?.visa?.passportNumber || apiBooking?.passportNumber || '',
        nationality: apiBooking?.visa?.nationality || apiBooking?.nationality || '',
        visas: (apiBooking?.visas?.passengers && apiBooking.visas.passengers.length > 0) 
          ? apiBooking.visas.passengers.map((v: any) => ({
              name: v.fullName || v.name || '',
              nationality: v.nationality || '',
              // Convert to lowercase for form (form uses lowercase, backend uses capitalized)
              visaType: (v.visaType || 'tourist').toLowerCase(),
            }))
          : (Array.isArray(apiBooking?.visas) && apiBooking.visas.length > 0)
            ? apiBooking.visas.map((v: any) => ({
                name: v.fullName || v.name || '',
                nationality: v.nationality || '',
                visaType: (v.visaType || 'tourist').toLowerCase(),
              }))
            : (apiBooking?.visa ? [{
                name: apiBooking.visa.fullName || apiBooking.visa.name || '',
                nationality: apiBooking.visa.nationality || '',
                visaType: (apiBooking.visa.visaType || 'umrah').toLowerCase(),
              }] : []),
        visasCount: (apiBooking?.visas?.passengers?.length) || 
                    (Array.isArray(apiBooking?.visas) ? apiBooking.visas.length : 0) ||
                    (apiBooking?.visa ? 1 : 0),

        // transport - map both legacy single fields AND array
        transportType: apiBooking?.transport?.transportType || 'bus',
        pickupLocation: apiBooking?.transport?.pickupLocation || '',
        legs: (apiBooking?.transport?.legs || apiBooking?.transportation?.legs || []).map((leg: any) => ({
          from: leg.from || '',
          to: leg.to || '',
          vehicleType: leg.vehicleType || 'Sedan',
          date: cleanDate(leg.date),
          time: leg.time || '',
        })),
        legsCount: (apiBooking?.transport?.legs?.length || apiBooking?.transportation?.legs?.length || 0),

        // costing / pricing - handle both structures
        package: apiBooking?.package || '',
        packagePrice: String(apiBooking?.packagePrice || apiBooking?.pricing?.packagePrice || ''),
        additionalServices: apiBooking?.additionalServices || apiBooking?.pricing?.additionalServices || '',
        paymentMethod: apiBooking?.paymentMethod || apiBooking?.pricing?.paymentMethod || 'credit_card',
        costingRows: costingRows,
        totalAmount: String(
          apiBooking?.costing?.totals?.totalSale || 
          apiBooking?.pricing?.totals?.totalSalePrice || 
          apiBooking?.totalAmount || 
          apiBooking?.amount || 
          apiBooking?.pricing?.totalAmount || 
          ''
        ),

        // payment tracking
        paymentReceivedAmount: apiBooking?.paymentReceived?.amount ? String(apiBooking.paymentReceived.amount) : '',
        paymentReceivedMethod: apiBooking?.paymentReceived?.method || 'credit_card',
        paymentReceivedDate: cleanDate(apiBooking?.paymentReceived?.date),
        paymentReceivedReference: apiBooking?.paymentReceived?.reference || '',
        paymentDueAmount: apiBooking?.paymentDue?.amount ? String(apiBooking.paymentDue.amount) : '',
        paymentDueMethod: apiBooking?.paymentDue?.method || 'credit_card',
        paymentDueDate: cleanDate(apiBooking?.paymentDue?.dueDate),
        paymentDueNotes: apiBooking?.paymentDue?.notes || '',

        // booking date
        date: cleanDate(apiBooking?.date),
      };

      console.log('Mapped Initial Data:', initialData); // Debug log
      
      setEditInitial(initialData);
      setEditId(booking.id);
      setIsFullEditOpen(true);
    } catch (error) {
      console.error('Failed to fetch booking data for edit:', error);
      alert('Failed to load booking data for editing');
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const response = await http.put(`/api/bookings/${id}`, { status: newStatus });
      const updatedBooking = response.data;
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: newStatus as any,
                approvalStatus: updatedBooking.approvalStatus || b.approvalStatus,
              }
            : b
        )
      );
      setIsEditModalOpen(false);
      setEditingBooking(null);
    } catch (error: any) {
      console.error('Update failed:', error);
      alert('Failed to update booking status');
    }
  };

  // UPDATED: Download PDF with expanded data and v2 template; fallback to old /pdf

  // NEW: Client-side "Full PDF" that always contains all details (hotels[], visas[], legs[], costingRows[])
  const generateFullClientPDF = async (bookingId: string) => {
    try {
      // fetch the freshest single booking
      const { data } = await http.get(`/api/bookings/${bookingId}`);
      if (!data) {
        throw new Error('No booking data received');
      }
      const full = normalizeForPdf(data);

      // lazy import for performance and TS ESM/CJS compat
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

      // Colors
      const primaryColor = [30, 58, 138]; // Navy Blue
      const accentColor = [220, 38, 38]; // Red
      const lightGray = [248, 249, 250];
      const darkGray = [75, 85, 99];

      // Helper: Format Date
      const formatDate = (d: string) => {
        if (!d) return '—';
        try {
          const date = new Date(d);
          return date.toLocaleDateString('en-US', { 
            weekday: 'short',
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          });
        } catch {
          return d;
        }
      };

      // Helper: Format Currency
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(amount);
      };

      // Helper: Add Professional Header
      const addHeader = (pageNumber: number) => {
        // Top border accent
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(0, 0, pageWidth, 8, 'F');
        
        // Main header background
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 8, pageWidth, 85, 'F');
        
        // Company name
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('MUSTAFA TRAVELS & TOUR', margin, 50);
        
        // Tagline
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Luxury Umrah Partner 🕋', margin, 68);
        
        // Document title on right
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('BOOKING CONFIRMATION', pageWidth - margin, 50, { align: 'right' });
        
        // Page number
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${pageNumber}`, pageWidth - margin, 68, { align: 'right' });
        
        doc.setTextColor(0, 0, 0);
        return 110;
      };

      // Helper: Add Professional Footer
      const addFooter = () => {
        const footerY = pageHeight - 60;
        
        // Footer border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY, pageWidth - margin, footerY);
        
        // Contact information
        doc.setFontSize(9);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('MUSTAFA TRAVEL', margin, footerY + 15);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('info@mustafatravelsandtour.com', margin, footerY + 28);
        doc.text('+1 845-359-3888', margin, footerY + 40);
        
        // Website
        doc.text('www.mustafatravelsandtour.com', pageWidth / 2, footerY + 28, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
      };

      // Helper: Draw section header
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

      // Helper: Check if we need a new page
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

      // ==================== PAGE 1 ====================
      y = addHeader(currentPage);

      // Booking Reference Box
      doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.roundedRect(margin, y, contentWidth, 60, 5, 5, 'FD');
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(2);
      doc.roundedRect(margin, y, contentWidth, 60, 5, 5, 'S');
      
      // Booking details in box
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.text('Booking Reference', margin + 15, y + 20);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(full.id, margin + 15, y + 42);
      
      // Status badge
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

      // PROFIT SUMMARY (For Internal Use)
      const costingTotals = data?.costing?.totals || data?.pricing?.totals || {};
      const totalCost = costingTotals.totalCostPrice || costingTotals.totalCost || 0;
      const totalSale = costingTotals.totalSalePrice || costingTotals.totalSale || 0;
      const profit = costingTotals.profit || (totalSale - totalCost) || 0;
      
      if (totalCost || totalSale || profit) {
        checkPageBreak(80);
        doc.setFillColor(240, 249, 255); // Light blue background
        doc.roundedRect(margin, y, contentWidth, 70, 5, 5, 'F');
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(1.5);
        doc.roundedRect(margin, y, contentWidth, 70, 5, 5, 'S');
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175); // Blue color
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
        doc.setTextColor(22, 163, 74); // Green for profit
        doc.text(formatCurrency(profit), profitValueX, y + 55);
        
        doc.setTextColor(0, 0, 0);
        y += 85;
      }

      // CUSTOMER INFORMATION
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

      // TRAVEL DATES
      checkPageBreak(150);
      y = drawSectionHeader('TRAVEL DATES & PACKAGE', y);
      doc.setFontSize(10);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Booking Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      const bookingDateStr = full.dates.bookingDate || data?.date;
      doc.text(formatDate(bookingDateStr), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Departure Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      const departureDateStr = full.dates.departureDate || data?.departureDate || data?.flight?.departureDate;
      doc.text(formatDate(departureDateStr), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Return Date:', labelX, y);
      doc.setFont('helvetica', 'normal');
      const returnDateStr = full.dates.returnDate || data?.returnDate || data?.flight?.returnDate;
      doc.text(formatDate(returnDateStr), valueX, y); y += 16;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Package:', labelX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(full.pkg, valueX, y); y += 25;

      // FLIGHT DETAILS
      checkPageBreak(200);
      y = drawSectionHeader('FLIGHT DETAILS', y);
      doc.setFontSize(10);
      
      if (full.flight.route) {
        // Flight route box
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

      // ACCOMMODATION DETAILS
      if (full.hotels.length) {
        checkPageBreak(100);
        y = drawSectionHeader('ACCOMMODATION DETAILS', y);
        
        autoTable(doc, {
          startY: y,
          head: [['Hotel Name', 'Room Type', 'Check-In Date', 'Check-Out Date']],
          body: full.hotels.map((h: any) => [
            h.hotelName || 'Not specified', 
            h.roomType || 'Standard', 
            formatDate(h.checkIn), 
            formatDate(h.checkOut)
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

      // VISA INFORMATION
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

      // TRANSPORTATION DETAILS
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
            formatDate(l.date), 
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

      // COST BREAKDOWN
      if (full.pricing.table?.length) {
        checkPageBreak(150);
        y = drawSectionHeader(' PRICING BREAKDOWN', y);
        
        // Calculate total
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

      // PAYMENT STATUS
      if (data?.paymentReceived || data?.paymentDue) {
        checkPageBreak(150);
        y = drawSectionHeader('PAYMENT INFORMATION', y);
        
        // Payment Received
        if (data?.paymentReceived) {
          doc.setFillColor(220, 252, 231); // Light green background
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
            doc.text(`Date: ${formatDate(data.paymentReceived.date)}`, margin + 25, y + 66);
          }
          if (data.paymentReceived.reference) {
            doc.text(`Ref: ${data.paymentReceived.reference}`, margin + 25, y + 80);
          }
        }
        
        // Payment Due
        if (data?.paymentDue) {
          const xPos = pageWidth - margin - (contentWidth / 2) + 10;
          doc.setFillColor(254, 226, 226); // Light red background
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
            doc.text(`Due: ${formatDate(data.paymentDue.dueDate)}`, xPos + 10, y + 66);
          }
          if (data.paymentDue.notes) {
            doc.text(`Notes: ${data.paymentDue.notes}`, xPos + 10, y + 80);
          }
        }
        
        y += 110;
      }

      // CREDIT CARD INFORMATION
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
        
        // Show full card number if available, otherwise show last 4
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

      // IMPORTANT NOTICE
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

      // Add footer
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

  // NEW: Generate Invoice PDF matching the exact format from client's image
  const generateInvoicePDF = async (bookingId: string) => {
    try {
      // Fetch the booking data
      const { data } = await http.get(`/api/bookings/${bookingId}`);
      if (!data) {
        throw new Error('No booking data received');
      }
      
      // Lazy import jsPDF
      const jsPDFMod = await import('jspdf');
      const jsPDF = (jsPDFMod as any).default || jsPDFMod;

      const doc = new jsPDF({ 
        unit: 'pt', 
        format: 'letter',
        compress: true 
      });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 50;
      
      let y = margin;

      // Helper: Format currency
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      };

      // Helper: Format date
      const formatDate = (d?: string | null) => {
        if (!d) return '';
        try {
          const date = new Date(d);
          return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        } catch {
          return d;
        }
      };

      // ============= HEADER SECTION =============
      
      // Invoice Title (Top Left) - Blue color
      doc.setTextColor(30, 58, 138); // Blue color
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE', margin, y);
      
      // Company Name
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('MUSTAFA TRAVELS & TOUR', margin, y + 20);
      
      // Tagline
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Luxury Umrah Partner 🕋', margin, y + 35);
      
      // Company Address
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('15636 71st Ave', margin, y + 50);
      doc.text('Flushing, NY 11367', margin, y + 65);

      // Contact Information (to the right of address)
      const contactX = 250;
      doc.text('info@mustafatravelsandtour.com', contactX, y + 50);
      doc.text('+1 845-359-3888', contactX, y + 65);
      doc.text('www.mustafatravelsandtour.com', contactX, y + 80);

      // Logo (Top Right) - Add mustafa.png
      try {
        const logoUrl = '/mustafa.png';
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = logoUrl;
        });
        
        // Add logo image (positioned at top right)
        const logoWidth = 120;
        const logoHeight = 40;
        const logoX = pageWidth - margin - logoWidth; // Right align
        const logoY = y; // Top align
        doc.addImage(img, 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (logoError) {
        console.log('Could not load mustafa.png for invoice:', logoError);
        // Continue without logo if loading fails
      }
      
      y += 80;

      // ============= BILL TO / SHIP TO SECTION =============
      
      // Light blue background
      doc.setFillColor(173, 216, 230); // Light blue
      doc.rect(margin, y, pageWidth - 2 * margin, 50, 'F');
      
      // Bill To
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill to', margin + 10, y + 15);
      doc.setFont('helvetica', 'normal');
      doc.text(data.customerName || '—', margin + 10, y + 30);
      
      // Ship To removed per client request
      
      y += 60;

      // Dotted line separator (draw a regular line since dash() is not available in jsPDF)
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      
      y += 15;

      // ============= INVOICE DETAILS SECTION =============
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice details', margin, y);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Invoice Number (use booking ID)
      const invoiceNo = data._id ? data._id.slice(-6).toUpperCase() : '000000';
      doc.text(`Invoice no.: ${invoiceNo}`, margin, y + 20);
      doc.text('Terms: Due on receipt', margin, y + 35);
      
      // Dates - use actual booking dates
      const invoiceDate = formatDate(data.date || data.departureDate || new Date().toISOString());
      const dueDate = formatDate(data.paymentDue?.dueDate || data.returnDate || invoiceDate);
      doc.text(`Invoice date: ${invoiceDate}`, margin, y + 50);
      doc.text(`Due date: ${dueDate}`, margin, y + 65);
      
      y += 90;

      // ============= LINE ITEMS TABLE =============
      
      // Table Headers
      doc.setFillColor(70, 130, 180); // Steel blue for header
      doc.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('#', margin + 10, y + 17);
      doc.text('Date', margin + 35, y + 17);
      doc.text('Product or service', margin + 100, y + 17);
      doc.text('Description', margin + 200, y + 17);
      doc.text('Qty', pageWidth - margin - 120, y + 17, { align: 'right' });
      doc.text('Rate', pageWidth - margin - 80, y + 17, { align: 'right' });
      doc.text('Amount', pageWidth - margin - 10, y + 17, { align: 'right' });
      
      y += 30;

      // Table Data - Build from costing rows
      const costingRows = data.costing?.rows || data.pricing?.table || [];
      let rowNum = 1;
      
      for (const row of costingRows) {
        if (y > pageHeight - 100) {
          doc.addPage();
          y = margin;
        }
        
        // Alternate row colors
        if (rowNum % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y - 5, pageWidth - 2 * margin, 20, 'F');
        }
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const itemDate = formatDate(data.departureDate || data.date || data.flight?.departureDate);
        const qty = Number(row.quantity) || 0;
        const rate = Number(row.salePerQty) || 0;
        const amount = qty * rate;
        
        doc.text(`${rowNum}.`, margin + 10, y + 7);
        doc.text(itemDate, margin + 35, y + 7);
        
        // Product or service (bold)
        doc.setFont('helvetica', 'bold');
        const productName = (row.label || row.item || '—').toUpperCase();
        doc.text(productName, margin + 100, y + 7);
        
        // Description - use actual data if available, otherwise generate meaningful description
        doc.setFont('helvetica', 'normal');
        const description = productName.includes('ADULT') 
          ? `${productName} ${qty} ADULTS` 
          : productName.includes('INFANT') 
          ? `${productName} ${qty} INFANT`
          : `${productName} ${qty} ${qty === 1 ? 'unit' : 'units'}`;
        doc.text(description, margin + 200, y + 7);
        
        // Quantity (right aligned)
        doc.text(String(qty), pageWidth - margin - 120, y + 7, { align: 'right' });
        
        // Rate (right aligned)
        doc.text(formatCurrency(rate), pageWidth - margin - 80, y + 7, { align: 'right' });
        
        // Amount (right aligned)
        doc.text(formatCurrency(amount), pageWidth - margin - 10, y + 7, { align: 'right' });
        
        y += 25;
        rowNum++;
      }
      
      y += 10;

      // ============= SUMMARY SECTION =============
      
      // Calculate totals
      const totalAmount = costingRows.reduce((sum: number, r: any) => 
        sum + ((Number(r.quantity) || 0) * (Number(r.salePerQty) || 0)), 0);
      
      const paymentReceived = data.paymentReceived?.amount || 0;
      const balanceDue = totalAmount - paymentReceived;
      
      const summaryX = pageWidth - margin - 150;
      
      // Total
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Total:', summaryX, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(totalAmount), summaryX + 110, y, { align: 'right' });
      
      y += 20;
      
      // Payment
      if (paymentReceived > 0) {
        doc.setFont('helvetica', 'normal');
        doc.text('Payment:', summaryX, y);
        doc.text(formatCurrency(-paymentReceived), summaryX + 110, y, { align: 'right' });
        y += 20;
      }
      
      // Balance due
      doc.setFont('helvetica', 'normal');
      doc.text('Balance due:', summaryX, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(balanceDue), summaryX + 110, y, { align: 'right' });
      
      y += 20;
      
      // Overdue (if applicable)
      if (balanceDue > 0) {
        doc.setTextColor(255, 165, 0); // Orange
        doc.setFont('helvetica', 'bold');
        doc.text('Overdue', summaryX, y);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text(dueDate, summaryX + 80, y);
      }

      // ============= TERMS AND CONDITIONS SECTION =============
      
      // Check if we need a new page for terms and conditions
      y += 40;
      if (y > pageHeight - 350) {
        doc.addPage();
        y = margin;
      }

      // Terms and Conditions Header
      doc.setFillColor(70, 130, 180); // Steel blue background
      doc.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TERMS AND CONDITIONS', margin + 10, y + 17);
      
      y += 35;

      // Terms content
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      // Helper function to add text with line wrapping and check page breaks
      const addTermsText = (text: string, isBold: boolean = false, isSubHeader: boolean = false) => {
        if (y > pageHeight - 80) {
          doc.addPage();
          y = margin;
        }
        
        if (isSubHeader) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(30, 58, 138); // Blue color for subheaders
          doc.text(text, margin + 10, y);
          y += 18;
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          return;
        }
        
        if (isBold) {
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setFont('helvetica', 'normal');
        }
        
        // Split long text into lines
        const maxWidth = pageWidth - 2 * margin - 20;
        const lines = doc.splitTextToSize(text, maxWidth);
        
        for (const line of lines) {
          if (y > pageHeight - 80) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin + 10, y);
          y += 14;
        }
        y += 4; // Add spacing after each paragraph
      };

      // Flight Cancellation/Refund/Date Change
      addTermsText('FLIGHT POLICIES', false, true);
      addTermsText('• Cancellation / Refund / Date Change: An estimated penalty of $250 or more from the airline as per their policy + $100 service fee per person from the company.');
      addTermsText('• Flights can be Cancelled / Changed without any fee within 24 hours time span.');
      addTermsText('• Change of flight can only be done with same airline.');
      addTermsText('• Airline is responsible for the schedule change or layover time change.');
      addTermsText('• In case of a no show all the round trip will be cancelled by the airline and there will be no refund.');
      
      y += 8;
      
      // Land Package
      addTermsText('LAND PACKAGE POLICIES', false, true);
      addTermsText('• Land package cancellations must be informed at least one week before travel; otherwise, a 50% charge applies (except for December and Ramadan bookings).');
      addTermsText('• If an HCN is issued at the time of booking, no refund will be provided for that particular hotel, including hotels outside of Makkah and Madinah.');
      addTermsText('• Full amount will be refunded in case of any emergency.');
      
      y += 8;
      
      // Visa
      addTermsText('VISA POLICIES', false, true);
      addTermsText('• No Visa amount will be refunded if the visa is issued.');
      
      y += 8;
      
      // Transportation
      addTermsText('TRANSPORTATION POLICIES', false, true);
      addTermsText('• Transportation is fully refundable before traveling.');
      addTermsText('• Only the transportation included in the package will be provided; any additional services will incur extra charges.');
      
      y += 8;
      
      // Payment Options
      addTermsText('PAYMENT OPTIONS', false, true);
      addTermsText('Payment Options for the tickets:', true);
      addTermsText('1. Credit Card');
      addTermsText('2. Zelle');
      addTermsText('3. Wire Transfer / Bank Deposit');
      
      y += 8;
      
      addTermsText('Payment Options for the Land Package:', true);
      addTermsText('1. Zelle');
      addTermsText('2. Bank Deposit');
      addTermsText('3. Wire Transfer');
      addTermsText('Note: In case of payment of land package through credit card there will be a Merchant charge.');

      // Save the PDF
      doc.save(`MUSTAFA-Invoice-${invoiceNo}.pdf`);
    } catch (e: any) {
      console.error('Invoice generation failed', e);
      const errorMessage = e?.response?.data?.message || e?.message || 'Failed to generate invoice PDF';
      if (e?.response?.status === 403) {
        alert('You do not have permission to generate this invoice. Only the booking owner or admin can generate invoices.');
      } else {
        alert(`Failed to generate invoice PDF: ${errorMessage}`);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const displayBookings = useMemo(() => {
    const filteredByRole = isAdmin
      ? bookings
      : bookings.filter((b) => {
          return b.agentId === user?.id || b.agentId === (user as any)?.agentId;
        });
    return filteredByRole;
  }, [bookings, isAdmin, user]);

  const filteredBookings = displayBookings.filter((booking) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      booking.customer.toLowerCase().includes(s) ||
      booking.id.toLowerCase().includes(s) ||
      booking.package.toLowerCase().includes(s) ||
      booking.email.toLowerCase().includes(s) ||
      (booking.pnr || '').toLowerCase().includes(s);
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const groupedBookings = useMemo(() => {
    if (!groupByCustomer) return { 'All Bookings': filteredBookings };
    const groups: { [key: string]: UiBooking[] } = {};
    filteredBookings.forEach((booking) => {
      const customerKey = `${booking.customer} (${booking.email})`;
      if (!groups[customerKey]) groups[customerKey] = [];
      groups[customerKey].push(booking);
    });
    return groups;
  }, [filteredBookings, groupByCustomer]);

  const totalRevenue = filteredBookings.reduce((sum, b) => sum + (toNumberMaybe(b.amount) || 0), 0);
  const totalConfirmed = filteredBookings.filter((b) => b.status === 'confirmed').length;
  const totalPending = filteredBookings.filter((b) => b.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isAdmin ? 'All Bookings' : 'My Bookings'}
          </h1>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>Home</span>
            <span>/</span>
            <span className="text-blue-600">Bookings</span>
          </div>
        </div>
        <button
          onClick={() => setIsBookingModalOpen(true)}
          className="mt-4 sm:mt-0 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>New Booking</span>
        </button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-gray-600">Loading bookings…</div>
      )}
      {err && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <div className="ml-2 sm:ml-4">
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{filteredBookings.length}</p>
              <p className="text-xs sm:text-sm text-gray-600">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            </div>
            <div className="ml-2 sm:ml-4">
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{totalConfirmed}</p>
              <p className="text-xs sm:text-sm text-gray-600">Confirmed</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-1.5 sm:p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
            </div>
            <div className="ml-2 sm:ml-4">
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{totalPending}</p>
              <p className="text-xs sm:text-sm text-gray-600">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
            </div>
            <div className="ml-2 sm:ml-4">
              <p className="text-lg sm:text-2xl font-semibold text-gray-900">{currency(totalRevenue)}</p>
              <p className="text-xs sm:text-sm text-gray-600">Revenue</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search bookings, PNR, email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => setGroupByCustomer(!groupByCustomer)}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              groupByCustomer
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {groupByCustomer ? 'Ungroup' : 'Group by Customer'}
          </button>
        </div>
      </div>

      {/* Bookings Display */}
      <div className="space-y-6">
        {Object.entries(groupedBookings).map(([groupName, groupBookings]) => (
          <div key={groupName}>
            {groupByCustomer && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {groupName} ({groupBookings.length} booking{groupBookings.length !== 1 ? 's' : ''})
                </h3>
                <div className="h-px bg-gray-200"></div>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {groupBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow"
                >
                  {/* Booking Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                          {booking.customer}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">{booking.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-full max-w-full truncate ${getStatusColor(
                          booking.status
                        )}`}
                      >
                        {getStatusIcon(booking.status)}
                        <span className="truncate">
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{booking.email}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                      <Phone className="h-4 w-4" />
                      <span>{booking.phone || '—'}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{booking.package}</span>
                    </div>

                    {/* Show PNR if present */}
                    {!!booking.pnr && (
                      <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                        <Ticket className="h-4 w-4" />
                        <span>
                          PNR: <span className="font-medium">{booking.pnr}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Detailed Information */}
                  {(booking as any).flight?.departureCity ||
                  (booking as any).hotel?.hotelName ||
                  (booking as any).visa?.visaType ? (
                    <div className="space-y-3 mb-4">
                      {/* Flight Info */}
                      {(booking as any).flight?.departureCity && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-blue-900 mb-2">Flight Details</h4>
                          <div className="text-xs text-blue-800">
                            <p>
                              <span className="font-medium">Route:</span>{' '}
                              {(booking as any).flight.departureCity} → {(booking as any).flight.arrivalCity}
                            </p>
                            <p>
                              <span className="font-medium">Class:</span>{' '}
                              {(booking as any).flight.flightClass
                                ?.charAt(0)
                                .toUpperCase() + (booking as any).flight.flightClass?.slice(1)}
                            </p>
                            {(booking as any).flight?.pnr && (
                              <p>
                                <span className="font-medium">PNR:</span> {(booking as any).flight.pnr}
                              </p>
                            )}
                            {(booking as any).flight?.itinerary && (
                              <p className="mt-1">
                                <span className="font-medium">Itinerary:</span>
                                <br />
                                {(booking as any).flight.itinerary
                                  .split('\n')
                                  .map((ln: string, i: number) => (
                                    <span key={i} className="block">
                                      {ln}
                                    </span>
                                  ))}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Hotel Info (legacy single) */}
                      {(booking as any).hotel?.hotelName && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-green-900 mb-2">Hotel Details</h4>
                          <div className="text-xs text-green-800">
                            <p>
                              <span className="font-medium">Hotel:</span> {(booking as any).hotel.hotelName}
                            </p>
                            <p>
                              <span className="font-medium">Room:</span> {(booking as any).hotel.roomType}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Multiple Hotels array (if present) */}
                      {Array.isArray((booking as any).hotels) && (booking as any).hotels.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-green-900 mb-2">Hotels</h4>
                          <div className="text-xs text-green-800 space-y-1">
                            {(booking as any).hotels.map((h: any, i: number) => (
                              <div key={i} className="border-b border-green-100 pb-1">
                                <p>
                                  <span className="font-medium">Hotel:</span> {h.name || h.hotelName || '—'} (
                                  {h.roomType || '—'})
                                </p>
                                <p>
                                  <span className="font-medium">Dates:</span> {formatDate(h.checkIn) || '—'} →{' '}
                                  {formatDate(h.checkOut) || '—'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Visas list (if present) */}
                      {Array.isArray((booking as any).visas) && (booking as any).visas.length > 0 && (
                        <div className="bg-purple-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-purple-900 mb-2">Visa(s)</h4>
                          <div className="text-xs text-purple-800 space-y-1">
                            {(booking as any).visas.map((v: any, i: number) => (
                              <div key={i} className="border-b border-purple-100 pb-1">
                                <p>
                                  <span className="font-medium">Name:</span> {v.name || '—'}
                                </p>
                                <p>
                                  <span className="font-medium">Nationality:</span> {v.nationality || '—'}
                                </p>
                                <p>
                                  <span className="font-medium">Type:</span>{' '}
                                  {(v.visaType || '—').toString().replace(/^\w/, (c: string) => c.toUpperCase())}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transport Info */}
                      {(booking as any).transport && (
                        <div className="bg-orange-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-orange-900 mb-2">Transport Details</h4>
                          <div className="text-xs text-orange-800 space-y-1">
                            {(booking as any).transport?.transportType && (
                              <p>
                                <span className="font-medium">Type:</span>{' '}
                                {(booking as any).transport.transportType
                                  ?.charAt(0)
                                  .toUpperCase() + (booking as any).transport.transportType?.slice(1)}
                              </p>
                            )}
                            {(booking as any).transport?.pickupLocation && (
                              <p>
                                <span className="font-medium">Pickup:</span> {(booking as any).transport.pickupLocation}
                              </p>
                            )}
                            {Array.isArray((booking as any).transport?.legs) &&
                              (booking as any).transport.legs.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-medium">Legs:</p>
                                  <div className="mt-1 space-y-1">
                                    {(booking as any).transport.legs.map((l: any, i: number) => (
                                      <div key={i} className="border-b border-orange-100 pb-1">
                                        <p>
                                          {l.from || '—'} → {l.to || '—'} ({l.vehicleType || '—'})
                                        </p>
                                        <p>
                                          {formatDate(l.date) || '—'} {l.time || ''}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      {/* Costing table summary (if present) */}
                      {(booking as any).pricing?.table?.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-gray-900 mb-2">Costing</h4>
                          <div className="text-xs text-gray-800 space-y-1">
                            {(booking as any).pricing.table.map((r: any, i: number) => {
                              const qty = toNumberMaybe(r.quantity);
                              const cpq = toNumberMaybe(r.costPerQty);
                              const spq = toNumberMaybe(r.salePerQty);
                              const tc = qty * cpq;
                              const ts = qty * spq;
                              const pf = ts - tc;
                              return (
                                <div key={i} className="border-b border-gray-200 pb-1">
                                  <p className="font-medium">{r.label || '—'}</p>
                                  <p>
                                    Qty: {qty} | Cost/Qty: {currency(cpq)} | Sale/Qty: {currency(spq)}
                                  </p>
                                  <p>
                                    Total Cost: {currency(tc)} | Total Sale: {currency(ts)} | Profit:{' '}
                                    {currency(pf)}
                                  </p>
                                </div>
                              );
                            })}
                            {(booking as any).pricing?.totals && (
                              <p className="mt-1 font-semibold">
                                Totals — Cost:{' '}
                                {currency(toNumberMaybe((booking as any).pricing.totals.totalCostPrice))} · Sale:{' '}
                                {currency(toNumberMaybe((booking as any).pricing.totals.totalSalePrice))} · Profit:{' '}
                                {currency(toNumberMaybe((booking as any).pricing.totals.profit))}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Travel Dates */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                      <div>
                        <p className="text-gray-500 mb-1">Departure</p>
                        <p className="font-medium text-gray-900">{booking.departureDate || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Return</p>
                        <p className="font-medium text-gray-900">{booking.returnDate || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Amount and Agent */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs sm:text-sm text-gray-500">Amount</p>
                      <p className="text-lg sm:text-xl font-bold text-gray-900">{currency(booking.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs sm:text-sm text-gray-500">Agent</p>
                      <p className="text-xs sm:text-sm font-medium text-gray-900">{booking.agentName || '—'}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {/* 1) Invoice PDF */}
                    <button
                      onClick={() => generateInvoicePDF(booking.id)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                      title="Generate Invoice PDF"
                    >
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Invoice</span>
                    </button>

                    {/* 2) Server PDF (legacy/fallback) */}
                    {/*<button
                      onClick={() => handleDownloadPDF(booking.id)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>PDF</span>
                    </button>*/}

                    {/* 3) Full PDF (client, includes arrays/tables) */}
                    <button
                      onClick={() => generateFullClientPDF(booking.id)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                      title="Generate PDF with full itinerary, hotels[], visas[], legs, and costing"
                    >
                      <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Full PDF</span>
                    </button>

                    {/* 4) Full Edit */}
                    <button
                      onClick={() => handleOpenFullEdit(booking)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>

                    {/* 5) Status */}
                    <button
                      onClick={() => handleEditStatus(booking)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Status</span>
                    </button>

                    {/* 6) Delete */}
                    <button
                      onClick={() => handleDelete(booking.id)}
                      className="px-3 py-2 text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>

                  {/* Approval Status */}
                  {booking.approvalStatus === 'pending' && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-800 font-medium">Pending Admin Approval</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Empty State */}
        {!loading && !err && filteredBookings.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Get started by creating your first booking'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => setIsBookingModalOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create First Booking
              </button>
            )}
          </div>
        )}
      </div>

      {/* Booking Modal (Create) */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          fetchBookings();
        }}
        onSubmit={handleCreateBooking}
      />

      {/* Booking Modal (Full Edit) */}
      <BookingModal
        isOpen={isFullEditOpen}
        onClose={() => {
          setIsFullEditOpen(false);
          setEditInitial(null);
          setEditId(null);
          fetchBookings();
        }}
        onSubmit={(updated) => {
          const ui = mapBooking(updated);
          setBookings((prev) => prev.map((b) => (b.id === ui.id ? ui : b)));
        }}
        initialData={editInitial || undefined}
        bookingId={editId || undefined}
      />

      {/* Edit Status Modal (status-only) */}
      {isEditModalOpen && editingBooking && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
            <div className="bg-blue-600 text-white p-4 sm:p-6">
              <h2 className="text-xl font-bold">Edit Booking Status</h2>
              <p className="text-blue-100 text-sm mt-1">
                Booking: {editingBooking.customer}{' '}
                {editingBooking.pnr ? `(PNR: ${editingBooking.pnr})` : ''} - {editingBooking.package}
              </p>
            </div>

            <div className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Status</label>
                  <div className="text-sm text-gray-600 mb-4">
                    {editingBooking.status.charAt(0).toUpperCase() + editingBooking.status.slice(1)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">New Status</label>
                  <select
                    id="status-select"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    defaultValue={editingBooking.status}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 sm:p-6 flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingBooking(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const select = document.getElementById('status-select') as HTMLSelectElement;
                  const newStatus = select.value;
                  handleUpdateStatus(editingBooking.id, newStatus);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;

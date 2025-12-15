// BookingModal.tsx — PART 1/3
import React, { useEffect, useMemo, useState } from 'react';
import {
  X, User, CreditCard, Plane, Building, MapPin, Car, DollarSign, Plus, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { http } from '../lib/http';

/** ---- Types ---- */

export type StepId =
  | 'contact'
  | 'credit'
  | 'flights'
  | 'hotels'
  | 'visa'
  | 'transport'
  | 'costing';

type FlightLeg = {
  from: string;
  to: string;
  vehicleType: 'Sedan' | 'SUV' | 'GMC' | 'Coaster' | 'Bus';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
};

type HotelEntry = {
  hotelName?: string;
  name?: string; // Database uses 'name' field
  roomType: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
};

type VisaEntry = {
  name: string;
  nationality: string;
  visaType: 'tourist' | 'umrah';
};

type CostingRow = {
  label: string;       // e.g. "Flights", "Makkah Hotel"
  quantity: number;    // No of quantity
  costPerQty: number;  // Cost price per quantity
  salePerQty: number;  // Sale price per quantity
};

export interface BookingFormData {
  // Contact
  name: string;
  passengers: string;
  adults: string;
  children: string;
  email: string;
  contactNumber: string;
  agent: string;

  // Credit
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;

  // Flights (legacy single fields + free-text itinerary)
  departureCity: string;
  arrivalCity: string;
  departureDate: string;
  returnDate: string;
  flightClass: 'economy' | 'business' | 'first';
  pnr?: string;                   // 6 alphanumeric (legacy single PNR)
  pnrs?: string[];                 // Multiple PNRs support
  flightsItinerary?: string;      // free text paste area

  // Hotels (legacy single + multiple hotels)
  hotelName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  hotels?: HotelEntry[];

  // Visa (per-passenger)
  visaType: 'umrah' | 'hajj' | 'tourist';
  passportNumber: string;         // legacy
  nationality: string;            // legacy
  visasCount?: number;
  visas?: VisaEntry[];

  // Transport (legacy + multi-leg)
  transportType: 'bus' | 'car' | 'van' | 'taxi';
  pickupLocation: string;
  legsCount?: number;
  legs?: FlightLeg[];

  // Costing (dynamic rows)
  packagePrice: string;
  additionalServices: string;
  totalAmount: string;
  paymentMethod: 'credit_card' | 'bank_transfer' | 'cash' | 'installments';
  costingRows?: CostingRow[];

  // Payment Tracking
  paymentReceivedAmount?: string;
  paymentReceivedMethod?: 'credit_card' | 'zelle' | 'wire_transfer' | 'cash' | 'check';
  paymentReceivedDate?: string;
  paymentReceivedReference?: string;
  paymentDueAmount?: string;
  paymentDueMethod?: 'credit_card' | 'zelle' | 'wire_transfer' | 'cash' | 'check';
  paymentDueDate?: string;
  paymentDueNotes?: string;

  // Backend required additions
  package?: string;
  date?: string; // booking date
}

export const steps: { id: StepId; title: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { id: 'contact',   title: 'Contact Info',    icon: User },
  { id: 'credit',    title: 'Credit Card',     icon: CreditCard },
  { id: 'flights',   title: 'Flights',         icon: Plane },
  { id: 'hotels',    title: 'Hotels',          icon: Building },
  { id: 'visa',      title: 'Visa(s)',         icon: MapPin },
  { id: 'transport', title: 'Transportation',  icon: Car },
  { id: 'costing',   title: 'Costing',         icon: DollarSign },
];

/** ---- Helpers ---- */

function isoOrNull(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? null : d.toISOString();
}
function sanitizePNR(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') return Number(v.replace?.(/[$,]/g, '') ?? v) || 0;
  return 0;
}

/** ---- Validation (pure) ---- */
export function validateStepData(formData: BookingFormData, id: StepId): Record<string, string> {
  const e: Record<string, string> = {};

  if (id === 'contact') {
    if (!formData.name?.trim()) e.name = 'Name is required';
    if (!formData.email?.trim()) e.email = 'Email is required';
    if (!formData.contactNumber?.trim()) e.contactNumber = 'Contact number is required';
    if (!formData.passengers?.trim()) e.passengers = 'Number of passengers is required';
  }

  if (id === 'credit') {
    if (!formData.cardholderName?.trim()) e.cardholderName = 'Cardholder name is required';
  }

  if (id === 'flights') {
    // If no free-text itinerary, allow leaving legacy fields empty.
    // If you want to enforce at least something, require either itinerary or (dep+arr+dates).
    const hasItin = !!formData.flightsItinerary?.trim();
    const hasLegacyCombo =
      !!formData.departureCity?.trim() &&
      !!formData.arrivalCity?.trim() &&
      !!formData.departureDate &&
      !!formData.returnDate;

    if (!hasItin && !hasLegacyCombo) {
      e.flightsItinerary = 'Provide an itinerary OR fill departure/arrival + dates';
    }

    // Optional booking date, but if present must be a valid date
    if (formData.date && !isoOrNull(formData.date)) e.date = 'Invalid booking date';

    // PNR optional but must be exactly 6 alphanumeric if present
    if (formData.pnr?.trim() && !/^[A-Z0-9]{6}$/.test(formData.pnr.trim())) {
      e.pnr = 'PNR must be exactly 6 letters/numbers (e.g. ABC12D)';
    }
  }

  if (id === 'hotels') {
    if (formData.hotels && formData.hotels.length > 0) {
      formData.hotels.forEach((h, i) => {
        if (!h.hotelName?.trim()) e[`hotels_${i}_hotelName`] = 'Hotel name is required';
        if (!h.checkIn) e[`hotels_${i}_checkIn`] = 'Check-in is required';
        if (!h.checkOut) e[`hotels_${i}_checkOut`] = 'Check-out is required';
      });
    }
  }

  if (id === 'visa') {
    const count = formData.visasCount ?? 0;
    if (count > 0) {
      (formData.visas ?? []).slice(0, count).forEach((v, i) => {
        if (!v?.name?.trim()) e[`visa_${i}_name`] = 'Name is required';
        if (!v?.nationality?.trim()) e[`visa_${i}_nationality`] = 'Nationality is required';
        if (!v?.visaType) e[`visa_${i}_type`] = 'Visa type is required';
      });
    }
  }

  if (id === 'transport') {
    const legsCount = formData.legsCount ?? 0;
    if (legsCount > 0) {
      (formData.legs ?? []).slice(0, legsCount).forEach((leg, i) => {
        if (!leg?.from?.trim()) e[`leg_${i}_from`] = 'From is required';
        if (!leg?.to?.trim()) e[`leg_${i}_to`] = 'To is required';
        if (!leg?.vehicleType) e[`leg_${i}_vehicleType`] = 'Vehicle type is required';
        if (!leg?.date) e[`leg_${i}_date`] = 'Date is required';
        if (!leg?.time) e[`leg_${i}_time`] = 'Time is required';
      });
    }
  }

  if (id === 'costing') {
    if (!formData.package?.trim()) e.package = 'Package is required';

    if (formData.costingRows && formData.costingRows.length > 0) {
      formData.costingRows.forEach((row, i) => {
        if (!row.label?.trim()) e[`cost_${i}_label`] = 'Label is required';
        if (row.quantity < 0) e[`cost_${i}_qty`] = 'Quantity must be >= 0';
        if (row.costPerQty < 0) e[`cost_${i}_cpq`] = 'Cost per qty must be >= 0';
        if (row.salePerQty < 0) e[`cost_${i}_spq`] = 'Sale per qty must be >= 0';
      });
    }
  }

  return e;
}

/** ---- Payload builder (pure) ---- */

type MinimalUser = { id?: string; _id?: string; agentId?: string; };

function buildBookingPayload(formData: BookingFormData, user: MinimalUser | null | undefined) {
  const agentId =
    user?.agentId ?? user?.id ?? user?._id ?? (formData.agent || undefined);

  const customerName  = formData.name?.trim() || '';
  const customerEmail = formData.email?.trim() || '';
  const pkg           = formData.package?.trim() || '';
  const bookingDateIso =
    isoOrNull(formData.date) ||
    isoOrNull(formData.departureDate) ||
    new Date().toISOString();

  if (!customerName)  throw new Error('Customer name is required');
  if (!customerEmail) throw new Error('Customer email is required');
  if (!pkg)           throw new Error('Package is required');

  const packagePriceNum = toNum(formData.packagePrice);
  const totalAmountNum  = toNum(formData.totalAmount);

  const costingRows = (formData.costingRows ?? []).map((r) => {
    const qty = toNum(r.quantity);
    const cpq = toNum(r.costPerQty);
    const spq = toNum(r.salePerQty);
    return {
      // Use both 'label' and 'item' for compatibility
      item: (r.label || '').trim(),
      label: (r.label || '').trim(),
      quantity: qty,
      costPerQty: cpq,
      salePerQty: spq,
      totalCost: qty * cpq,
      totalSale: qty * spq,
      profit: (qty * spq) - (qty * cpq),
    };
  });

  const sumCost   = costingRows.reduce((s, r) => s + r.totalCost, 0);
  const sumSale   = costingRows.reduce((s, r) => s + r.totalSale, 0);
  const sumProfit = sumSale - sumCost;

  return {
    // CUSTOMER
    customerName,
    customerEmail,
    contactNumber: formData.contactNumber || '',
    passengers: formData.passengers || '',
    adults: formData.adults || '',
    children: formData.children || '',

    // IDENTIFIERS
    agent: agentId,  // Backend expects 'agent' field, not 'agentId'
    agentId,
    customerGroup: customerEmail,

    // PACKAGE / PRICING
    package: pkg,
    pricing: {
      packageName: pkg,
      packagePrice: packagePriceNum,
      additionalServices: formData.additionalServices || '',
      totalAmount: totalAmountNum || sumSale,
      paymentMethod: formData.paymentMethod || 'credit_card',
      table: costingRows,
      totals: {
        totalCostPrice: sumCost,
        totalSalePrice: sumSale,
        profit: sumProfit,
      },
    },
    // Also save to 'costing' field for backend compatibility
    costing: {
      rows: costingRows,
      totals: {
        totalCost: sumCost,
        totalSale: sumSale,
        profit: sumProfit,
      },
    },
    // legacy mirrors
    packagePrice: packagePriceNum,
    additionalServices: formData.additionalServices || '',
    totalAmount: totalAmountNum || sumSale,
    amount: totalAmountNum || sumSale,
    paymentMethod: formData.paymentMethod || 'credit_card',

    // TRAVEL DATES
    date: bookingDateIso,
    departureDate: isoOrNull(formData.departureDate) || '',
    returnDate: isoOrNull(formData.returnDate) || '',

    // FLIGHT - save to both 'flight' and 'flights' for compatibility
    flight: {
      itinerary: formData.flightsItinerary || '',
      departureCity: formData.departureCity || '',
      arrivalCity: formData.arrivalCity || '',
      departureDate: isoOrNull(formData.departureDate) || '',
      returnDate: isoOrNull(formData.returnDate) || '',
      flightClass: formData.flightClass || 'economy',
      pnr: (formData.pnr || '').toUpperCase(),
    },
    flights: {
      raw: formData.flightsItinerary || '',
      itineraryLines: (formData.flightsItinerary || '').split('\n').filter(Boolean),
    },
    pnr: (formData.pnr || (formData.pnrs && formData.pnrs.length > 0 ? formData.pnrs[0] : '') || '').toUpperCase(),
    pnrs: (formData.pnrs || (formData.pnr ? [formData.pnr] : [])).map(p => sanitizePNR(p)).filter(Boolean),
    departureCity: formData.departureCity || '',
    arrivalCity: formData.arrivalCity || '',
    flightClass: formData.flightClass || 'economy',

    // HOTELS - Use 'name' field as per database schema
    hotels: (formData.hotels ?? []).map((h) => ({
      name: h.hotelName || h.name || '',
      hotelName: h.hotelName || h.name || '', // Keep both for compatibility
      roomType: h.roomType || '',
      checkIn: isoOrNull(h.checkIn) || '',
      checkOut: isoOrNull(h.checkOut) || '',
    })),
    hotel: {
      name: formData.hotelName || '',
      hotelName: formData.hotelName || '', // Keep both for compatibility
      roomType: formData.roomType || '',
      checkIn: isoOrNull(formData.checkIn) || '',
      checkOut: isoOrNull(formData.checkOut) || '',
    },

    // VISAS - save in the structure expected by database
    visas: {
      count: (formData.visas ?? []).length,
      passengers: (formData.visas ?? []).map((v) => ({
        fullName: v.name || '',
        name: v.name || '', // Keep both for compatibility
        nationality: v.nationality || '',
        // Capitalize visaType to match enum: "Tourist" or "Umrah"
        visaType: v.visaType ? v.visaType.charAt(0).toUpperCase() + v.visaType.slice(1).toLowerCase() : 'Tourist',
      })),
    },
    // Legacy single visa field
    visa: {
      // Capitalize visaType to match enum
      visaType: formData.visaType ? formData.visaType.charAt(0).toUpperCase() + formData.visaType.slice(1).toLowerCase() : 'Umrah',
      nationality: formData.nationality || '',
      passportNumber: formData.passportNumber || '',
    },
    visaType: formData.visaType ? formData.visaType.charAt(0).toUpperCase() + formData.visaType.slice(1).toLowerCase() : 'Umrah',
    nationality: formData.nationality || '',

    // TRANSPORT - save to both fields for compatibility
    transport: {
      legs: (formData.legs ?? []).map((l) => ({
        from: l.from || '',
        to: l.to || '',
        vehicleType: l.vehicleType || 'Sedan',
        date: isoOrNull(l.date) || '',
        time: l.time || '',
      })),
      transportType: formData.transportType || 'bus',
      pickupLocation: formData.pickupLocation || '',
    },
    transportation: {
      count: (formData.legs ?? []).length,
      legs: (formData.legs ?? []).map((l) => ({
        from: l.from || '',
        to: l.to || '',
        vehicleType: l.vehicleType || 'Sedan',
        date: isoOrNull(l.date) || '',
        time: l.time || '',
      })),
    },

    // PAYMENT (masked)
    payment: {
      method: formData.paymentMethod || 'credit_card',
      cardLast4: (formData.cardNumber || '').replace(/\D/g, '').slice(-4),
      cardholderName: formData.cardholderName || '',
      expiryDate: formData.expiryDate || '',
    },
    // legacy raw — server should ignore PAN/CVV
    cardNumber: formData.cardNumber || '',
    expiryDate: formData.expiryDate || '',
    cvv: formData.cvv || '',
    cardholderName: formData.cardholderName || '',

    // PAYMENT TRACKING
    paymentReceived: formData.paymentReceivedAmount ? {
      amount: toNum(formData.paymentReceivedAmount),
      method: formData.paymentReceivedMethod || 'credit_card',
      date: isoOrNull(formData.paymentReceivedDate) || undefined,
      reference: formData.paymentReceivedReference || undefined,
    } : undefined,
    paymentDue: formData.paymentDueAmount ? {
      amount: toNum(formData.paymentDueAmount),
      method: formData.paymentDueMethod || 'credit_card',
      dueDate: isoOrNull(formData.paymentDueDate) || undefined,
      notes: formData.paymentDueNotes || undefined,
    } : undefined,

    // STATUS
    status: 'pending',
    approvalStatus: 'pending',
  };
}

/** ---- Props ---- */
interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (createdOrUpdated: unknown) => void;
  /** When set, the modal becomes EDIT mode and performs PUT /api/bookings/:id on submit */
  bookingId?: string;
  /** Seed the form (used for editing) */
  initialData?: Partial<BookingFormData>;
}
// BookingModal.tsx — PART 2/3

/** Small util for safe error messages */
function errorMessage(err: unknown): string {
  const e = err as { response?: any; message?: string };
  return (
    e?.response?.data?.message ||
    (typeof e?.response?.data === 'string' ? e.response.data : '') ||
    e?.message ||
    'Something went wrong'
  );
}

/** Defaults for array fields */
const emptyHotels: HotelEntry[] = [{ hotelName: '', roomType: '', checkIn: '', checkOut: '' }];
const emptyVisas: VisaEntry[]   = [];
const emptyLegs: FlightLeg[]    = [];
const starterCosting: CostingRow[] = [
  { label: 'Flights',        quantity: 0, costPerQty: 0, salePerQty: 0 },
  { label: 'Makkah Hotel',   quantity: 0, costPerQty: 0, salePerQty: 0 },
  { label: 'Madinah Hotel',  quantity: 0, costPerQty: 0, salePerQty: 0 },
  { label: 'Visa(s)',        quantity: 0, costPerQty: 0, salePerQty: 0 },
  { label: 'Transportation', quantity: 0, costPerQty: 0, salePerQty: 0 },
];

const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  bookingId,
  initialData,
}) => {
  const { user } = useAuth();

  // ---- Wizard state
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [agents, setAgents] = useState<any[]>([]);

  // multi-create support
  const [bookings, setBookings] = useState<BookingFormData[]>([]);
  const [currentBookingIndex, setCurrentBookingIndex] = useState<number>(0);

  // base empty form
  const empty: BookingFormData = {
    // contact
    name: '', passengers: '', adults: '', children: '', email: '', contactNumber: '', agent: '',
    // credit
    cardNumber: '', expiryDate: '', cvv: '', cardholderName: '',
    // flights
    departureCity: '', arrivalCity: '', departureDate: '', returnDate: '', flightClass: 'economy',
    pnr: '', pnrs: [], flightsItinerary: '',
    // hotels (legacy + array)
    hotelName: '', roomType: '', checkIn: '', checkOut: '', hotels: emptyHotels,
    // visa
    visaType: 'umrah', passportNumber: '', nationality: '', visasCount: 0, visas: emptyVisas,
    // transport
    transportType: 'bus', pickupLocation: '', legsCount: 0, legs: emptyLegs,
    // costing
    packagePrice: '', additionalServices: '', totalAmount: '', paymentMethod: 'credit_card',
    costingRows: starterCosting,
    // backend additions
    package: '', date: '',
  };

  const [formData, setFormData] = useState<BookingFormData>(empty);
  const step = steps[currentStep];

  // Fetch agents when modal opens
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchAgents = async () => {
      try {
        const { data } = await http.get('/api/agent');
        setAgents(data || []);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
        setAgents([]);
      }
    };
    
    fetchAgents();
  }, [isOpen]);

  // Initial open — create first booking OR load edit data
  useEffect(() => {
    if (!isOpen) return;

    // EDIT MODE: Load existing booking data
    if (initialData && Object.keys(initialData).length > 0) {
      console.log('BookingModal initialData:', initialData); // Debug log
      
      // Ensure all string fields are properly initialized to avoid controlled/uncontrolled warnings
      const sanitizedInitialData = {
        ...initialData,
        // Contact fields
        name: initialData.name || '',
        email: initialData.email || '',
        contactNumber: initialData.contactNumber || '',
        passengers: initialData.passengers || '',
        adults: initialData.adults || '',
        children: initialData.children || '',
        agent: initialData.agent || '',
        
        // Credit card fields
        cardNumber: initialData.cardNumber || '',
        expiryDate: initialData.expiryDate || '',
        cvv: initialData.cvv || '',
        cardholderName: initialData.cardholderName || '',
        
        // Flight fields
        departureCity: initialData.departureCity || '',
        arrivalCity: initialData.arrivalCity || '',
        departureDate: initialData.departureDate || '',
        returnDate: initialData.returnDate || '',
        pnr: initialData.pnr || '',
        pnrs: initialData.pnrs || (initialData.pnr ? [initialData.pnr] : []),
        flightsItinerary: initialData.flightsItinerary || '',
        flightClass: initialData.flightClass || 'economy',
        
        // Hotel fields
        hotelName: initialData.hotelName || '',
        roomType: initialData.roomType || '',
        checkIn: initialData.checkIn || '',
        checkOut: initialData.checkOut || '',
        
        // Visa fields
        visaType: initialData.visaType || 'umrah',
        passportNumber: initialData.passportNumber || '',
        nationality: initialData.nationality || '',
        visasCount: initialData.visasCount || 0,
        
        // Transport fields
        transportType: initialData.transportType || 'bus',
        pickupLocation: initialData.pickupLocation || '',
        legsCount: initialData.legsCount || 0,
        
        // Costing fields
        packagePrice: initialData.packagePrice || '',
        additionalServices: initialData.additionalServices || '',
        totalAmount: initialData.totalAmount || '',
        paymentMethod: initialData.paymentMethod || 'credit_card',
        
        // Payment tracking fields
        paymentReceivedAmount: initialData.paymentReceivedAmount || '',
        paymentReceivedMethod: initialData.paymentReceivedMethod || 'credit_card',
        paymentReceivedDate: initialData.paymentReceivedDate || '',
        paymentReceivedReference: initialData.paymentReceivedReference || '',
        paymentDueAmount: initialData.paymentDueAmount || '',
        paymentDueMethod: initialData.paymentDueMethod || 'credit_card',
        paymentDueDate: initialData.paymentDueDate || '',
        paymentDueNotes: initialData.paymentDueNotes || '',
        
        // Package & date
        package: initialData.package || '',
        date: initialData.date || '',
      };

      const merged: BookingFormData = {
        ...empty,
        ...sanitizedInitialData,
        hotels: initialData.hotels && initialData.hotels.length > 0 ? initialData.hotels : emptyHotels,
        visas: initialData.visas && initialData.visas.length > 0 ? initialData.visas : emptyVisas,
        legs: initialData.legs && initialData.legs.length > 0 ? initialData.legs : emptyLegs,
        costingRows: initialData.costingRows && initialData.costingRows.length > 0 ? initialData.costingRows : starterCosting,
      } as BookingFormData;
      
      console.log('BookingModal merged formData:', merged); // Debug log
      
      setBookings([merged]);
      setFormData(merged);
      setCurrentBookingIndex(0);
    } else {
      // NEW BOOKING MODE: Create empty booking
      if (bookings.length === 0) {
        setBookings([empty]);
        setFormData(empty);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData]);

  // ---- Mutators & handlers

  const updateForm = (patch: Partial<BookingFormData>) => {
    const updated: BookingFormData = { ...formData, ...patch };
    setFormData(updated);
    setBookings(prev => prev.map((b, i) => (i === currentBookingIndex ? updated : b)));
    setServerError('');
  };

  const handleInputChange: React.ChangeEventHandler<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  > = (e) => {
    const { name } = e.target as HTMLInputElement;
    let { value } = e.target as HTMLInputElement;
    if (name === 'pnr') value = sanitizePNR(value);
    updateForm({ [name]: value } as Partial<BookingFormData>);
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
  };

  const validateStep = (id: StepId) => {
    const e = validateStepData(formData, id);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step.id) && currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };
  const handlePrevious = () => setCurrentStep((s) => Math.max(0, s - 1));

  const addAnotherBooking = () => {
    const newBooking: BookingFormData = {
      ...empty,
      // copy common fields
      name: formData.name, passengers: formData.passengers, adults: formData.adults, children: formData.children,
      email: formData.email, contactNumber: formData.contactNumber, agent: formData.agent,
      cardNumber: formData.cardNumber, expiryDate: formData.expiryDate, cvv: formData.cvv, cardholderName: formData.cardholderName,
    };
    setBookings(prev => [...prev, newBooking]);
    setCurrentBookingIndex(bookings.length);
    setFormData(newBooking);
    setCurrentStep(0);
    setErrors({});
    setServerError('');
  };

  const switchToBooking = (index: number) => {
    if (index >= 0 && index < bookings.length) {
      setCurrentBookingIndex(index);
      setFormData(bookings[index]);
    }
  };

  const resetForm = () => {
    setBookings([empty]);
    setFormData(empty);
    setCurrentBookingIndex(0);
    setCurrentStep(0);
    setErrors({});
    setServerError('');
  };

  const fillTestData = () => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const testHotels: HotelEntry[] = [
      { hotelName: 'Makkah Hilton',  roomType: 'double', checkIn: today.toISOString().slice(0,10),    checkOut: nextWeek.toISOString().slice(0,10) },
      { hotelName: 'Madinah Pullman',roomType: 'double', checkIn: nextWeek.toISOString().slice(0,10), checkOut: nextWeek.toISOString().slice(0,10) },
    ];
    const testVisas: VisaEntry[] = [
      { name: 'John Doe',   nationality: 'US', visaType: 'umrah' },
      { name: 'Jane Doe',   nationality: 'US', visaType: 'umrah' },
      { name: 'Junior Doe', nationality: 'US', visaType: 'umrah' },
    ];
    const testLegs: FlightLeg[] = [
      { from: 'JED', to: 'MAK', vehicleType: 'SUV',     date: today.toISOString().slice(0,10),    time: '14:00' },
      { from: 'MAK', to: 'MED', vehicleType: 'Coaster', date: nextWeek.toISOString().slice(0,10), time: '09:00' },
    ];

    const testData: Partial<BookingFormData> = {
      name: 'John Doe',
      email: 'john@example.com',
      contactNumber: '+1-555-1234',
      passengers: '3',
      adults: '2',
      children: '1',
      flightsItinerary:
`1:TK1234 12OCT JFK IST 1200P 1050A 13OCT
2:TK5467 13OCT IST JED 1400P 2200P
3:TK2345 21OCT MED IST 0800A 1450P
4:TK8970 21OCT IST JFK 1600P 2000P`,
      departureCity: 'JFK',
      arrivalCity: 'JED',
      departureDate: today.toISOString().slice(0, 10),
      returnDate: nextWeek.toISOString().slice(0, 10),
      flightClass: 'economy',
      pnr: 'ABC12D',
      hotels: testHotels,
      visasCount: 3,
      visas: testVisas,
      legsCount: 2,
      legs: testLegs,
      packagePrice: '1200',
      additionalServices: 'Zamzam water, Ziyarah',
      totalAmount: '',
      paymentMethod: 'credit_card',
      package: '7N Umrah Standard',
      date: today.toISOString().slice(0, 10),
      costingRows: [
        { label: 'Flights',        quantity: 3, costPerQty: 800, salePerQty: 850 },
        { label: 'Makkah Hotel',   quantity: 1, costPerQty: 900, salePerQty: 1050 },
        { label: 'Madinah Hotel',  quantity: 1, costPerQty: 450, salePerQty: 760 },
        { label: 'Visa(s)',        quantity: 3, costPerQty: 150, salePerQty: 200 },
        { label: 'Transportation', quantity: 1, costPerQty: 480, salePerQty: 480 },
      ],
    };

    updateForm(testData);
  };

  // Derived totals for costing table
  const costingTotals = useMemo(() => {
    const rows = formData.costingRows ?? [];
    const sumCost = rows.reduce((s, r) => s + (toNum(r.quantity) * toNum(r.costPerQty)), 0);
    const sumSale = rows.reduce((s, r) => s + (toNum(r.quantity) * toNum(r.salePerQty)), 0);
    const profit  = sumSale - sumCost;
    return { sumCost, sumSale, profit };
  }, [formData.costingRows]);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();

    // validate all bookings
    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const eFlights = validateStepData(b, 'flights');
      const eCosting = validateStepData(b, 'costing');
      const eHotels  = validateStepData(b, 'hotels');
      const eVisa    = validateStepData(b, 'visa');
      const eTrans   = validateStepData(b, 'transport');
      const merged = { ...eFlights, ...eCosting, ...eHotels, ...eVisa, ...eTrans };
      if (Object.keys(merged).length > 0) {
        setCurrentBookingIndex(i);
        setFormData(b);
        setErrors(merged);
        setServerError(`Please complete all required fields for Booking ${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    setServerError('');
    try {
      const payloads = bookings.map(b => buildBookingPayload(b, user));

      // EDIT MODE: update single booking
      if (bookingId) {
        const res = await http.put(`/api/bookings/${bookingId}`, payloads[0]);
        onSubmit?.(res.data as unknown);
        resetForm();
        onClose();
        return;
      }

      // CREATE MODE: POST all
      const created: unknown[] = [];
      for (const p of payloads) {
        const res = await http.post('/api/bookings', p);
        created.push(res.data as unknown);
      }
      created.forEach(b => onSubmit?.(b));
      resetForm();
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;
// BookingModal.tsx — PART 3/3 (JSX UI + footer + export)

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200">

        {/* Header */}
        <div className="bg-blue-600 text-white p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Plane className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {bookingId ? 'Edit Booking' : 'Create New Booking'}
                </h2>
                {bookings.length > 1 && (
                  <p className="text-blue-100 text-sm">
                    Booking {currentBookingIndex + 1} of {bookings.length}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {bookings.length > 1 && (
                <div className="flex items-center space-x-2 mr-2">
                  {bookings.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => switchToBooking(index)}
                      className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                        index === currentBookingIndex
                          ? 'bg-white text-blue-600'
                          : 'bg-blue-500 text-white hover:bg-blue-400'
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              )}
              {!bookingId && (
                <button
                  type="button"
                  onClick={addAnotherBooking}
                  className="hidden sm:inline px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                  title="Add another booking for the same customer"
                >
                  + Booking
                </button>
              )}
              <button
                type="button"
                onClick={fillTestData}
                className="hidden sm:inline px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
              >
                Fill Test Data
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="mt-4 sm:mt-6">
            <div className="flex flex-wrap gap-2">
              {steps.map((s, index) => {
                const Icon = s.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-green-500 text-white'
                        : isCompleted
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-500 text-blue-100 hover:bg-blue-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6">
          {serverError && (
            <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* CONTACT */}
            {step.id === 'contact' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter Name</label>
                    <input
                      data-testid="name"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.name ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="Enter Name"
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Passengers</label>
                    <input
                      data-testid="passengers"
                      type="number"
                      name="passengers"
                      value={formData.passengers}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.passengers ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="Enter Number of Passengers"
                    />
                    {errors.passengers && <p className="text-red-500 text-xs mt-1">{errors.passengers}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                    <input
                      data-testid="adults"
                      type="number"
                      name="adults"
                      value={formData.adults}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="Adults"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Children</label>
                    <input
                      data-testid="children"
                      type="number"
                      name="children"
                      value={formData.children}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="Children"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      data-testid="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.email ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="Enter Email"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
                    <input
                      data-testid="contactNumber"
                      type="tel"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.contactNumber ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="Enter Contact Number"
                    />
                    {errors.contactNumber && (
                      <p className="text-red-500 text-xs mt-1">{errors.contactNumber}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Agent</label>
                  <select
                    name="agent"
                    value={formData.agent}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Use logged-in agent</option>
                    {agents.map((agent) => (
                      <option key={agent._id || agent.id} value={agent._id || agent.id}>
                        {agent.name} ({agent.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* CREDIT */}
            {step.id === 'credit' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Credit Card Information</h3>
                <p className="text-xs text-gray-500">
                  We only store <strong>payment method</strong> and <strong>last 4</strong>. Full card data is not sent
                  to server.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Card Number</label>
                    <input
                      type="text"
                      name="cardNumber"
                      value={formData.cardNumber}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="1234 5678 9012 3456"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date</label>
                    <input
                      type="text"
                      name="expiryDate"
                      value={formData.expiryDate}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="MM/YY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">CVV</label>
                    <input
                      type="password"
                      name="cvv"
                      value={formData.cvv}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="123"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cardholder Name</label>
                    <input
                      data-testid="cardholderName"
                      type="text"
                      name="cardholderName"
                      value={formData.cardholderName}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.cardholderName ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="John Doe"
                    />
                    {errors.cardholderName && (
                      <p className="text-red-500 text-xs mt-1">{errors.cardholderName}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* FLIGHTS */}
            {step.id === 'flights' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Flight Information</h3>

                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paste Itinerary (any number of segments)
                  </label>
                  <textarea
                    name="flightsItinerary"
                    value={formData.flightsItinerary || ''}
                    onChange={handleInputChange}
                    rows={5}
                    placeholder={`1:TK1234 12OCT JFK IST 1200P 1050A 13OCT
2:TK5467 13OCT IST JED 1400P 2200P
...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Optional booking date (kept to match backend date requirement) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Booking Date</label>
                    <input
                      data-testid="bookingDate"
                      type="date"
                      name="date"
                      value={formData.date || ''}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.date ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                    />
                    {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
                  </div>

                  {/* Departure Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Departure Date</label>
                    <input
                      data-testid="departureDate"
                      type="date"
                      name="departureDate"
                      value={formData.departureDate || ''}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.departureDate ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                    />
                    {errors.departureDate && <p className="text-red-500 text-xs mt-1">{errors.departureDate}</p>}
                  </div>

                  {/* Return Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Return Date</label>
                    <input
                      data-testid="returnDate"
                      type="date"
                      name="returnDate"
                      value={formData.returnDate || ''}
                      onChange={handleInputChange}
                      min={formData.departureDate || undefined}
                      className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                        errors.returnDate ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                      }`}
                    />
                    {errors.returnDate && <p className="text-red-500 text-xs mt-1">{errors.returnDate}</p>}
                  </div>

                  {/* Departure City */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Departure City</label>
                    <input
                      type="text"
                      name="departureCity"
                      value={formData.departureCity || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="e.g. JFK"
                    />
                  </div>

                  {/* Arrival City */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Arrival City</label>
                    <input
                      type="text"
                      name="arrivalCity"
                      value={formData.arrivalCity || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                      placeholder="e.g. JED"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Flight Class</label>
                    <select
                      name="flightClass"
                      value={formData.flightClass}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="economy">Economy</option>
                      <option value="business">Business</option>
                      <option value="first">First Class</option>
                    </select>
                  </div>
                </div>

                {/* Multiple PNRs Section */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      PNR(s) <span className="text-gray-400">(optional, 6 alphanumeric each)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentPnrs = formData.pnrs || (formData.pnr ? [formData.pnr] : []);
                        updateForm({ pnrs: [...currentPnrs, ''] });
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add PNR
                    </button>
                  </div>
                  {(formData.pnrs || (formData.pnr ? [formData.pnr] : [])).map((pnr, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={pnr || ''}
                        onChange={(e) => {
                          const sanitized = sanitizePNR(e.target.value);
                          const currentPnrs = formData.pnrs || (formData.pnr ? [formData.pnr] : []);
                          const updated = [...currentPnrs];
                          updated[idx] = sanitized;
                          updateForm({ pnrs: updated, pnr: updated[0] || '' }); // Keep first PNR in legacy field
                        }}
                        placeholder="e.g. ABC12D"
                        maxLength={6}
                        className={`flex-1 px-3 py-2 border-b focus:outline-none transition-colors ${
                          errors[`pnr_${idx}`] ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                        }`}
                      />
                      {(formData.pnrs || (formData.pnr ? [formData.pnr] : [])).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentPnrs = formData.pnrs || (formData.pnr ? [formData.pnr] : []);
                            const updated = currentPnrs.filter((_, i) => i !== idx);
                            updateForm({ pnrs: updated.length > 0 ? updated : undefined, pnr: updated[0] || '' });
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HOTELS (multiple) */}
            {step.id === 'hotels' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Hotel Information</h3>
                  <button
                    type="button"
                    onClick={() =>
                      updateForm({
                        hotels: [...(formData.hotels ?? []), { hotelName: '', roomType: '', checkIn: '', checkOut: '' }],
                      })
                    }
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Hotel
                  </button>
                </div>

                {(formData.hotels ?? []).map((h, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-700">Hotel #{idx + 1}</p>
                      {(formData.hotels ?? []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(formData.hotels ?? [])];
                            next.splice(idx, 1);
                            updateForm({ hotels: next });
                          }}
                          className="text-red-600 hover:text-red-700 text-xs flex items-center"
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Hotel Name</label>
                        <input
                          type="text"
                          value={h.hotelName}
                          onChange={(e) => {
                            const next = [...(formData.hotels ?? [])];
                            next[idx] = { ...next[idx], hotelName: e.target.value };
                            updateForm({ hotels: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`hotels_${idx}_hotelName`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                          placeholder="Hotel Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Room Type</label>
                        <select
                          value={h.roomType}
                          onChange={(e) => {
                            const next = [...(formData.hotels ?? [])];
                            next[idx] = { ...next[idx], roomType: e.target.value };
                            updateForm({ hotels: next });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select Room Type</option>
                          <option value="single">Single</option>
                          <option value="double">Double</option>
                          <option value="triple">Triple</option>
                          <option value="quad">Quad</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Check-in</label>
                        <input
                          type="date"
                          value={h.checkIn}
                          onChange={(e) => {
                            const next = [...(formData.hotels ?? [])];
                            const checkInDate = e.target.value;
                            next[idx] = { ...next[idx], checkIn: checkInDate };
                            // If check-out is before or equal to new check-in, clear or adjust check-out
                            if (checkInDate && next[idx].checkOut && next[idx].checkOut <= checkInDate) {
                              const checkIn = new Date(checkInDate);
                              checkIn.setDate(checkIn.getDate() + 1);
                              next[idx].checkOut = checkIn.toISOString().split('T')[0];
                            }
                            updateForm({ hotels: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`hotels_${idx}_checkIn`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Check-out</label>
                        <input
                          type="date"
                          value={h.checkOut}
                          min={h.checkIn ? (() => {
                            const checkIn = new Date(h.checkIn);
                            checkIn.setDate(checkIn.getDate() + 1);
                            return checkIn.toISOString().split('T')[0];
                          })() : undefined}
                          onChange={(e) => {
                            const next = [...(formData.hotels ?? [])];
                            next[idx] = { ...next[idx], checkOut: e.target.value };
                            updateForm({ hotels: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`hotels_${idx}_checkOut`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VISA(S) */}
            {step.id === 'visa' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Visa Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Visa(s)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.visasCount ?? 0}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value || 0));
                        const current = formData.visas ?? [];
                        let next = current.slice(0, n);
                        if (next.length < n) {
                          next = next.concat(
                            Array.from({ length: n - next.length }, () => ({
                              name: '',
                              nationality: '',
                              visaType: 'tourist' as const,
                            })),
                          );
                        }
                        updateForm({ visasCount: n, visas: next });
                      }}
                      className="w-full px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {(formData.visas ?? []).slice(0, formData.visasCount || 0).map((v, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg space-y-3">
                    <p className="font-medium text-sm text-gray-700">Passenger #{idx + 1}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                        <input
                          type="text"
                          value={v.name}
                          onChange={(e) => {
                            const next = [...(formData.visas ?? [])];
                            next[idx] = { ...next[idx], name: e.target.value };
                            updateForm({ visas: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`visa_${idx}_name`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Nationality</label>
                        <input
                          type="text"
                          value={v.nationality}
                          onChange={(e) => {
                            const next = [...(formData.visas ?? [])];
                            next[idx] = { ...next[idx], nationality: e.target.value };
                            updateForm({ visas: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`visa_${idx}_nationality`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                          placeholder="e.g. PK, US"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Visa Type</label>
                        <select
                          value={v.visaType}
                          onChange={(e) => {
                            const next = [...(formData.visas ?? [])];
                            next[idx] = { ...next[idx], visaType: e.target.value as 'tourist' | 'umrah' };
                            updateForm({ visas: next });
                          }}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors[`visa_${idx}_type`] ? 'ring-red-200 border-red-300' : ''
                          }`}
                        >
                          <option value="tourist">Tourist</option>
                          <option value="umrah">Umrah</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TRANSPORT (multi-leg) */}
            {step.id === 'transport' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Transportation</h3>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-700">Number of legs</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.legsCount ?? 0}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value || 0));
                        const current = formData.legs ?? [];
                        let next = current.slice(0, n);
                        if (next.length < n) {
                          next = next.concat(
                            Array.from({ length: n - next.length }, () => ({
                              from: '',
                              to: '',
                              vehicleType: 'Sedan' as const,
                              date: '',
                              time: '',
                            })),
                          );
                        }
                        updateForm({ legsCount: n, legs: next });
                      }}
                      className="w-24 px-3 py-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {(formData.legs ?? []).slice(0, formData.legsCount || 0).map((leg, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg space-y-3">
                    <p className="font-medium text-sm text-gray-700">Leg #{idx + 1}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
                        <input
                          type="text"
                          value={leg.from}
                          onChange={(e) => {
                            const next = [...(formData.legs ?? [])];
                            next[idx] = { ...next[idx], from: e.target.value };
                            updateForm({ legs: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`leg_${idx}_from`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                          placeholder="From"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
                        <input
                          type="text"
                          value={leg.to}
                          onChange={(e) => {
                            const next = [...(formData.legs ?? [])];
                            next[idx] = { ...next[idx], to: e.target.value };
                            updateForm({ legs: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`leg_${idx}_to`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                          placeholder="To"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle</label>
                        <select
                          value={leg.vehicleType}
                          onChange={(e) => {
                            const next = [...(formData.legs ?? [])];
                            next[idx] = { ...next[idx], vehicleType: e.target.value as FlightLeg['vehicleType'] };
                            updateForm({ legs: next });
                          }}
                          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors[`leg_${idx}_vehicleType`] ? 'ring-red-200 border-red-300' : ''
                          }`}
                        >
                          <option value="Sedan">Sedan</option>
                          <option value="SUV">SUV</option>
                          <option value="GMC">GMC</option>
                          <option value="Coaster">Coaster</option>
                          <option value="Bus">Bus</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                        <input
                          type="date"
                          value={leg.date}
                          min={idx > 0 && formData.legs && formData.legs[idx - 1]?.date ? (() => {
                            const prevLegDate = new Date(formData.legs[idx - 1].date);
                            prevLegDate.setDate(prevLegDate.getDate() + 1);
                            return prevLegDate.toISOString().split('T')[0];
                          })() : undefined}
                          onChange={(e) => {
                            const next = [...(formData.legs ?? [])];
                            const newDate = e.target.value;
                            next[idx] = { ...next[idx], date: newDate };
                            // If subsequent legs have dates that are before or equal to the new date, adjust them
                            if (newDate) {
                              for (let i = idx + 1; i < next.length; i++) {
                                if (next[i].date && next[i].date <= newDate) {
                                  const prevDate = new Date(newDate);
                                  prevDate.setDate(prevDate.getDate() + 1);
                                  next[i].date = prevDate.toISOString().split('T')[0];
                                }
                              }
                            }
                            updateForm({ legs: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`leg_${idx}_date`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                        <input
                          type="time"
                          value={leg.time}
                          onChange={(e) => {
                            const next = [...(formData.legs ?? [])];
                            next[idx] = { ...next[idx], time: e.target.value };
                            updateForm({ legs: next });
                          }}
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`leg_${idx}_time`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* COSTING */}
            {step.id === 'costing' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Costing</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateForm({
                          costingRows: [...(formData.costingRows ?? []), { label: '', quantity: 0, costPerQty: 0, salePerQty: 0 }],
                        })
                      }
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add Row
                    </button>
                  </div>
                </div>

                {/* Package (required) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Package</label>
                  <input
                    data-testid="package"
                    type="text"
                    name="package"
                    value={formData.package || ''}
                    onChange={handleInputChange}
                    className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                      errors.package ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="e.g. 7N Umrah Standard"
                  />
                  {errors.package && <p className="text-red-500 text-xs mt-1">{errors.package}</p>}
                </div>

                {/* Grid header */}
                <div className="hidden sm:grid grid-cols-6 gap-2 text-xs font-medium text-gray-600 px-2">
                  <div>Service</div>
                  <div className="text-right">Qty</div>
                  <div className="text-right">Cost / Qty</div>
                  <div className="text-right">Sale / Qty</div>
                  <div className="text-right">Total Cost</div>
                  <div className="text-right">Total Sale</div>
                </div>

                {(formData.costingRows ?? []).map((row, idx) => {
                  const qty = toNum(row.quantity);
                  const cpq = toNum(row.costPerQty);
                  const spq = toNum(row.salePerQty);
                  const totalCost = qty * cpq;
                  const totalSale = qty * spq;
                  const profit = totalSale - totalCost;
                  return (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center p-2 border border-gray-200 rounded-lg">
                      <div>
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => {
                            const next = [...(formData.costingRows ?? [])];
                            next[idx] = { ...next[idx], label: e.target.value };
                            updateForm({ costingRows: next });
                          }}
                          placeholder="e.g. Flights"
                          className={`w-full px-3 py-2 border-b focus:outline-none transition-colors ${
                            errors[`cost_${idx}_label`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={row.quantity}
                          onChange={(e) => {
                            const next = [...(formData.costingRows ?? [])];
                            next[idx] = { ...next[idx], quantity: Number(e.target.value || 0) };
                            updateForm({ costingRows: next });
                          }}
                          className={`w-full px-3 py-2 text-right border-b focus:outline-none transition-colors ${
                            errors[`cost_${idx}_qty`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={row.costPerQty}
                          onChange={(e) => {
                            const next = [...(formData.costingRows ?? [])];
                            next[idx] = { ...next[idx], costPerQty: Number(e.target.value || 0) };
                            updateForm({ costingRows: next });
                          }}
                          className={`w-full px-3 py-2 text-right border-b focus:outline-none transition-colors ${
                            errors[`cost_${idx}_cpq`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          value={row.salePerQty}
                          onChange={(e) => {
                            const next = [...(formData.costingRows ?? [])];
                            next[idx] = { ...next[idx], salePerQty: Number(e.target.value || 0) };
                            updateForm({ costingRows: next });
                          }}
                          className={`w-full px-3 py-2 text-right border-b focus:outline-none transition-colors ${
                            errors[`cost_${idx}_spq`] ? 'border-red-500' : 'border-gray-300 focus:border-blue-500'
                          }`}
                        />
                      </div>
                      <div className="text-right text-sm font-medium text-gray-900">{totalCost.toLocaleString()}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-right text-sm font-medium text-gray-900 flex-1">
                          {totalSale.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(formData.costingRows ?? [])];
                            next.splice(idx, 1);
                            updateForm({ costingRows: next });
                          }}
                          className="ml-2 text-red-600 hover:text-red-700"
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="sm:col-span-6 text-xs text-gray-500">
                        Profit for this row:{' '}
                        <span className="font-semibold text-gray-700">{profit.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Totals */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                  <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-xs text-gray-500">Total Cost P</p>
                    <p className="text-lg font-semibold">{costingTotals.sumCost.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-xs text-gray-500">Total Sale P</p>
                    <p className="text-lg font-semibold">{costingTotals.sumSale.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-xs text-gray-500">Profit</p>
                    <p className="text-lg font-semibold">{costingTotals.profit.toLocaleString()}</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Additional Services</label>
                  <textarea
                    name="additionalServices"
                    value={formData.additionalServices}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Any extras..."
                  />
                </div>

                {/* Payment method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <select
                    name="paymentMethod"
                    value={formData.paymentMethod}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="installments">Installments</option>
                  </select>
                </div>

                {/* Payment Received Section */}
                <div className="mt-6 p-4 border-2 border-green-200 rounded-lg bg-green-50">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Payment Received</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                      <input
                        type="number"
                        name="paymentReceivedAmount"
                        value={formData.paymentReceivedAmount || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
                      <select
                        name="paymentReceivedMethod"
                        value={formData.paymentReceivedMethod || 'credit_card'}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="credit_card">Credit Card</option>
                        <option value="zelle">Zelle</option>
                        <option value="wire_transfer">Wire Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                      <input
                        type="date"
                        name="paymentReceivedDate"
                        value={formData.paymentReceivedDate || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>
                      <input
                        type="text"
                        name="paymentReceivedReference"
                        value={formData.paymentReceivedReference || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Transaction ref or check #"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Due Section */}
                <div className="mt-4 p-4 border-2 border-orange-200 rounded-lg bg-orange-50">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Payment Due</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                      <input
                        type="number"
                        name="paymentDueAmount"
                        value={formData.paymentDueAmount || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
                      <select
                        name="paymentDueMethod"
                        value={formData.paymentDueMethod || 'credit_card'}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="credit_card">Credit Card</option>
                        <option value="zelle">Zelle</option>
                        <option value="wire_transfer">Wire Transfer</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                      <input
                        type="date"
                        name="paymentDueDate"
                        value={formData.paymentDueDate || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                      <input
                        type="text"
                        name="paymentDueNotes"
                        value={formData.paymentDueNotes || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Payment terms..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 sm:p-6 flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 0 || submitting}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            {currentStep === steps.length - 1 ? (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {submitting ? (bookingId ? 'Updating…' : 'Saving…') : bookingId ? 'Update Booking' : 'Create Booking'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingModal;

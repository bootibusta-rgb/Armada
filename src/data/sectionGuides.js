/**
 * Dynamic copy for in-app section guides (shown in 3D-style popup).
 * Keys must match withSectionGuide(..., 'key') usage.
 */
export const SECTION_GUIDES = {
  rider_home: {
    title: 'Home — Book a ride',
    accent: '#22C55E',
    accentDark: '#15803D',
    steps: [
      'Set your pickup and drop-off on the map.',
      'Enter your bid price — drivers see bids and can accept.',
      'Choose cash or card when you confirm.',
      'Use Rent a Car from here to browse rental listings.',
    ],
  },
  rider_coins: {
    title: 'Armada Coins',
    accent: '#FACC15',
    accentDark: '#CA8A04',
    steps: [
      'New riders get 100 coins (J$100 off one ride). You can redeem only 3 times per calendar month, no matter how many coins you have.',
      'Earn without limit: 1 coin per J$100 spent on rides. Only redemptions are capped; balances carry over.',
      'Redeem 100 coins for J$100 off — toggle on Home before you book, or in Active ride before you pay. Your driver gets notified. Count resets on the 1st of each month.',
    ],
  },
  rider_safety: {
    title: 'Emergency & safety',
    accent: '#EF4444',
    accentDark: '#B91C1C',
    steps: [
      'Add trusted contacts with phone numbers.',
      'In an emergency, Armada can alert app users or send SMS.',
      'Keep contacts updated for fastest help.',
    ],
  },
  driver_dashboard: {
    title: 'Driver dashboard',
    accent: '#F97316',
    accentDark: '#EA580C',
    steps: [
      'See nearby ride requests and open bids.',
      'Accept a bid to start the trip.',
      'Stay online for better match chances.',
    ],
  },
  driver_fleet: {
    title: 'My fleet',
    accent: '#8B5CF6',
    accentDark: '#6D28D9',
    steps: [
      'Manage vehicles linked to your account.',
      'Add photos and documents when required.',
      'Switch primary vehicle if you drive more than one.',
    ],
  },
  driver_earnings: {
    title: 'Earnings',
    accent: '#22C55E',
    accentDark: '#15803D',
    steps: [
      'Review trip payouts and history.',
      'Track cash vs card trips.',
      'Use filters to find past dates.',
    ],
  },
  driver_gold: {
    title: 'Gold Tier',
    accent: '#EAB308',
    accentDark: '#A16207',
    steps: [
      'Complete rides and maintain rating to climb tiers.',
      'Gold unlocks perks and corporate opportunities.',
      'Check requirements on this screen.',
    ],
  },
  driver_corporate: {
    title: 'Corporate gigs',
    accent: '#6366F1',
    accentDark: '#4338CA',
    steps: [
      'View shifts posted by corporate accounts.',
      'Accept open shifts that fit your schedule.',
      'Show up on time — corporate builds repeat business.',
    ],
  },
  driver_training: {
    title: 'Training',
    accent: '#0EA5E9',
    accentDark: '#0369A1',
    steps: [
      'Complete training modules when assigned.',
      'Refresh safety and service expectations.',
      'Finish required items to stay eligible.',
    ],
  },
  driver_profile: {
    title: 'Driver profile',
    accent: '#7C3AED',
    accentDark: '#5B21B6',
    steps: [
      'Update your name, phone, and vehicle info.',
      'Keep license and ID verification current.',
      'Good profiles build rider trust.',
    ],
  },
  corporate_dashboard: {
    title: 'Corporate hub',
    accent: '#7C3AED',
    accentDark: '#5B21B6',
    steps: [
      'Overview of rides, spend, and team activity.',
      'Jump to Book, Employees, or Shifts from the tabs.',
      'Manage subscription and billing from Subscription.',
    ],
  },
  corporate_book: {
    title: 'Book staff rides',
    accent: '#22C55E',
    accentDark: '#15803D',
    steps: [
      'Enter pickup, drop-off, and staff details.',
      'Assign to employees on your roster.',
      'Confirm pricing before sending to drivers.',
    ],
  },
  corporate_employees: {
    title: 'Employees',
    accent: '#3B82F6',
    accentDark: '#1D4ED8',
    steps: [
      'Add team members who can receive rides.',
      'Keep phone numbers accurate for dispatch.',
      'Remove leavers to keep the list clean.',
    ],
  },
  corporate_shifts: {
    title: 'Shifts',
    accent: '#F97316',
    accentDark: '#EA580C',
    steps: [
      'Create shifts drivers can pick up.',
      'Set time windows and locations clearly.',
      'Monitor filled vs open shifts here.',
    ],
  },
  corporate_subscription: {
    title: 'Subscription',
    accent: '#A855F7',
    accentDark: '#7E22CE',
    steps: [
      'Choose a plan that matches your monthly volume.',
      'Renew before expiry to avoid interruption.',
      'Contact support for plan changes.',
    ],
  },
  corporate_invoice: {
    title: 'Invoices',
    accent: '#14B8A6',
    accentDark: '#0F766E',
    steps: [
      'Download or share invoices for accounting.',
      'Match line items to ride batches.',
      'Export for your finance team.',
    ],
  },
  vendor_dashboard: {
    title: 'Vendor home',
    accent: '#F97316',
    accentDark: '#C2410C',
    steps: [
      'See today’s order volume and status.',
      'Open Menu to edit items and prices.',
      'Orders tab shows live pickup requests.',
    ],
  },
  vendor_menu: {
    title: 'Menu',
    accent: '#22C55E',
    accentDark: '#15803D',
    steps: [
      'Add dishes, sides, and modifiers.',
      'Set availability and prep times.',
      'Save changes so riders see updates immediately.',
    ],
  },
  vendor_orders: {
    title: 'Orders',
    accent: '#EC4899',
    accentDark: '#BE185D',
    steps: [
      'Accept new orders quickly.',
      'Mark ready when food is packed.',
      'Riders get notified for pickup.',
    ],
  },
  vendor_premium: {
    title: 'Vendor premium',
    accent: '#EAB308',
    accentDark: '#A16207',
    steps: [
      'Subscribe for boosted placement and tools.',
      'Manage billing and renewal here.',
      'Cancel anytime per plan terms.',
    ],
  },
  car_rental_home: {
    title: 'My rentals',
    accent: '#10B981',
    accentDark: '#047857',
    steps: [
      'See incoming rental requests from riders.',
      'Open a request to chat, counter-offer, or confirm.',
      'Keep listing details accurate in your profile.',
    ],
  },
  car_rental_listing: {
    title: 'Listing & fees',
    accent: '#6366F1',
    accentDark: '#4338CA',
    steps: [
      'Pay listing fees to stay visible to riders.',
      'Follow prompts for secure checkout.',
      'Renew before expiry to avoid delisting.',
    ],
  },
  car_rental_request: {
    title: 'Rental request',
    accent: '#06B6D4',
    accentDark: '#0E7490',
    steps: [
      'Review pickup, time, and the rider’s message.',
      'Call or text from here, or open chat to negotiate.',
      'Accept to book, suggest another vehicle, or mark unavailable.',
    ],
  },
  settings: {
    title: 'Settings',
    accent: '#64748B',
    accentDark: '#475569',
    steps: [
      'Switch light, dark, or system theme.',
      'If you’re both rider and driver, switch role here.',
      'Add the other role under “Verify as…” when needed.',
    ],
  },
};

/** Guide keys listed in Settings → Section guides, by active profile role. */
export const SECTION_GUIDE_KEYS_BY_ROLE = {
  rider: ['rider_home', 'rider_coins', 'rider_safety', 'settings'],
  driver: [
    'driver_dashboard',
    'driver_fleet',
    'driver_earnings',
    'driver_gold',
    'driver_corporate',
    'driver_training',
    'driver_profile',
    'settings',
  ],
  corporate: [
    'corporate_dashboard',
    'corporate_book',
    'corporate_employees',
    'corporate_shifts',
    'corporate_subscription',
    'corporate_invoice',
    'settings',
  ],
  vendor: ['vendor_dashboard', 'vendor_menu', 'vendor_orders', 'vendor_premium', 'settings'],
  carRental: ['car_rental_home', 'car_rental_listing', 'car_rental_request', 'settings'],
};

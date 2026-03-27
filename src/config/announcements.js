/**
 * Default announcements. Can be overridden by Firestore announcements collection.
 */
export const DEFAULT_ANNOUNCEMENTS = [
  {
    id: '1',
    title: 'Welcome to Armada',
    body: 'Jamaica\'s ride-share app. Bid your price, pay cash or card, and enjoy the ride!',
    type: 'info',
    date: '2025-03-01',
  },
  {
    id: '2',
    title: 'Armada Coins',
    body: 'New riders get 100 Armada coins (J$100 off). Earn 1 coin per J$100 spent. You can redeem 100 coins for J$100 off up to 3 times per month — balance can be higher; only uses are capped. Tap Coins for your balance.',
    type: 'promo',
    date: '2025-03-05',
  },
  {
    id: '3',
    title: 'Food Stops',
    body: 'Add a food stop to your ride! Pick up from Jerkman, Patty Palace, or KFC Kingston.',
    type: 'feature',
    date: '2025-03-08',
  },
  {
    id: '4',
    title: 'Emergency SOS',
    body: 'Tap the red Emergency button during a ride to alert your contacts with live location.',
    type: 'safety',
    date: '2025-03-10',
  },
];

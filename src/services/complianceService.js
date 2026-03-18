/**
 * Driver compliance score - docs, ratings, training.
 * Score 0-100. Used for driver profile and admin visibility.
 */
import { getVehicles } from './vehicleService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRAINING_COMPLETED_KEY = 'armada_driver_training_completed';
const DAYS_WARNING = 30;

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d < new Date();
}

function expiresWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return !isNaN(d.getTime()) && d >= now && d <= limit;
}

export async function getComplianceScore(driverId, userProfile) {
  let docScore = 50; // base
  let vehicles = [];
  try {
    vehicles = await getVehicles(driverId);
  } catch (_) {}

  const primaryId = userProfile?.primaryVehicleId;
  const primary = vehicles.find((v) => v.id === primaryId) || vehicles[0];

  if (primary) {
    if (primary.registrationExpiry) {
      if (isExpired(primary.registrationExpiry)) docScore -= 25;
      else if (expiresWithinDays(primary.registrationExpiry, DAYS_WARNING)) docScore -= 5;
      else docScore += 10;
    }
    if (primary.fitnessExpiry) {
      if (isExpired(primary.fitnessExpiry)) docScore -= 25;
      else if (expiresWithinDays(primary.fitnessExpiry, DAYS_WARNING)) docScore -= 5;
      else docScore += 10;
    }
  }

  const rating = userProfile?.rating ?? 4.5;
  const ratingScore = Math.min(100, Math.round(rating * 20));

  let trainingScore = 0;
  try {
    const stored = await AsyncStorage.getItem(TRAINING_COMPLETED_KEY);
    if (stored) {
      const completed = JSON.parse(stored);
      trainingScore = Math.min(15, completed.length * 5);
    }
  } catch (_) {}

  const idVerified = userProfile?.idVerified === true ? 5 : 0;

  const raw = (docScore * 0.4) + (ratingScore * 0.4) + trainingScore + idVerified;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    breakdown: {
      documents: Math.max(0, Math.min(100, docScore)),
      rating: ratingScore,
      training: trainingScore,
      idVerified,
    },
    issues: [
      primary?.registrationExpiry && isExpired(primary.registrationExpiry) && 'Registration expired',
      primary?.fitnessExpiry && isExpired(primary.fitnessExpiry) && 'Fitness expired',
      primary?.registrationExpiry && expiresWithinDays(primary.registrationExpiry, DAYS_WARNING) && 'Registration expiring soon',
      primary?.fitnessExpiry && expiresWithinDays(primary.fitnessExpiry, DAYS_WARNING) && 'Fitness expiring soon',
    ].filter(Boolean),
  };
}

import { AdRequest, AdPlacement, AdDuration, AdStatus } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

const STORAGE_KEY_ADS = 'hayenglish_ads_v1';
const OFFICIAL_OWNER_EMAIL = 'kurghinyanartyom2@gmail.com';

const isFirebaseSuperAdmin = (): boolean => {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase()
  );
};

// Seed demo advertisements for instant testing
const INITIAL_DEMO_ADS: AdRequest[] = [
  {
    id: 'ad_demo_it_english',
    businessName: 'Yerevan Tech Language Hub',
    contactEmail: 'partner@yerevantechhub.am',
    contactPhone: '+374 10 55-44-33',
    headline: 'IT & Business English Intensive Bootcamp',
    adText: 'Specialized 8-week English communication courses for Armenian software developers, PMs, and designers. Practice real tech interviews!',
    callToAction: 'Get 20% Discount',
    targetUrl: 'https://hayenglish.am/partners/tech-hub',
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=80',
    placement: 'hero_top',
    duration: '30_days',
    status: 'active',
    price: 60000,
    currency: 'AMD',
    adminNotes: 'High-value partner. Approved for hero banner placement.',
    submittedAt: '2026-09-10T10:00:00Z',
    reviewedAt: '2026-09-10T11:00:00Z',
    paidAt: '2026-09-10T12:00:00Z',
    expiresAt: '2026-10-10T12:00:00Z',
  },
  {
    id: 'ad_demo_cambridge_ielts',
    businessName: 'IELTS Prep Armenia (Kentron)',
    contactEmail: 'prep@ieltsarmenia.am',
    contactPhone: '+374 91 12-34-56',
    headline: 'Achieve Band 7.5+ in IELTS Academic',
    adText: 'Certified British Council trainers in Yerevan. Individual speaking mock tests and essay corrections with native teachers.',
    callToAction: 'Free Diagnostic Test',
    targetUrl: 'https://hayenglish.am/partners/ielts-center',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80',
    placement: 'sidebar_dashboard',
    duration: '14_days',
    status: 'active',
    price: 35000,
    currency: 'AMD',
    adminNotes: 'Promoted in student dashboard alongside CEFR levels.',
    submittedAt: '2026-09-15T09:30:00Z',
    reviewedAt: '2026-09-15T10:15:00Z',
    paidAt: '2026-09-15T11:00:00Z',
    expiresAt: '2026-09-29T11:00:00Z',
  },
  {
    id: 'ad_demo_tumanyan_books',
    businessName: 'Tumanyan International Bookstore',
    contactEmail: 'books@tumanyanbookstore.am',
    contactPhone: '+374 44 99-88-77',
    headline: 'Original English Fiction & Graded Readers',
    adText: 'Over 5,000 adapted English readers from Level 1 (A1) to Oxford Classics with audio CDs. Free delivery across Armenia.',
    callToAction: 'Browse Catalog',
    targetUrl: 'https://hayenglish.am/partners/bookstore',
    imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80',
    placement: 'lesson_footer',
    duration: '30_days',
    status: 'pending_review',
    submittedAt: '2026-09-24T14:20:00Z',
  },
];

export const getAdRequests = (): AdRequest[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ADS, JSON.stringify(INITIAL_DEMO_ADS));
      return INITIAL_DEMO_ADS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return INITIAL_DEMO_ADS;
  } catch {
    return INITIAL_DEMO_ADS;
  }
};

export const saveAdRequests = (ads: AdRequest[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_ADS, JSON.stringify(ads));
    window.dispatchEvent(new Event('hayenglish_ads_updated'));
  } catch (e) {
    console.error('Failed to save ad requests', e);
  }
};

/**
 * Syncs ad requests from Firestore (all ads for super admin, active ads for students).
 */
export const syncAdsFromFirestore = async (adminView: boolean = false): Promise<AdRequest[]> => {
  const currentLocal = getAdRequests();
  try {
    const q =
      adminView && isFirebaseSuperAdmin()
        ? collection(db, 'adRequests')
        : query(collection(db, 'adRequests'), where('status', '==', 'active'));

    const snap = await getDocs(q);
    if (!snap.empty) {
      const remoteAds = snap.docs.map((d) => d.data() as AdRequest);
      const mergedMap = new Map<string, AdRequest>();
      currentLocal.forEach((ad) => mergedMap.set(ad.id, ad));
      remoteAds.forEach((ad) => mergedMap.set(ad.id, ad));
      const merged = Array.from(mergedMap.values()).sort((a, b) =>
        (b.submittedAt || '').localeCompare(a.submittedAt || '')
      );
      saveAdRequests(merged);
      return merged;
    }
  } catch (err) {
    if (adminView && isFirebaseSuperAdmin()) {
      handleFirestoreError(err, OperationType.LIST, 'adRequests');
    }
  }
  return currentLocal;
};

export const getActiveAdsByPlacement = (placement: AdPlacement): AdRequest[] => {
  const all = getAdRequests();
  const now = new Date().toISOString();
  return all.filter((ad) => {
    if (ad.status !== 'active' || ad.placement !== placement) return false;
    if (ad.expiresAt && ad.expiresAt < now) return false;
    return true;
  });
};

export const AD_PRICING_PLANS: Record<
  AdDuration,
  {
    duration: AdDuration;
    labelHy: string;
    labelEn: string;
    days: number;
    priceAMD: number;
    badgeHy?: string;
    badgeEn?: string;
  }
> = {
  '7_days': {
    duration: '7_days',
    labelHy: '1 շաբաթ',
    labelEn: '1 week',
    days: 7,
    priceAMD: 4000,
  },
  '14_days': {
    duration: '14_days',
    labelHy: '2 շաբաթ',
    labelEn: '2 weeks',
    days: 14,
    priceAMD: 8000,
  },
  '30_days': {
    duration: '30_days',
    labelHy: '1 ամիս',
    labelEn: '1 month',
    days: 30,
    priceAMD: 12000,
    badgeHy: 'Ամենատարածված',
    badgeEn: 'Popular',
  },
  '90_days': {
    duration: '90_days',
    labelHy: '3 ամիս',
    labelEn: '3 months',
    days: 90,
    priceAMD: 25000,
    badgeHy: 'Խնայողական',
    badgeEn: 'Best Value',
  },
};

export const submitAdRequest = (data: {
  businessName: string;
  contactEmail: string;
  contactPhone?: string;
  headline: string;
  adText: string;
  callToAction: string;
  targetUrl: string;
  imageUrl: string;
  placement: AdPlacement;
  duration: AdDuration;
  price?: number;
  currency?: string;
  submitterUserId?: string;
}): AdRequest => {
  const all = getAdRequests();
  const calculatedPrice = data.price ?? AD_PRICING_PLANS[data.duration]?.priceAMD ?? 4000;
  const fbUid = auth.currentUser?.uid;
  const newRequest: AdRequest = {
    id: `ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    businessName: data.businessName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    headline: data.headline,
    adText: data.adText,
    callToAction: data.callToAction,
    targetUrl: data.targetUrl,
    imageUrl: data.imageUrl,
    placement: data.placement,
    duration: data.duration,
    submitterUserId: fbUid || data.submitterUserId,
    price: calculatedPrice,
    currency: data.currency || 'AMD',
    status: 'pending_review',
    submittedAt: new Date().toISOString(),
  };

  all.unshift(newRequest);
  saveAdRequests(all);

  // Sync to Firestore only when authenticated with Firebase Auth (matches Firestore Security Rules)
  if (fbUid) {
    const safeImageUrl =
      newRequest.imageUrl.startsWith('data:') && newRequest.imageUrl.length > 500
        ? ''
        : newRequest.imageUrl.slice(0, 500);

    const payload: Record<string, unknown> = {
      id: newRequest.id,
      businessName: newRequest.businessName.slice(0, 120),
      contactEmail: newRequest.contactEmail.slice(0, 120),
      headline: newRequest.headline.slice(0, 140),
      adText: newRequest.adText.slice(0, 500),
      callToAction: newRequest.callToAction.slice(0, 50),
      targetUrl: newRequest.targetUrl.slice(0, 500),
      imageUrl: safeImageUrl,
      placement: newRequest.placement,
      duration: newRequest.duration,
      status: 'pending_review',
      price: newRequest.price ?? null,
      currency: (newRequest.currency || 'AMD').slice(0, 10),
      submittedAt: newRequest.submittedAt,
      submitterUserId: fbUid,
    };

    if (newRequest.contactPhone) {
      payload.contactPhone = newRequest.contactPhone.slice(0, 40);
    }

    setDoc(doc(db, 'adRequests', newRequest.id), payload).catch((err) => {
      handleFirestoreError(err, OperationType.CREATE, `adRequests/${newRequest.id}`);
    });
  }

  return newRequest;
};

export const reviewAndSetPrice = (
  adId: string,
  price: number,
  currency: string = 'AMD',
  adminNotes?: string
): boolean => {
  const all = getAdRequests();
  const idx = all.findIndex((a) => a.id === adId);
  if (idx < 0) return false;

  all[idx].price = price;
  all[idx].currency = currency;
  all[idx].status = 'approved';
  all[idx].reviewedAt = new Date().toISOString();
  if (adminNotes !== undefined) {
    all[idx].adminNotes = adminNotes;
  }

  saveAdRequests(all);

  if (isFirebaseSuperAdmin()) {
    updateDoc(doc(db, 'adRequests', adId), {
      price,
      currency: currency.slice(0, 10),
      status: 'approved',
      reviewedAt: all[idx].reviewedAt,
      adminNotes: (adminNotes || '').slice(0, 500),
    }).catch((err) => {
      handleFirestoreError(err, OperationType.UPDATE, `adRequests/${adId}`);
    });
  }

  return true;
};

export const rejectAdRequest = (adId: string, adminNotes?: string): boolean => {
  const all = getAdRequests();
  const idx = all.findIndex((a) => a.id === adId);
  if (idx < 0) return false;

  all[idx].status = 'rejected';
  all[idx].reviewedAt = new Date().toISOString();
  if (adminNotes !== undefined) {
    all[idx].adminNotes = adminNotes;
  }

  saveAdRequests(all);

  if (isFirebaseSuperAdmin()) {
    updateDoc(doc(db, 'adRequests', adId), {
      status: 'rejected',
      reviewedAt: all[idx].reviewedAt,
      adminNotes: (adminNotes || '').slice(0, 500),
    }).catch((err) => {
      handleFirestoreError(err, OperationType.UPDATE, `adRequests/${adId}`);
    });
  }

  return true;
};

const getDurationDays = (duration: AdDuration): number => {
  switch (duration) {
    case '7_days':
      return 7;
    case '14_days':
      return 14;
    case '30_days':
      return 30;
    case '90_days':
      return 90;
    default:
      return 14;
  }
};

export const markAdAsPaidAndActivate = (adId: string): boolean => {
  const all = getAdRequests();
  const idx = all.findIndex((a) => a.id === adId);
  if (idx < 0) return false;

  const now = new Date();
  const days = getDurationDays(all[idx].duration);
  const expiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  all[idx].status = 'active';
  all[idx].paidAt = now.toISOString();
  all[idx].expiresAt = expiry.toISOString();

  saveAdRequests(all);

  if (isFirebaseSuperAdmin()) {
    updateDoc(doc(db, 'adRequests', adId), {
      status: 'active',
      paidAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    }).catch((err) => {
      handleFirestoreError(err, OperationType.UPDATE, `adRequests/${adId}`);
    });
  }

  return true;
};

export const deleteAdRequest = (adId: string): boolean => {
  const all = getAdRequests();
  const filtered = all.filter((a) => a.id !== adId);
  saveAdRequests(filtered);

  if (isFirebaseSuperAdmin()) {
    deleteDoc(doc(db, 'adRequests', adId)).catch((err) => {
      handleFirestoreError(err, OperationType.DELETE, `adRequests/${adId}`);
    });
  }

  return true;
};

export const toggleAdActive = (adId: string): boolean => {
  const all = getAdRequests();
  const idx = all.findIndex((a) => a.id === adId);
  if (idx < 0) return false;

  if (all[idx].status === 'active') {
    all[idx].status = 'approved';
    saveAdRequests(all);
    if (isFirebaseSuperAdmin()) {
      updateDoc(doc(db, 'adRequests', adId), {
        status: 'approved',
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `adRequests/${adId}`);
      });
    }
    return true;
  } else if (all[idx].status === 'approved') {
    return markAdAsPaidAndActivate(adId);
  }
  saveAdRequests(all);
  return true;
};

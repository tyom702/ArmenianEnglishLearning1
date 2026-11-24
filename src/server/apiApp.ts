import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  OFFICIAL_OWNER_EMAIL,
  type ServerTokenPayload,
  createSignedSessionToken,
  verifySignedSessionToken,
  verifyFirebaseIdToken,
  timingSafeStringMatch,
} from '../utils/tokenSecurity';

export interface ServerAdRequest {
  id: string;
  businessName: string;
  contactEmail: string;
  contactPhone?: string;
  headline: string;
  adText: string;
  callToAction: string;
  targetUrl: string;
  imageUrl: string;
  placement: string;
  duration: string;
  status: 'pending_review' | 'approved' | 'active' | 'rejected';
  price?: number | null;
  currency?: string;
  adminNotes?: string;
  submittedAt: string;
  reviewedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  submitterUserId?: string;
}

const serverAds: ServerAdRequest[] = [
  {
    id: 'ad_demo_it_english',
    businessName: 'Yerevan Tech Language Hub',
    contactEmail: 'partner@yerevantechhub.am',
    contactPhone: '+374 10 55-44-33',
    headline: 'IT & Business English Intensive Bootcamp',
    adText: 'Specialized 8-week English communication courses for Armenian software developers, PMs, and designers.',
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
    adText: 'Certified British Council trainers in Yerevan. Individual speaking mock tests with native teachers.',
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
];

interface ServerUserProgress {
  userId: string;
  email: string;
  streakCount: number;
  userXP: number;
  completedLessonIds: string[];
  masteredWordIds: string[];
  quizStats?: {
    totalQuizzesTaken: number;
    totalQuestionsAnswered: number;
    totalCorrectAnswers: number;
    bestStreak: number;
  };
  updatedAt: string;
}

const serverProgressStore = new Map<string, ServerUserProgress>();

export interface AuthenticatedRequest extends Request {
  userSession?: ServerTokenPayload;
}

const authenticateSession = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    req.userSession = undefined;
    return next();
  }

  // 1. Try fast HMAC server session token
  const verified = verifySignedSessionToken(token);
  if (verified) {
    req.userSession = verified;
    return next();
  }

  // 2. Fallback: verify Firebase Auth ID token directly (stateless across Vercel lambdas)
  const firebaseUser = await verifyFirebaseIdToken(token);
  if (firebaseUser && firebaseUser.email) {
    const isOwner =
      firebaseUser.emailVerified &&
      firebaseUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
    req.userSession = {
      userId: firebaseUser.uid,
      email: firebaseUser.email,
      role: isOwner ? 'super_admin' : 'student',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  next();
};

const requireOwnerSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const session = req.userSession;
  if (
    !session ||
    session.role !== 'super_admin' ||
    session.email.toLowerCase() !== OFFICIAL_OWNER_EMAIL.toLowerCase()
  ) {
    res.status(403).json({
      error: 'Access Denied: Only the official website owner (kurghinyanartyom2@gmail.com) has access to the Admin Panel.',
      authorized: false,
      ownerRequired: OFFICIAL_OWNER_EMAIL,
    });
    return;
  }
  next();
};

export function createApiApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(authenticateSession);

  // Healthcheck endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'hayenglish-api',
      timestamp: new Date().toISOString(),
    });
  });

  // --------------------------------------------------------------------------
  // AUTH & ROLE VERIFICATION ENDPOINTS
  // --------------------------------------------------------------------------

  app.post('/api/auth/token', async (req: AuthenticatedRequest, res: Response) => {
    const { userId, email, idToken, adminPasscode } = req.body || {};

    // Preferred path: verify authentic Firebase ID token from Google Sign-In
    if (typeof idToken === 'string' && idToken.trim().length > 0) {
      const fbUser = await verifyFirebaseIdToken(idToken.trim());
      if (!fbUser || !fbUser.email) {
        res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
        return;
      }

      const isOwner =
        fbUser.emailVerified &&
        fbUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();

      if (fbUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase() && !fbUser.emailVerified) {
        res.status(403).json({ error: 'Owner email must be verified to receive super_admin role.' });
        return;
      }

      const token = createSignedSessionToken(fbUser.uid, fbUser.email);
      res.json({
        success: true,
        token,
        userId: fbUser.uid,
        email: fbUser.email,
        isOwner,
        role: isOwner ? 'super_admin' : 'student',
      });
      return;
    }

    if (!email || !userId || typeof email !== 'string' || typeof userId !== 'string') {
      res.status(400).json({ error: 'Missing userId or email' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUserId = userId.trim();
    const isOwnerEmail = cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase();

    if (isOwnerEmail) {
      // Never mint a super_admin token without server-side authentication
      const envPasscode = process.env.ADMIN_PASSCODE?.trim();
      const hasValidPasscode =
        Boolean(envPasscode) &&
        typeof adminPasscode === 'string' &&
        timingSafeStringMatch(adminPasscode, envPasscode!);
      const alreadyVerifiedOwner =
        req.userSession?.role === 'super_admin' &&
        req.userSession.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();

      if (!hasValidPasscode && !alreadyVerifiedOwner) {
        res.status(401).json({
          error: 'Owner authentication requires verified Google Sign-In (Firebase Auth) or server ADMIN_PASSCODE.',
          requiresGoogleAuth: true,
        });
        return;
      }
    }

    const token = createSignedSessionToken(cleanUserId, cleanEmail);
    res.json({
      success: true,
      token,
      userId: cleanUserId,
      email: cleanEmail,
      isOwner: isOwnerEmail,
      role: isOwnerEmail ? 'super_admin' : 'student',
    });
  });

  app.get('/api/auth/verify', (req: AuthenticatedRequest, res: Response) => {
    const session = req.userSession;
    if (!session) {
      res.json({
        authenticated: false,
        isOwner: false,
        role: 'guest',
      });
      return;
    }

    const isOwner =
      session.role === 'super_admin' &&
      session.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
    res.json({
      authenticated: true,
      email: session.email,
      userId: session.userId,
      role: session.role,
      isOwner,
    });
  });

  // --------------------------------------------------------------------------
  // STRICT OWNER-ONLY ADMIN ENDPOINTS (Enforced by requireOwnerSuperAdmin)
  // --------------------------------------------------------------------------

  app.get('/api/admin/check-access', requireOwnerSuperAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      authorized: true,
      owner: OFFICIAL_OWNER_EMAIL,
      role: 'super_admin',
      timestamp: new Date().toISOString(),
      serverMessage: 'Welcome Website Owner. Admin Desk access granted.',
    });
  });

  app.get('/api/admin/ads', requireOwnerSuperAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      ads: serverAds,
    });
  });

  app.post('/api/admin/ads/review', requireOwnerSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { adId, price, status, adminNotes } = req.body || {};
    if (typeof adId !== 'string') {
      res.status(400).json({ error: 'Invalid adId' });
      return;
    }

    const target = serverAds.find((a) => a.id === adId);
    if (!target) {
      res.status(404).json({ error: 'Ad request not found' });
      return;
    }

    if (price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0) {
      target.price = Number(price);
    }
    if (typeof status === 'string' && ['pending_review', 'approved', 'active', 'rejected'].includes(status)) {
      target.status = status as ServerAdRequest['status'];
    }
    if (typeof adminNotes === 'string') {
      target.adminNotes = adminNotes.slice(0, 500);
    }
    target.reviewedAt = new Date().toISOString();

    res.json({ success: true, ad: target });
  });

  app.post('/api/admin/ads/toggle', requireOwnerSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { adId } = req.body || {};
    if (typeof adId !== 'string') {
      res.status(400).json({ error: 'Invalid adId' });
      return;
    }

    const target = serverAds.find((a) => a.id === adId);
    if (!target) {
      res.status(404).json({ error: 'Ad request not found' });
      return;
    }

    target.status = target.status === 'active' ? 'approved' : 'active';
    res.json({ success: true, ad: target });
  });

  // --------------------------------------------------------------------------
  // PUBLIC ADS ENDPOINTS
  // --------------------------------------------------------------------------

  app.post('/api/ads/submit', (req: AuthenticatedRequest, res: Response) => {
    const adData = req.body || {};
    if (
      typeof adData.businessName !== 'string' ||
      !adData.businessName.trim() ||
      typeof adData.contactEmail !== 'string' ||
      !adData.contactEmail.trim() ||
      typeof adData.headline !== 'string' ||
      !adData.headline.trim()
    ) {
      res.status(400).json({ error: 'Missing required ad information' });
      return;
    }

    const allowedPlacements = ['hero_top', 'sidebar_dashboard', 'lesson_footer', 'quiz_finish'];
    const allowedDurations = ['7_days', '14_days', '30_days', '90_days'];

    const newAd: ServerAdRequest = {
      id: `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      businessName: adData.businessName.trim().slice(0, 120),
      contactEmail: adData.contactEmail.trim().slice(0, 120),
      contactPhone: typeof adData.contactPhone === 'string' ? adData.contactPhone.trim().slice(0, 40) : undefined,
      headline: adData.headline.trim().slice(0, 140),
      adText: typeof adData.adText === 'string' ? adData.adText.trim().slice(0, 500) : '',
      callToAction: typeof adData.callToAction === 'string' ? adData.callToAction.trim().slice(0, 50) : 'Learn More',
      targetUrl: typeof adData.targetUrl === 'string' ? adData.targetUrl.trim().slice(0, 500) : 'https://hayenglish.am',
      imageUrl: typeof adData.imageUrl === 'string' ? adData.imageUrl.trim().slice(0, 500) : '',
      placement: allowedPlacements.includes(adData.placement) ? adData.placement : 'hero_top',
      duration: allowedDurations.includes(adData.duration) ? adData.duration : '30_days',
      status: 'pending_review',
      submittedAt: new Date().toISOString(),
      submitterUserId: req.userSession?.userId,
    };

    serverAds.unshift(newAd);
    res.json({ success: true, ad: newAd });
  });

  app.get('/api/ads/active', (req: Request, res: Response) => {
    const placement = req.query.placement as string | undefined;
    const now = new Date().toISOString();

    let active = serverAds.filter((ad) => {
      if (ad.status !== 'active') return false;
      if (ad.expiresAt && ad.expiresAt < now) return false;
      return true;
    });

    if (placement) {
      active = active.filter((ad) => ad.placement === placement);
    }

    res.json({ success: true, ads: active });
  });

  // --------------------------------------------------------------------------
  // USER SECURE PROGRESS & LEADERBOARD ENDPOINTS
  // --------------------------------------------------------------------------

  app.get('/api/user/progress', (req: AuthenticatedRequest, res: Response) => {
    const session = req.userSession;
    if (!session) {
      res.status(401).json({ error: 'Unauthorized: login required' });
      return;
    }

    const data = serverProgressStore.get(session.userId) || {
      userId: session.userId,
      email: session.email,
      streakCount: 1,
      userXP: 0,
      completedLessonIds: [],
      masteredWordIds: [],
      updatedAt: new Date().toISOString(),
    };

    res.json({ success: true, progress: data });
  });

  app.post('/api/user/progress', (req: AuthenticatedRequest, res: Response) => {
    const session = req.userSession;
    if (!session) {
      res.status(401).json({ error: 'Unauthorized: login required' });
      return;
    }

    const { streakCount, userXP, completedLessonIds, masteredWordIds, quizStats } = req.body || {};
    const existing = serverProgressStore.get(session.userId);

    const previousXP = existing ? existing.userXP : 0;
    const safeXP = typeof userXP === 'number' && userXP >= 0 ? Math.min(userXP, previousXP + 500) : previousXP;

    const updated: ServerUserProgress = {
      userId: session.userId,
      email: session.email,
      streakCount: typeof streakCount === 'number' ? Math.max(1, streakCount) : 1,
      userXP: safeXP,
      completedLessonIds: Array.isArray(completedLessonIds) ? completedLessonIds.map(String) : [],
      masteredWordIds: Array.isArray(masteredWordIds) ? masteredWordIds.map(String) : [],
      quizStats: quizStats && typeof quizStats === 'object' ? quizStats : existing?.quizStats,
      updatedAt: new Date().toISOString(),
    };

    serverProgressStore.set(session.userId, updated);
    res.json({ success: true, progress: updated });
  });

  app.get('/api/leaderboard', (req: AuthenticatedRequest, res: Response) => {
    const currentUserId = req.userSession?.userId;
    const mockLeaders = [
      { id: 'usr_arm', name: 'Արմեն Դավթյան (Armen)', avatar: '👨‍💻', userXP: 1450, streakCount: 28, levelNumber: 6, levelTitleHy: 'Անգլերենի վիրտուոզ', levelTitleEn: 'Fluent Virtuoso' },
      { id: 'usr_ana', name: 'Անահիտ Ղազարյան (Anahit)', avatar: '🏔️', userXP: 980, streakCount: 14, levelNumber: 5, levelTitleHy: 'Սահուն հաղորդակից', levelTitleEn: 'Confident Speaker' },
      { id: 'usr_tig', name: 'Տիգրան Պետրոսյան (Tigran)', avatar: '⚡', userXP: 680, streakCount: 9, levelNumber: 4, levelTitleHy: 'Բառապաշարի վարպետ', levelTitleEn: 'Vocabulary Master' },
      { id: 'usr_son', name: 'Սոնա Մանուկյան (Sona)', avatar: '🌟', userXP: 420, streakCount: 6, levelNumber: 3, levelTitleHy: 'Անգլերենի գիտակ', levelTitleEn: 'Language Seeker' },
      { id: 'usr_dav', name: 'Դավիթ Կարապետյան (David)', avatar: '🎯', userXP: 290, streakCount: 4, levelNumber: 3, levelTitleHy: 'Անգլերենի գիտակ', levelTitleEn: 'Language Seeker' },
    ];

    const leaders = [...mockLeaders];

    if (currentUserId && serverProgressStore.has(currentUserId)) {
      const userProg = serverProgressStore.get(currentUserId)!;
      leaders.push({
        id: userProg.userId,
        name: req.userSession?.email === OFFICIAL_OWNER_EMAIL ? 'Artyom Kurghinyan (👑 Տեր)' : 'Դուք (You)',
        avatar: req.userSession?.email === OFFICIAL_OWNER_EMAIL ? '👑' : '🎓',
        userXP: userProg.userXP,
        streakCount: userProg.streakCount,
        levelNumber: Math.min(8, Math.floor(userProg.userXP / 250) + 1),
        levelTitleHy: 'Ակտիվ սովորող',
        levelTitleEn: 'Active Learner',
      });
    }

    leaders.sort((a, b) => b.userXP - a.userXP);
    const ranked = leaders.map((u, i) => ({
      ...u,
      rank: i + 1,
      isCurrentUser: u.id === currentUserId,
    }));

    res.json({ success: true, leaders: ranked });
  });

  return app;
}

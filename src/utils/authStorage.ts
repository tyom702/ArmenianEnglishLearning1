import { UserProfile, UserProgressData } from '../types';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs, limit, query } from 'firebase/firestore';
import { getApiUrl } from './apiBase';

export const OFFICIAL_OWNER_EMAIL = 'kurghinyanartyom2@gmail.com';

/**
 * Strict role check:
 * Returns true ONLY if user's email matches the authoritative owner email (kurghinyanartyom2@gmail.com).
 * Prevents any other account or user from ever having admin rights.
 */
export const isOwnerAdmin = (user?: UserProfile | null): boolean => {
  if (!user || !user.email) return false;
  const isMatch = user.email.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
  if (!isMatch) return false;
  if (user.role && user.role !== 'super_admin') return false;
  return true;
};

/**
 * Checks whether the current Firebase Auth session matches the owner/target userId
 * so Firestore reads/writes only execute when authorized by Firebase Auth rules.
 */
const canAccessUserFirestoreDoc = (userId: string): boolean => {
  const fbUser = auth.currentUser;
  if (!fbUser) return false;
  if (fbUser.uid === userId) return true;
  if (
    fbUser.emailVerified &&
    fbUser.email?.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase()
  ) {
    return true;
  }
  return false;
};

export const waitForFirebaseAuthReady = async (): Promise<void> => {
  try {
    const authWithReady = auth as typeof auth & { authStateReady?: () => Promise<void> };
    if (typeof authWithReady.authStateReady === 'function') {
      await authWithReady.authStateReady();
    }
  } catch {
    // Ignore if unavailable in non-browser environment
  }
};

/**
 * Authoritative Google/Firebase server-side owner verification:
 * Used when the frontend is deployed on static hosting (e.g. Render Static Site / Firebase Hosting)
 * where /api/* backend routes are not mounted (HTTP 404 or HTML fallback).
 * Verifies BOTH:
 * 1) Force-refreshed Firebase Auth token claims from Google Auth servers (email_verified + exact owner email)
 * 2) A live Firestore query on `users` gated strictly by `allow list: if isSuperAdmin()` in firestore.rules
 */
export const verifyFirebaseOwnerViaServer = async (): Promise<{
  authorized: boolean;
  reason?: string;
}> => {
  await waitForFirebaseAuthReady();
  const fbUser = auth.currentUser;
  if (!fbUser) {
    return {
      authorized: false,
      reason: `Please verify your Owner identity with Google Sign-In (${OFFICIAL_OWNER_EMAIL}).`,
    };
  }

  try {
    const tokenResult = await fbUser.getIdTokenResult(true);
    const claimEmail =
      typeof tokenResult.claims.email === 'string'
        ? tokenResult.claims.email.trim().toLowerCase()
        : (fbUser.email || '').trim().toLowerCase();
    const emailVerified = tokenResult.claims.email_verified === true || fbUser.emailVerified;

    if (!emailVerified || claimEmail !== OFFICIAL_OWNER_EMAIL.toLowerCase()) {
      return {
        authorized: false,
        reason: `Access is strictly restricted to the verified owner account (${OFFICIAL_OWNER_EMAIL}).`,
      };
    }

    // Confirm server-enforced Firestore Security Rules recognize this user as super_admin
    await getDocs(query(collection(db, 'users'), limit(1)));
    return { authorized: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Firestore admin permission check failed.';
    return {
      authorized: false,
      reason: msg,
    };
  }
};

/**
 * Server-side cryptographic role verification:
 * Verifies with the backend server (/api/admin/check-access) that the current user
 * holds an authentic, cryptographically signed super_admin token or verified Firebase ID token.
 * Only if the /api/* route itself is not mounted (404 / HTML static fallback), verifies via
 * Firebase Auth + Firestore Security Rules servers. Explicit 401/403 rejections are never bypassed.
 */
export const verifyServerOwnerAdmin = async (authToken?: string): Promise<boolean> => {
  try {
    await waitForFirebaseAuthReady();
    let token = authToken || getActiveSessionUser()?.authToken;
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken(true);
    }
    if (!token) return false;

    const res = await fetch(getApiUrl('/api/admin/check-access'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const isMissingApiRoute =
      res.status === 404 || (res.ok && !contentType.includes('application/json'));

    if (isMissingApiRoute) {
      const fbCheck = await verifyFirebaseOwnerViaServer();
      return fbCheck.authorized;
    }

    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.authorized && data.role === 'super_admin');
  } catch {
    return false;
  }
};

/**
 * Requests a cryptographically signed session token from the backend server.
 * When signed in with Firebase Auth, sends the Firebase ID token for server-side RS256 verification.
 */
export const requestServerSessionToken = async (
  userId: string,
  email: string,
  idToken?: string
): Promise<{
  token?: string;
  role?: 'super_admin' | 'student';
  isOwner?: boolean;
  requiresGoogleAuth?: boolean;
  error?: string;
} | null> => {
  try {
    const firebaseIdToken = idToken || (auth.currentUser ? await auth.currentUser.getIdToken() : undefined);
    const res = await fetch(getApiUrl('/api/auth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        email,
        ...(firebaseIdToken ? { idToken: firebaseIdToken } : {}),
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return data || { error: `HTTP ${res.status}` };
    }
    return data;
  } catch {
    return null;
  }
};

export interface StoredAccount {
  user: UserProfile;
  passwordHash: string;
  progress: UserProgressData;
}

const STORAGE_KEY_ACCOUNTS = 'hayenglish_accounts';
const STORAGE_KEY_SESSION = 'hayenglish_auth_session';

// Default student demo accounts (no owner credentials stored in client code)
const DEFAULT_ACCOUNTS: StoredAccount[] = [
  {
    user: {
      id: 'usr_aram',
      name: 'Արամ Սարգսյան',
      email: 'aram@hayenglish.am',
      avatar: '🎓',
      englishLevel: 'elementary',
      dailyGoalMinutes: 15,
      registeredAt: '2026-09-01T10:00:00Z',
      role: 'student',
    },
    passwordHash: 'hayenglish123',
    progress: {
      completedLessonIds: ['articles-a-an-the', 'present-simple-continuous'],
      masteredWordIds: ['v1', 'v2', 'v3', 'v5', 'v6'],
      streakCount: 5,
      userXP: 240,
    },
  },
  {
    user: {
      id: 'usr_anahit',
      name: 'Անահիտ Ղազարյան',
      email: 'anahit@hayenglish.am',
      avatar: '🏔️',
      englishLevel: 'beginner',
      dailyGoalMinutes: 10,
      registeredAt: '2026-09-15T12:00:00Z',
      role: 'student',
    },
    passwordHash: 'hayenglish123',
    progress: {
      completedLessonIds: ['articles-a-an-the'],
      masteredWordIds: ['v1', 'v4'],
      streakCount: 2,
      userXP: 80,
    },
  },
];

export const getStoredAccounts = (): StoredAccount[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Scrub legacy seeded default owner password if present from earlier version
      const sanitized = parsed.filter(
        (a: StoredAccount) =>
          !(
            a.user?.email?.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase() &&
            a.user?.id === 'usr_owner_superadmin'
          )
      );
      if (sanitized.length !== parsed.length) {
        const nextList = sanitized.length > 0 ? sanitized : DEFAULT_ACCOUNTS;
        localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(nextList));
        return nextList;
      }
      return parsed;
    }
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
    return DEFAULT_ACCOUNTS;
  } catch {
    return DEFAULT_ACCOUNTS;
  }
};

export const saveAccounts = (accounts: StoredAccount[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save accounts to storage', e);
  }
};

export const getActiveSessionUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    const user = JSON.parse(raw) as UserProfile;
    if (user && user.email) {
      const isOwner = user.email.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
      user.role = isOwner ? 'super_admin' : 'student';
    }
    return user;
  } catch {
    return null;
  }
};

export const setActiveSessionUser = (user: UserProfile | null) => {
  try {
    if (user) {
      const isOwner = user.email.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
      user.role = isOwner ? 'super_admin' : 'student';
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  } catch (e) {
    console.error('Failed to update session', e);
  }
};

export const getUserProgress = (userId: string): UserProgressData => {
  const accounts = getStoredAccounts();
  const acc = accounts.find((a) => a.user.id === userId);
  if (acc && acc.progress) {
    return {
      completedLessonIds: acc.progress.completedLessonIds || [],
      masteredWordIds: acc.progress.masteredWordIds || [],
      streakCount: acc.progress.streakCount || 1,
      userXP: acc.progress.userXP || 0,
      quizStats: acc.progress.quizStats,
      dailyMissions: acc.progress.dailyMissions,
      dailyMissionsDate: acc.progress.dailyMissionsDate,
      reviewPool: acc.progress.reviewPool || [],
      weeklyActivity: acc.progress.weeklyActivity,
    };
  }
  return {
    completedLessonIds: [],
    masteredWordIds: [],
    streakCount: 1,
    userXP: 0,
    reviewPool: [],
  };
};

export const saveUserProgress = (userId: string, progress: UserProgressData) => {
  const accounts = getStoredAccounts();
  const index = accounts.findIndex((a) => a.user.id === userId);
  if (index >= 0) {
    accounts[index].progress = {
      ...accounts[index].progress,
      ...progress,
    };
    saveAccounts(accounts);
  }

  // Only sync to Firestore when authenticated in Firebase Auth as the owner of this progress document
  if (!canAccessUserFirestoreDoc(userId)) {
    return;
  }

  const progressPath = `users/${userId}/progress/data`;
  setDoc(
    doc(db, 'users', userId, 'progress', 'data'),
    {
      streakCount: progress.streakCount ?? 1,
      userXP: progress.userXP ?? 0,
      completedLessonIds: progress.completedLessonIds || [],
      masteredWordIds: progress.masteredWordIds || [],
      quizStats: progress.quizStats || null,
      dailyMissions: progress.dailyMissions || null,
      dailyMissionsDate: progress.dailyMissionsDate || null,
      reviewPool: progress.reviewPool || [],
      weeklyActivity: progress.weeklyActivity || null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  ).catch((err) => {
    handleFirestoreError(err, OperationType.WRITE, progressPath);
  });
};

/**
 * Cross-device synchronization:
 * Loads the user's progress from Firestore when authenticated via Firebase Auth.
 */
export const syncProgressFromFirestore = async (userId: string): Promise<UserProgressData | null> => {
  if (!canAccessUserFirestoreDoc(userId)) {
    return null;
  }

  const progressPath = `users/${userId}/progress/data`;
  try {
    const docRef = doc(db, 'users', userId, 'progress', 'data');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<UserProgressData>;
      const existing = getUserProgress(userId);
      const merged: UserProgressData = {
        completedLessonIds: Array.from(new Set([...existing.completedLessonIds, ...(data.completedLessonIds || [])])),
        masteredWordIds: Array.from(new Set([...existing.masteredWordIds, ...(data.masteredWordIds || [])])),
        streakCount: Math.max(existing.streakCount, data.streakCount || 1),
        userXP: Math.max(existing.userXP, data.userXP || 0),
        quizStats: data.quizStats || existing.quizStats,
        dailyMissions: data.dailyMissions || existing.dailyMissions,
        dailyMissionsDate: data.dailyMissionsDate || existing.dailyMissionsDate,
        reviewPool: (data.reviewPool && data.reviewPool.length > 0) ? data.reviewPool : existing.reviewPool,
        weeklyActivity: data.weeklyActivity || existing.weeklyActivity,
      };

      const accounts = getStoredAccounts();
      const index = accounts.findIndex((a) => a.user.id === userId);
      if (index >= 0) {
        accounts[index].progress = merged;
        saveAccounts(accounts);
      }
      return merged;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, progressPath);
  }
  return null;
};

/**
 * Signs in using Firebase Google Authentication (signInWithPopup),
 * exchanges the Firebase ID token for a backend session token, and syncs the Firestore profile.
 */
export const signInWithGoogle = async (): Promise<{
  success: boolean;
  error?: string;
  user?: UserProfile;
}> => {
  try {
    const credential = await signInWithPopup(auth, googleAuthProvider);
    const fbUser = credential.user;

    if (!fbUser || !fbUser.email) {
      return { success: false, error: 'google_no_email' };
    }

    const cleanEmail = fbUser.email.trim().toLowerCase();
    const isOwner =
      fbUser.emailVerified &&
      cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase();
    const role: 'super_admin' | 'student' = isOwner ? 'super_admin' : 'student';

    const idToken = await fbUser.getIdToken();
    const serverRes = await requestServerSessionToken(fbUser.uid, cleanEmail, idToken);

    const accounts = getStoredAccounts();
    const existingIdx = accounts.findIndex(
      (a) => a.user.id === fbUser.uid || a.user.email.toLowerCase() === cleanEmail
    );

    const existingUser = existingIdx >= 0 ? accounts[existingIdx].user : undefined;
    const profile: UserProfile = {
      id: fbUser.uid,
      name: fbUser.displayName?.trim() || existingUser?.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      avatar: existingUser?.avatar || (isOwner ? '👑' : '🎓'),
      englishLevel: existingUser?.englishLevel || 'elementary',
      dailyGoalMinutes: existingUser?.dailyGoalMinutes || 15,
      registeredAt: existingUser?.registeredAt || new Date().toISOString(),
      role: serverRes?.role || role,
      authToken: serverRes?.token || idToken,
    };

    if (existingIdx >= 0) {
      accounts[existingIdx].user = profile;
    } else {
      accounts.push({
        user: profile,
        passwordHash: '',
        progress: {
          completedLessonIds: [],
          masteredWordIds: [],
          streakCount: 1,
          userXP: 25,
        },
      });
    }
    saveAccounts(accounts);
    setActiveSessionUser(profile);

    // Ensure user profile exists/updates cleanly in Firestore under Firebase Auth UID
    const userDocPath = `users/${fbUser.uid}`;
    try {
      const existingSnap = await getDoc(doc(db, 'users', fbUser.uid));
      if (!existingSnap.exists()) {
        await setDoc(doc(db, 'users', fbUser.uid), {
          id: fbUser.uid,
          name: profile.name.slice(0, 100),
          email: profile.email.slice(0, 120),
          avatar: profile.avatar.slice(0, 300),
          englishLevel: profile.englishLevel,
          dailyGoalMinutes: profile.dailyGoalMinutes,
          registeredAt: profile.registeredAt,
          role: profile.role,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await setDoc(
          doc(db, 'users', fbUser.uid),
          {
            name: profile.name.slice(0, 100),
            avatar: profile.avatar.slice(0, 300),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, userDocPath);
    }

    return { success: true, user: profile };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { success: false, error: 'popup_closed' };
    }
    if (code === 'auth/popup-blocked') {
      return { success: false, error: 'popup_blocked' };
    }
    if (code === 'auth/unauthorized-domain') {
      return { success: false, error: 'unauthorized_domain' };
    }
    console.error('[Google Auth] Sign-in failed:', err);
    return { success: false, error: 'google_auth_failed' };
  }
};

export const registerNewAccount = (
  name: string,
  email: string,
  passwordPlain: string,
  avatar: string,
  englishLevel: 'beginner' | 'elementary' | 'intermediate',
  dailyGoalMinutes: number
): { success: boolean; error?: string; user?: UserProfile } => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  if (!cleanName) {
    return { success: false, error: 'empty_name' };
  }
  if (!cleanEmail) {
    return { success: false, error: 'empty_email' };
  }
  if (cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase()) {
    return { success: false, error: 'owner_requires_google' };
  }
  if (passwordPlain.length < 5) {
    return { success: false, error: 'short_password' };
  }

  const accounts = getStoredAccounts();
  const existing = accounts.find(
    (a) =>
      a.user.email.toLowerCase() === cleanEmail ||
      a.user.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existing) {
    return { success: false, error: 'account_exists' };
  }

  const newUser: UserProfile = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    email: cleanEmail,
    avatar: avatar || '🎓',
    englishLevel,
    dailyGoalMinutes,
    registeredAt: new Date().toISOString(),
    role: 'student',
  };

  const newAccount: StoredAccount = {
    user: newUser,
    passwordHash: passwordPlain,
    progress: {
      completedLessonIds: [],
      masteredWordIds: [],
      streakCount: 1,
      userXP: 25,
    },
  };

  accounts.push(newAccount);
  saveAccounts(accounts);
  setActiveSessionUser(newUser);

  // Request signed student token from backend
  requestServerSessionToken(newUser.id, newUser.email).then((res) => {
    if (res?.token) {
      newUser.authToken = res.token;
      setActiveSessionUser(newUser);
    }
  });

  return { success: true, user: newUser };
};

export const loginAccount = (
  emailOrUsername: string,
  passwordPlain: string
): { success: boolean; error?: string; user?: UserProfile } => {
  const query = emailOrUsername.trim().toLowerCase();
  if (!query) {
    return { success: false, error: 'empty_email' };
  }
  if (!passwordPlain) {
    return { success: false, error: 'empty_password' };
  }
  if (query === OFFICIAL_OWNER_EMAIL.toLowerCase()) {
    return { success: false, error: 'owner_requires_google' };
  }

  const accounts = getStoredAccounts();
  const match = accounts.find(
    (a) =>
      a.user.email.toLowerCase() === query ||
      a.user.name.toLowerCase() === query ||
      a.user.id.toLowerCase() === query
  );

  if (!match) {
    return { success: false, error: 'user_not_found' };
  }

  if (!match.passwordHash || match.passwordHash !== passwordPlain) {
    return { success: false, error: 'invalid_password' };
  }

  match.user.role = 'student';
  setActiveSessionUser(match.user);

  requestServerSessionToken(match.user.id, match.user.email).then((res) => {
    if (res?.token) {
      match.user.authToken = res.token;
      setActiveSessionUser(match.user);
    }
  });

  return { success: true, user: match.user };
};

export const logoutSession = () => {
  setActiveSessionUser(null);
  signOut(auth).catch(() => {});
};

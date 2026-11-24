/**
 * QuantLab - Client Firebase Authentication & Authenticated API Fetch Helper
 * Propagates verified Firebase ID tokens via Authorization: Bearer headers.
 */
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export interface QuantLabAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export type AuthUserProfile = QuantLabAuthUser;

function mapUser(u: User | null): QuantLabAuthUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    emailVerified: u.emailVerified,
  };
}

export function subscribeAuthState(
  cb: (user: QuantLabAuthUser | null) => void
): () => void {
  if (typeof window === 'undefined') {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (u) => cb(mapUser(u)));
}

export async function signInWithGoogle(): Promise<QuantLabAuthUser> {
  const result = await signInWithPopup(auth, googleProvider);
  const mapped = mapUser(result.user);
  if (!mapped) {
    throw new Error('Autenticazione Google non completata.');
  }
  return mapped;
}

export async function signOutQuantLab(): Promise<void> {
  await signOut(auth);
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function authenticatedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const mergedHeaders = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(authHeaders)) {
    mergedHeaders.set(k, v);
  }
  return fetch(input, {
    ...init,
    headers: mergedHeaders,
  });
}

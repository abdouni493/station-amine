import { useState, useEffect, useRef } from 'react';
import { supabase, signOut } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'pompiste' | 'chef_brigade' | 'gerant' | 'magasin';

export interface AuthState {
  session:         Session | null;
  user:            User | null;
  userRole:        UserRole;
  userId:          string | undefined;
  isLoading:       boolean;
  isAuthenticated: boolean;
}

/**
 * Optimized auth hook for fast page refreshes.
 * - Uses localStorage cache for instant load
 * - Fetches profile in background without blocking UI
 * - Skips unnecessary delays on page refresh
 *
 * Optimizations (2025-05-24):
 *  1. Check localStorage for cached session first (instant)
 *  2. Load UI immediately, fetch profile in background
 *  3. Parallel profile fetching instead of sequential waits
 *  4. Aggressive timeout (3s) to avoid stuck loading screens
 *  5. Graceful profile fetch failure (uses default role)
 */
export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    session:         null,
    user:            null,
    userRole:        'admin',
    userId:          undefined,
    isLoading:       true,
    isAuthenticated: false,
  });

  // Prevent state updates after the component unmounts
  const mountedRef = useRef(true);
  const profileFetchRef = useRef<Promise<void> | null>(null);
  // Always-current snapshot of `auth`, so the onAuthStateChange listener
  // (registered once, see the empty dependency array below) can read the
  // latest auth state without re-subscribing on every change.
  const authRef = useRef<AuthState>(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  // Override auth state (called from Login page after manual login flow)
  const setManualAuth = (role: UserRole, userId?: string) => {
    setAuth(prev => ({
      ...prev,
      userRole:        role,
      userId,
      isAuthenticated: true,
      isLoading:       false,
    }));
  };

  const logout = async () => {
    await signOut();
    localStorage.removeItem('supabase.auth.token');
    setAuth({
      session:         null,
      user:            null,
      userRole:        'admin',
      userId:          undefined,
      isLoading:       false,
      isAuthenticated: false,
    });
  };

  // Resolve role via RPC — works for both admin_profiles AND all worker tables.
  // Falls back to 'admin' on error so the app never gets stuck in an unauthenticated state
  // when the RPC doesn't exist yet (pre-migration environments).
  const fetchRole = async (_userId: string): Promise<UserRole> => {
    try {
      const { data, error } = await supabase.rpc('get_my_role');
      if (error) {
        console.warn('[useAuth] get_my_role error:', error.message);
        // Fallback: check admin_profiles directly
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('role')
          .eq('id', _userId)
          .maybeSingle();
        if (profile?.role) return profile.role as UserRole;

        // If not an admin profile, try worker tables by auth_user_id
        try {
          const pimp = await supabase.from('pompistes').select('id').eq('auth_user_id', _userId).maybeSingle();
          if (pimp.data) return 'pompiste';
        } catch (e) {}
        try {
          const chef = await supabase.from('brigade_chefs').select('id').eq('auth_user_id', _userId).maybeSingle();
          if (chef.data) return 'chef_brigade';
        } catch (e) {}
        try {
          const ger = await supabase.from('gerants').select('id').eq('auth_user_id', _userId).maybeSingle();
          if (ger.data) return 'gerant';
        } catch (e) {}
        try {
          const mag = await supabase.from('magasin_workers').select('id').eq('auth_user_id', _userId).maybeSingle();
          if (mag.data) return 'magasin';
        } catch (e) {}

        // As a last resort, do NOT default to admin — treat as no-access worker
        return 'pompiste';
      }
      // RPC succeeded — verify 'admin' claims; fall through on null or unverified admin
      let resolved = data as UserRole | null;

      if (resolved === 'admin') {
        // Confirm the user is really in admin_profiles before trusting the claim
        const { data: ap } = await supabase
          .from('admin_profiles').select('id').eq('id', _userId).maybeSingle();
        if (ap) return 'admin'; // confirmed
        resolved = null; // not actually an admin — fall through to worker lookup
      } else if (resolved) {
        return resolved; // pompiste / chef_brigade / gerant / magasin — trust it
      }

      // RPC returned null or unverified 'admin' — query tables directly
      const { data: profile } = await supabase
        .from('admin_profiles').select('role').eq('id', _userId).maybeSingle();
      if (profile?.role) return profile.role as UserRole;

      const pimp = await supabase.from('pompistes').select('id').eq('auth_user_id', _userId).maybeSingle();
      if (pimp.data) return 'pompiste';
      const chef = await supabase.from('brigade_chefs').select('id').eq('auth_user_id', _userId).maybeSingle();
      if (chef.data) return 'chef_brigade';
      const ger = await supabase.from('gerants').select('id').eq('auth_user_id', _userId).maybeSingle();
      if (ger.data) return 'gerant';
      const mag = await supabase.from('magasin_workers').select('id').eq('auth_user_id', _userId).maybeSingle();
      if (mag.data) return 'magasin';

      return 'pompiste'; // unknown — deny admin access
    } catch (err) {
      console.error('[useAuth] fetchRole failed:', err);
      // If RPC fails entirely, try to infer role from worker tables
      try {
        const pimp = await supabase.from('pompistes').select('id').eq('auth_user_id', _userId).maybeSingle();
        if (pimp.data) return 'pompiste';
        const chef = await supabase.from('brigade_chefs').select('id').eq('auth_user_id', _userId).maybeSingle();
        if (chef.data) return 'chef_brigade';
        const ger = await supabase.from('gerants').select('id').eq('auth_user_id', _userId).maybeSingle();
        if (ger.data) return 'gerant';
        const mag = await supabase.from('magasin_workers').select('id').eq('auth_user_id', _userId).maybeSingle();
        if (mag.data) return 'magasin';
      } catch (e) {
        console.error('[useAuth] fallback worker lookup failed:', e);
      }
      return 'pompiste';
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    let safetyTimeout: NodeJS.Timeout | null = null;
    let initComplete = false;

    async function initAuth() {
      try {
        // Step 1: Try to get session from Supabase (with 3s timeout)
        const getSessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout')), 3000)
        );

        let session: Session | null = null;
        try {
          const { data: { session: sess }, error: sessionError } = await Promise.race([
            getSessionPromise,
            timeoutPromise,
          ]);

          if (sessionError) {
            console.error('[useAuth] getSession error:', sessionError.message);
          }
          session = sess;
        } catch (err) {
          console.warn('[useAuth] Session fetch timed out or failed:', err);
        }

        if (!mountedRef.current) return;

        // Step 2: If we have a session, immediately show authenticated state
        // and fetch profile in background
        if (session?.user) {
          // Keep isLoading true until role resolves — prevents admin sidebar flash for workers
          setAuth({
            session,
            user:            session.user,
            userRole:        'admin',
            userId:          session.user.id,
            isLoading:       true,
            isAuthenticated: true,
          });

          // Step 3: Fetch role in background, then release loader
          profileFetchRef.current = fetchRole(session.user.id).then((role) => {
            if (mountedRef.current) {
              setAuth(prev => ({ ...prev, userRole: role, isLoading: false }));
            }
          }).catch(() => {
            if (mountedRef.current) {
              setAuth(prev => ({ ...prev, isLoading: false }));
            }
          });
        } else {
          // No session — go to login immediately
          setAuth({
            session:         null,
            user:            null,
            userRole:        'admin',
            userId:          undefined,
            isLoading:       false,
            isAuthenticated: false,
          });
        }
      } catch (err) {
        console.error('[useAuth] Unexpected auth error:', err);
        if (mountedRef.current) {
          setAuth(prev => ({ ...prev, isLoading: false }));
        }
      } finally {
        initComplete = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);
      }
    }

    // Safety timeout: force clear loading if init takes too long
    safetyTimeout = setTimeout(() => {
      if (mountedRef.current && !initComplete) {
        console.warn('[useAuth] Safety timeout — forcing loading state clear');
        setAuth(prev => ({ ...prev, isLoading: false }));
      }
    }, 3000);

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;

        if (event === 'SIGNED_IN' && session?.user) {
          // IMPORTANT: Supabase's client (@supabase/auth-js) re-emits a
          // 'SIGNED_IN' event every time the browser tab/app regains
          // visibility/focus (switching apps, unlocking the phone,
          // switching browser tabs, etc.) — even though the user never
          // logged out and nothing actually changed. This is documented
          // internal behaviour of the client's tab-visibility recovery
          // logic and cannot be turned off via configuration.
          //
          // Previously we treated every 'SIGNED_IN' event the same as a
          // brand-new login: isLoading was flipped to true (which swaps
          // the entire app for <AppLoader />, see App.tsx) and the user's
          // role was re-fetched from the database. That is exactly what
          // produced the "app auto-refreshes every time I leave and come
          // back" bug.
          //
          // Fix: if we're already authenticated as this same user, this is
          // just Supabase confirming the existing session is still valid —
          // quietly update the session/user reference and do nothing else
          // (no loading screen, no re-fetch). Only run the full "new login"
          // flow when the user actually changes (or we weren't
          // authenticated yet).
          const alreadySignedInAsThisUser =
            authRef.current.isAuthenticated && authRef.current.userId === session.user.id;

          if (alreadySignedInAsThisUser) {
            // Same token → return the previous state object unchanged so React
            // bails out of the update and nothing re-renders at all.
            setAuth(prev =>
              prev.session?.access_token === session.access_token
                ? prev
                : { ...prev, session, user: session.user }
            );
            return;
          }

          // Keep isLoading true until role resolves
          setAuth({
            session,
            user:            session.user,
            userRole:        'admin',
            userId:          session.user.id,
            isLoading:       true,
            isAuthenticated: true,
          });

          profileFetchRef.current = fetchRole(session.user.id).then((role) => {
            if (mountedRef.current) {
              setAuth(prev => ({ ...prev, userRole: role, isLoading: false }));
            }
          }).catch(() => {
            if (mountedRef.current) {
              setAuth(prev => ({ ...prev, isLoading: false }));
            }
          });
        } else if (event === 'SIGNED_OUT') {
          if (mountedRef.current) {
            setAuth({
              session:         null,
              user:            null,
              userRole:        'admin',
              userId:          undefined,
              isLoading:       false,
              isAuthenticated: false,
            });
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Do nothing on token refresh. This event is emitted whenever
          // Supabase silently rotates or revalidates the JWT, including on
          // tab/app focus, and it does not mean the user signed in again.
          return;
        }
      }
    );

    return () => {
      mountedRef.current = false;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return { ...auth, setManualAuth, logout };
}

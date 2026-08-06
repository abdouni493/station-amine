# StationPro — Session Fixes Summary

> **Date:** 2026-06-13 / 2026-06-14  
> **Branch:** `main`  
> **Commits:** `9211caa` → `418dd18`

---

## Overview

This session fixed the entire worker permissions and authentication system across 5 source files and the Supabase database. Workers were showing the admin sidebar, wrong role badges, and being redirected away from permitted pages.

---

## Part 1 — Worker Permissions System (5 bugs)

### Bug 1 — `chef_brigade` sidebar ignored permissions entirely

**File:** `src/components/Sidebar.tsx`

**Problem:** The `getNavGroups()` function had a bare `return CHEF_BRIGADE_NAV` for the `chef_brigade` case — it always returned the full static nav with no permission filtering, unlike `pompiste` and `magasin` which already filtered correctly.

**Fix:** Replaced with the same `.filter()` pattern used by other roles:

```typescript
case 'chef_brigade': {
  if (!permissions) return CHEF_BRIGADE_NAV;
  return CHEF_BRIGADE_NAV
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!item.moduleId) return true;
        const perm = permissions[item.moduleId];
        return perm ? perm.voir : false;
      })
    }))
    .filter(group => group.items.length > 0);
}
```

---

### Bug 2 — `chef_brigade` permissions never loaded into `userPermissions`

**File:** `src/components/Sidebar.tsx`

**Problem:** The `userPermissions` useMemo had branches for `gerant`, `magasin`, and `pompiste`, but `chef_brigade` fell through and returned `undefined` — so even after Bug 1 was fixed, permissions would always be undefined.

**Fix:** Added the missing branch and `brigadeChefs` dependency:

```typescript
const userPermissions = useMemo(() => {
  if (!userId) return undefined;
  if (userRole === 'gerant') {
    const g = (gerants || []).find(g => g.id === userId);
    return g?.permissions;
  }
  if (userRole === 'magasin') {
    const m = (magasinWorkers || []).find(m => m.id === userId);
    return m?.permissions;
  }
  if (userRole === 'pompiste') {
    const p = (pompistes || []).find(p => p.id === userId);
    return p?.permissions;
  }
  if (userRole === 'chef_brigade') {
    const c = (brigadeChefs || []).find(c => c.id === userId);
    return c?.permissions;
  }
  return undefined;
}, [userRole, userId, gerants, magasinWorkers, pompistes, brigadeChefs]);
```

**Bonus fix:** The gérant nav had `moduleId: "Rapports"` on the `/daily-report` item — changed to `"Fiche Journalière"` to match `permissionDefaults.ts`.

---

### Bug 3 — Module ID mismatches between `ProtectedRoute` and `permissionDefaults.ts`

**File:** `src/App.tsx`

**Problem:** The `moduleId` props on `ProtectedRoute` and the `ROUTE_TO_MODULE` map used labels that didn't match the keys stored in the `permissions` JSONB column in the database.

**Fix — `ROUTE_TO_MODULE` map:**

| Route | Wrong ID (before) | Correct ID (after) |
|---|---|---|
| `/planning` | `"Planning"` | `"Brigades"` |

All other entries were already correct in the map.

**Fix — `ProtectedRoute` `moduleId` props:**

| Route | Wrong ID (before) | Correct ID (after) |
|---|---|---|
| `/planning` | `"Planning"` | `"Brigades"` |
| `/fuel-purchases` | `"Achats Carburant"` | `"Livraisons"` |
| `/shop-pos` | `"Ventes Magasin"` | `"Magasin"` |
| `/pompistes` | `"Gestion Pompistes"` | `"Pompistes"` |
| `/brigade-chefs` | `"Gestion Chefs Brigade"` | `"Chefs de Brigade"` |
| `/gerants` | `"Gestion Gérants"` | `"Gérants"` |
| `/magasin-workers` | `"Gestion Magasin"` | `"Employés Magasin"` |
| `/roles-permissions` | `"Permissions"` | `"Paramètres"` |
| `/daily-report` | `"Rapport Quotidien"` | `"Fiche Journalière"` |

---

### Bug 4 — `ProtectedRoute` race condition (redirects before data loads)

**File:** `src/App.tsx`

**Problem:** When a worker navigated to a protected route, their worker row hadn't loaded from Supabase yet. `worker` was `undefined`, the permission check failed, and the user was immediately redirected to `/dashboard` — even if they had permission.

**Fix:** Hold rendering with `<></>` while loading or while the worker row is absent:

```typescript
function ProtectedRoute({ element, moduleId }: ProtectedRouteProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const state = useAppState();
  const dispatch = useAppDispatch();

  const resolvedModuleId = moduleId || ROUTE_TO_MODULE[location.pathname];

  // Admin always has access
  if (state.currentUserRole === 'admin') return element;

  // Still hydrating — don't redirect yet
  if (state.isLoading) return <></>;

  if (resolvedModuleId) {
    const uid = state.currentUserId;
    const worker = (state.pompistes || []).find(w => w.id === uid)
      || (state.brigadeChefs || []).find(w => w.id === uid)
      || (state.gerants || []).find(w => w.id === uid)
      || (state.magasinWorkers || []).find(w => w.id === uid);

    // Worker row not yet loaded — wait
    if (!worker) return <></>;

    if (worker.permissions?.[resolvedModuleId]?.voir) return element;

    // Permission denied — redirect
    dispatch({ type: 'ADD_TOAST', payload: {
      type: 'error', title: 'Accès refusé',
      message: `Vous n'avez pas accès au module "${resolvedModuleId}".`, duration: 3,
    }});
    navigate('/dashboard', { replace: true });
    return <Navigate to="/dashboard" replace />;
  }

  return element;
}
```

---

### Bug 5 — Admin sidebar flash for workers on page load

**File:** `src/hooks/useAuth.ts`

**Problem:** When a session was found on page load, `isLoading` was immediately set to `false` with `userRole: 'admin'` as a placeholder while `fetchRole` ran in the background. Workers saw the admin sidebar for a split second (or longer if `fetchRole` was slow).

**Fix:** Keep `isLoading: true` until `fetchRole` resolves. Applied to both `initAuth` and the `SIGNED_IN` handler in `onAuthStateChange`:

```typescript
// In initAuth and onAuthStateChange SIGNED_IN:
if (session?.user) {
  setAuth({
    session,
    user: session.user,
    userRole: 'admin',
    userId: session.user.id,
    isLoading: true,          // ← stay loading until role is known
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
}
```

---

## Part 2 — Worker Login Shows Admin Role

### Problem

After logging in as a worker, the sidebar still showed "Administrateur" and all admin menus. The `get_my_role` RPC was returning `'admin'` as its default fallback for any user it couldn't identify. Since the code trusted this value blindly, every worker appeared as admin.

Additionally, `fetchRole` had `?? 'admin'` as the null-coalescing fallback — so even when the RPC returned null correctly, the code defaulted to admin.

### Fix 1 — Remove `?? 'admin'` default, add direct table fallback

**File:** `src/hooks/useAuth.ts`

Changed the success path of `fetchRole` to run the same direct-table fallback that the error path already had:

```typescript
// Before (bug):
return (data as UserRole | null) ?? 'admin';

// After (fix):
let resolved = data as UserRole | null;

if (resolved === 'admin') {
  // Verify the 'admin' claim — confirm user is in admin_profiles
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
```

### Fix 2 — Same verification in `signIn`

**File:** `src/lib/supabase.ts`

```typescript
const { data: roleRow } = await supabase.rpc('get_my_role');
let role = roleRow as string | null;

// If RPC claims 'admin', verify user is actually in admin_profiles
if (role === 'admin') {
  const { data: ap } = await supabase.from('admin_profiles').select('id').eq('id', uid).maybeSingle();
  if (!ap) role = null; // not actually an admin — fall through to worker lookup
}

if (!role) {
  const { data: ap } = await supabase.from('admin_profiles').select('role').eq('id', uid).maybeSingle();
  if (ap?.role) {
    role = ap.role;
  } else {
    const pimp = await supabase.from('pompistes').select('id').eq('auth_user_id', uid).maybeSingle();
    if (pimp.data) role = 'pompiste';
    else {
      const chef = await supabase.from('brigade_chefs').select('id').eq('auth_user_id', uid).maybeSingle();
      if (chef.data) role = 'chef_brigade';
      else {
        const ger = await supabase.from('gerants').select('id').eq('auth_user_id', uid).maybeSingle();
        if (ger.data) role = 'gerant';
        else {
          const mag = await supabase.from('magasin_workers').select('id').eq('auth_user_id', uid).maybeSingle();
          if (mag.data) role = 'magasin';
        }
      }
    }
  }
}
```

---

## Part 3 — Remove `@workers.station.local` Email Convention

### Problem

Worker accounts were created in `auth.users` using the fake email format `username@workers.station.local`. Workers couldn't log in with their real email. The login page accepted both email and username.

### Fix

**File:** `src/lib/supabase.ts` — `signIn` function:

```typescript
// Before:
const email = id.includes('@') ? id : `${id}@workers.station.local`;

// After:
const email = identifier.trim().toLowerCase(); // always use the real email
```

**File:** `src/pages/Login.tsx` — updated label and input type:

```tsx
// Before:
<label>Email ou identifiant</label>
<input type="text" placeholder="admin@stationpro.dz ou nom_utilisateur" />

// After:
<label>Adresse Email</label>
<input type="email" placeholder="email@exemple.dz" />
```

---

## Part 4 — Worker Account Creation Errors

### Error 1: `function gen_salt(unknown) does not exist`

**Cause:** `pgcrypto` functions (`crypt`, `gen_salt`) live in the `extensions` schema in Supabase, not in `public`. The RPC's `search_path` didn't include `extensions`.

**Fix (SQL):** Add `extensions` to the function's `SET search_path`:

```sql
SET search_path = public, auth, extensions
```

### Error 2: `400 Bad Request` on login after account creation

**Cause:** The manual `INSERT INTO auth.users` was missing the `aud` column. Supabase's GoTrue requires `aud = 'authenticated'` to recognise a valid login account.

**Fix (SQL):** Added `aud = 'authenticated'` to the INSERT:

```sql
INSERT INTO auth.users (
  id, instance_id, aud, role,   -- aud added here
  email, encrypted_password, ...
) VALUES (
  v_auth_uid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',   -- aud
  'authenticated',   -- role
  ...
);
```

---

## SQL Functions to Run in Supabase

Run all of these in **Supabase → SQL Editor** in order.

---

### 1. Enable pgcrypto

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
```

---

### 2. `get_my_role` — returns the correct role for any user

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.admin_profiles WHERE id = v_uid;
  IF v_role IS NOT NULL THEN RETURN v_role; END IF;

  IF EXISTS (SELECT 1 FROM public.pompistes      WHERE auth_user_id = v_uid) THEN RETURN 'pompiste';     END IF;
  IF EXISTS (SELECT 1 FROM public.brigade_chefs  WHERE auth_user_id = v_uid) THEN RETURN 'chef_brigade'; END IF;
  IF EXISTS (SELECT 1 FROM public.gerants         WHERE auth_user_id = v_uid) THEN RETURN 'gerant';       END IF;
  IF EXISTS (SELECT 1 FROM public.magasin_workers WHERE auth_user_id = v_uid) THEN RETURN 'magasin';      END IF;

  RETURN NULL; -- never default to 'admin'
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
```

---

### 3. `get_my_worker` — returns the worker's full row as JSON

```sql
CREATE OR REPLACE FUNCTION public.get_my_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_row FROM public.pompistes       p WHERE auth_user_id = v_uid;
  IF v_row IS NOT NULL THEN RETURN v_row; END IF;

  SELECT to_jsonb(c) INTO v_row FROM public.brigade_chefs   c WHERE auth_user_id = v_uid;
  IF v_row IS NOT NULL THEN RETURN v_row; END IF;

  SELECT to_jsonb(g) INTO v_row FROM public.gerants         g WHERE auth_user_id = v_uid;
  IF v_row IS NOT NULL THEN RETURN v_row; END IF;

  SELECT to_jsonb(m) INTO v_row FROM public.magasin_workers m WHERE auth_user_id = v_uid;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_worker() TO authenticated;
```

---

### 4. `provision_worker_account` — create / update / delete worker auth accounts

> Uses the worker's **real email** (not `@workers.station.local`).  
> Includes `aud = 'authenticated'` and `extensions` in `search_path`.

```sql
CREATE OR REPLACE FUNCTION public.provision_worker_account(
  p_action      text,
  p_worker_type text,
  p_worker_id   uuid,
  p_username    text DEFAULT NULL,
  p_password    text DEFAULT NULL,
  p_name        text DEFAULT NULL,
  p_email       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_uid uuid;
  v_email    text;
BEGIN
  v_email := lower(trim(p_email));

  IF p_action = 'create' THEN
    IF v_email IS NULL OR v_email = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Email requis pour créer un compte');
    END IF;

    -- Reuse existing auth user if email already registered
    SELECT id INTO v_auth_uid FROM auth.users WHERE email = v_email;

    IF v_auth_uid IS NULL THEN
      v_auth_uid := gen_random_uuid();

      INSERT INTO auth.users (
        id, instance_id, aud, role,
        email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at,
        confirmation_token, recovery_token,
        email_change, email_change_token_new, email_change_token_current
      ) VALUES (
        v_auth_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_email,
        crypt(p_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', p_name, 'worker_type', p_worker_type, 'worker_id', p_worker_id),
        false,
        now(), now(),
        '', '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data,
        created_at, updated_at, last_sign_in_at
      ) VALUES (
        gen_random_uuid(), v_auth_uid, v_email, 'email',
        jsonb_build_object('sub', v_auth_uid::text, 'email', v_email),
        now(), now(), now()
      );
    END IF;

    IF    p_worker_type = 'pompiste'     THEN UPDATE public.pompistes      SET auth_user_id = v_auth_uid, has_access = true WHERE id = p_worker_id;
    ELSIF p_worker_type = 'chef_brigade' THEN UPDATE public.brigade_chefs  SET auth_user_id = v_auth_uid, has_access = true WHERE id = p_worker_id;
    ELSIF p_worker_type = 'gerant'       THEN UPDATE public.gerants         SET auth_user_id = v_auth_uid, has_access = true WHERE id = p_worker_id;
    ELSIF p_worker_type = 'magasin'      THEN UPDATE public.magasin_workers SET auth_user_id = v_auth_uid, has_access = true WHERE id = p_worker_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'auth_user_id', v_auth_uid);

  ELSIF p_action = 'update_password' THEN
    IF    p_worker_type = 'pompiste'     THEN SELECT auth_user_id INTO v_auth_uid FROM public.pompistes      WHERE id = p_worker_id;
    ELSIF p_worker_type = 'chef_brigade' THEN SELECT auth_user_id INTO v_auth_uid FROM public.brigade_chefs  WHERE id = p_worker_id;
    ELSIF p_worker_type = 'gerant'       THEN SELECT auth_user_id INTO v_auth_uid FROM public.gerants         WHERE id = p_worker_id;
    ELSIF p_worker_type = 'magasin'      THEN SELECT auth_user_id INTO v_auth_uid FROM public.magasin_workers WHERE id = p_worker_id;
    END IF;

    IF v_auth_uid IS NOT NULL THEN
      UPDATE auth.users
      SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
      WHERE id = v_auth_uid;
    END IF;

    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'delete' THEN
    IF    p_worker_type = 'pompiste'     THEN SELECT auth_user_id INTO v_auth_uid FROM public.pompistes      WHERE id = p_worker_id; UPDATE public.pompistes      SET auth_user_id = NULL, has_access = false WHERE id = p_worker_id;
    ELSIF p_worker_type = 'chef_brigade' THEN SELECT auth_user_id INTO v_auth_uid FROM public.brigade_chefs  WHERE id = p_worker_id; UPDATE public.brigade_chefs  SET auth_user_id = NULL, has_access = false WHERE id = p_worker_id;
    ELSIF p_worker_type = 'gerant'       THEN SELECT auth_user_id INTO v_auth_uid FROM public.gerants         WHERE id = p_worker_id; UPDATE public.gerants         SET auth_user_id = NULL, has_access = false WHERE id = p_worker_id;
    ELSIF p_worker_type = 'magasin'      THEN SELECT auth_user_id INTO v_auth_uid FROM public.magasin_workers WHERE id = p_worker_id; UPDATE public.magasin_workers SET auth_user_id = NULL, has_access = false WHERE id = p_worker_id;
    END IF;

    IF v_auth_uid IS NOT NULL THEN
      DELETE FROM auth.identities WHERE user_id = v_auth_uid;
      DELETE FROM auth.users WHERE id = v_auth_uid;
    END IF;

    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Action inconnue: ' || p_action);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_worker_account(text,text,uuid,text,text,text,text) TO authenticated;
```

---

### 5. Fix existing accounts missing `aud`

Run this to repair accounts created before the `aud` fix:

```sql
UPDATE auth.users
SET aud = 'authenticated'
WHERE (aud IS NULL OR aud = '')
  AND id IN (
    SELECT auth_user_id FROM public.pompistes      WHERE auth_user_id IS NOT NULL
    UNION
    SELECT auth_user_id FROM public.brigade_chefs  WHERE auth_user_id IS NOT NULL
    UNION
    SELECT auth_user_id FROM public.gerants         WHERE auth_user_id IS NOT NULL
    UNION
    SELECT auth_user_id FROM public.magasin_workers WHERE auth_user_id IS NOT NULL
  );
```

---

### 6. Migrate old `@workers.station.local` emails to real emails

Run if any workers were created before the email convention was removed:

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.auth_user_id, p.email AS real_email FROM public.pompistes p
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE u.email LIKE '%@workers.station.local' AND p.email IS NOT NULL AND p.email <> ''
  LOOP
    UPDATE auth.users SET email = r.real_email, updated_at = now() WHERE id = r.auth_user_id;
    UPDATE auth.identities SET provider_id = r.real_email,
      identity_data = identity_data || jsonb_build_object('email', r.real_email), updated_at = now()
    WHERE user_id = r.auth_user_id AND provider = 'email';
  END LOOP;

  FOR r IN SELECT c.auth_user_id, c.email AS real_email FROM public.brigade_chefs c
    JOIN auth.users u ON u.id = c.auth_user_id
    WHERE u.email LIKE '%@workers.station.local' AND c.email IS NOT NULL AND c.email <> ''
  LOOP
    UPDATE auth.users SET email = r.real_email, updated_at = now() WHERE id = r.auth_user_id;
    UPDATE auth.identities SET provider_id = r.real_email,
      identity_data = identity_data || jsonb_build_object('email', r.real_email), updated_at = now()
    WHERE user_id = r.auth_user_id AND provider = 'email';
  END LOOP;

  FOR r IN SELECT g.auth_user_id, g.email AS real_email FROM public.gerants g
    JOIN auth.users u ON u.id = g.auth_user_id
    WHERE u.email LIKE '%@workers.station.local' AND g.email IS NOT NULL AND g.email <> ''
  LOOP
    UPDATE auth.users SET email = r.real_email, updated_at = now() WHERE id = r.auth_user_id;
    UPDATE auth.identities SET provider_id = r.real_email,
      identity_data = identity_data || jsonb_build_object('email', r.real_email), updated_at = now()
    WHERE user_id = r.auth_user_id AND provider = 'email';
  END LOOP;

  FOR r IN SELECT m.auth_user_id, m.email AS real_email FROM public.magasin_workers m
    JOIN auth.users u ON u.id = m.auth_user_id
    WHERE u.email LIKE '%@workers.station.local' AND m.email IS NOT NULL AND m.email <> ''
  LOOP
    UPDATE auth.users SET email = r.real_email, updated_at = now() WHERE id = r.auth_user_id;
    UPDATE auth.identities SET provider_id = r.real_email,
      identity_data = identity_data || jsonb_build_object('email', r.real_email), updated_at = now()
    WHERE user_id = r.auth_user_id AND provider = 'email';
  END LOOP;
END $$;
```

---

### 7. Link workers to their auth accounts (if `auth_user_id` is null)

```sql
UPDATE public.pompistes p SET auth_user_id = u.id
FROM auth.users u
WHERE p.auth_user_id IS NULL AND p.email IS NOT NULL
  AND u.email = lower(trim(p.email));

UPDATE public.brigade_chefs c SET auth_user_id = u.id
FROM auth.users u
WHERE c.auth_user_id IS NULL AND c.email IS NOT NULL
  AND u.email = lower(trim(c.email));

UPDATE public.gerants g SET auth_user_id = u.id
FROM auth.users u
WHERE g.auth_user_id IS NULL AND g.email IS NOT NULL
  AND u.email = lower(trim(g.email));

UPDATE public.magasin_workers m SET auth_user_id = u.id
FROM auth.users u
WHERE m.auth_user_id IS NULL AND m.email IS NOT NULL
  AND u.email = lower(trim(m.email));
```

---

### 8. Diagnostic — check which workers have a linked auth account

```sql
SELECT 'pompiste' AS type, name, email, username, has_access,
       auth_user_id, (auth_user_id IS NOT NULL) AS is_linked
FROM public.pompistes
UNION ALL
SELECT 'chef_brigade', name, email, username, has_access, auth_user_id, (auth_user_id IS NOT NULL)
FROM public.brigade_chefs
UNION ALL
SELECT 'gerant', name, email, username, has_access, auth_user_id, (auth_user_id IS NOT NULL)
FROM public.gerants
UNION ALL
SELECT 'magasin', name, email, username, has_access, auth_user_id, (auth_user_id IS NOT NULL)
FROM public.magasin_workers
ORDER BY type, name;
```

---

## Files Changed

| File | Changes |
|---|---|
| `src/components/Sidebar.tsx` | chef_brigade permission filtering (Bug 1 & 2), gérant daily-report moduleId |
| `src/App.tsx` | ROUTE_TO_MODULE fix, 9 ProtectedRoute moduleId fixes, race condition fix (Bug 3 & 4) |
| `src/hooks/useAuth.ts` | isLoading held until role resolved (Bug 5), admin claim verification, null fallback |
| `src/lib/supabase.ts` | Remove @workers.station.local, admin claim verification, null fallback |
| `src/pages/Login.tsx` | Email-only login label and input type |

## Commits

| Hash | Description |
|---|---|
| `9211caa` | fix: worker permissions system — sidebar filtering, module ID mismatches, race condition, admin flash |
| `6550ae7` | fix: worker login shows admin role — remove ?? 'admin' fallback, query worker tables directly |
| `3ac407e` | fix: remove @workers.station.local email convention — workers use real email to login |
| `418dd18` | fix: workers shown as Administrateur — verify admin claim against admin_profiles |

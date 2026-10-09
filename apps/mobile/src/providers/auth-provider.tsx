import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = { session: Session | null; isLoading: boolean };

const AuthContext = createContext<AuthState>({ session: null, isLoading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, isLoading: true });
  const queryClient = useQueryClient();
  const userId = useRef<string | null>(null);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION first, so no separate getSession call is needed.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      // Some cached queries (search, food, entry) are not keyed by user; never let
      // one account's private foods or entries show up for the next one.
      if (nextUserId !== userId.current) queryClient.clear();
      userId.current = nextUserId;
      setState({ session, isLoading: false });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return use(AuthContext);
}

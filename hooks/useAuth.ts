import { useState, useCallback } from 'react';
import type { AppUser, AuthState } from '../types';

const STORAGE_KEY = 'abap_auth';

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { user: null, token: null };
  } catch {
    return { user: null, token: null };
  }
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  const login = useCallback((token: string, user: AppUser) => {
    const state: AuthState = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setAuth(state);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('abap_firstLogin');
    setAuth({ user: null, token: null });
  }, []);

  return { auth, login, logout };
}

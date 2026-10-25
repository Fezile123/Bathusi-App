import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

const INACTIVITY_MS = 5 * 60 * 1000;

type SecurityState = {
  /** True while the app should look like a plain cycle tracker. */
  isCamouflaged: boolean;
  isAuthenticated: boolean;
  unlock: () => void;
  lock: () => void;
  /** Call on user activity inside the vault to extend the session. */
  touch: () => void;
  /** Keep the vault unlocked while a screen is open that can briefly steal focus (password manager pop-ups, email app). Returns a release function. */
  holdLock: () => () => void;
  /** Run an action (camera, mic permission dialogs) without auto-locking when the app briefly leaves the foreground. */
  withLockSuspended: <T>(fn: () => Promise<T>) => Promise<T>;
};

const Ctx = createContext<SecurityState | null>(null);

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuth] = useState(false);
  const [activity, setActivity] = useState(0);
  const suspended = useRef(false);
  const holds = useRef(0);

  const lock = useCallback(() => setAuth(false), []);
  const unlock = useCallback(() => {
    setAuth(true);
    setActivity((n) => n + 1);
  }, []);
  const touch = useCallback(() => setActivity((n) => n + 1), []);

  const holdLock = useCallback(() => {
    holds.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // small delay: AppState "active" can arrive just after the pop-up closes
      setTimeout(() => { holds.current = Math.max(0, holds.current - 1); }, 800);
    };
  }, []);

  const withLockSuspended = useCallback(async function <T>(fn: () => Promise<T>): Promise<T> {
    suspended.current = true;
    try {
      return await fn();
    } finally {
      // small delay: AppState "active" can arrive just after the picker closes
      setTimeout(() => {
        suspended.current = false;
      }, 800);
    }
  }, []);

  // Lock whenever the app leaves the foreground (unless we deliberately suspended it).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !suspended.current && holds.current === 0) setAuth(false);
    });
    return () => sub.remove();
  }, []);

  // Lock after inactivity.
  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setTimeout(() => setAuth(false), INACTIVITY_MS);
    return () => clearTimeout(t);
  }, [isAuthenticated, activity]);

  const value = useMemo<SecurityState>(
    () => ({ isCamouflaged: !isAuthenticated, isAuthenticated, unlock, lock, touch, holdLock, withLockSuspended }),
    [isAuthenticated, unlock, lock, touch, holdLock, withLockSuspended],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSecurity(): SecurityState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSecurity must be used inside <SecurityProvider>');
  return v;
}

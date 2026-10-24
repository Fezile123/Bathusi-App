import { useCallback, useEffect, useRef } from 'react';

/** Calls onOpen after the finger has been held for `ms`. Releasing early cancels. */
export function useLongPressGate(ms: number, onOpen: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onOpen);
  cb.current = onOpen;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPressIn = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      cb.current();
    }, ms);
  }, [ms, clear]);

  useEffect(() => clear, [clear]);

  return { onPressIn, onPressOut: clear };
}

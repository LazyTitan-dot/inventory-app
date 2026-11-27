import { useMemo, useRef, useState } from 'react';
import { initialSession, reduceSession, makeSessionPort } from './session-model';
import type { Session, SessionPort } from './session-model';
export type SessionBridge = SessionPort & { subscribe: (fn: () => void) => () => void };
export function useStoreSession(seed?: Session) {
  const [state, setState] = useState(() => seed ?? initialSession());
  const current = useRef(state);
  const listeners = useRef(new Set<() => void>());
  const bridge = useMemo(
    () => ({
      ...makeSessionPort(
        () => current.current,
        (a) => {
          const next = reduceSession(current.current, a);
          if (next !== current.current) {
            current.current = next;
            setState(next);
            listeners.current.forEach((fn) => fn());
          }
        },
      ),
      subscribe: (fn: () => void) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
    }),
    [],
  );
  return { state, bridge };
}

"use client";

import { useEffect, useRef, useState } from "react";

export const MOA_PRESENCE_EXIT_MS = 260;

export function useMoaPresence(open: boolean, durationMs = MOA_PRESENCE_EXIT_MS) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (open) {
      setShouldRender(true);
      setIsExiting(false);
      return;
    }

    if (!shouldRender) {
      setIsExiting(false);
      return;
    }

    setIsExiting(true);
    timerRef.current = setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
      timerRef.current = null;
    }, durationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [durationMs, open, shouldRender]);

  return { isExiting, shouldRender };
}

export function useMoaPresenceValue<T>(value: T | null | undefined, durationMs = MOA_PRESENCE_EXIT_MS) {
  const [presentValue, setPresentValue] = useState<T | null>(value ?? null);
  const presence = useMoaPresence(value != null, durationMs);

  useEffect(() => {
    if (value != null) {
      setPresentValue(value);
      return;
    }

    if (!presence.shouldRender) {
      setPresentValue(null);
    }
  }, [presence.shouldRender, value]);

  return { ...presence, presentValue };
}

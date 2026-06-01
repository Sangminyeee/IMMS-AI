"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

interface MoaRouteTransitionLinkProps {
  children: ReactNode;
  className?: string;
  durationMs?: number;
  href: string;
  prefetch?: boolean;
  title?: string;
  "aria-label"?: string;
}

export function useMoaRouteTransition({ durationMs = 340, href }: { durationMs?: number; href: string }) {
  const router = useRouter();
  const timeoutRef = useRef<number | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const startRouteTransition = useCallback(() => {
    if (exiting) return;

    const navigate = () => {
      startTransition(() => {
        router.push(href);
      });
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      navigate();
      return;
    }

    setExiting(true);
    timeoutRef.current = window.setTimeout(() => {
      const transitionDocument = document as ViewTransitionDocument;
      if (transitionDocument.startViewTransition) {
        transitionDocument.startViewTransition(navigate);
        return;
      }
      navigate();
    }, durationMs);
  }, [durationMs, exiting, href, router]);

  return { exiting, startRouteTransition };
}

export function MoaRouteTransitionLink({
  children,
  className,
  durationMs = 340,
  href,
  prefetch,
  title,
  "aria-label": ariaLabel,
}: MoaRouteTransitionLinkProps) {
  const routeTransition = useMoaRouteTransition({ durationMs, href });

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      routeTransition.exiting
    ) return;

    event.preventDefault();
    routeTransition.startRouteTransition();
  };

  return (
    <>
      <Link aria-label={ariaLabel} className={className} href={href} onClick={handleClick} prefetch={prefetch} title={title}>
        {children}
      </Link>
      {routeTransition.exiting ? <div aria-hidden="true" className="moa-route-exit-overlay fixed inset-0 z-[9999] pointer-events-none" /> : null}
    </>
  );
}

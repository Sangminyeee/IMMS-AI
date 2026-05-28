"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import type { MouseEvent, ReactNode } from "react";

interface AuthTransitionLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

export function AuthTransitionLink({ children, className, href }: AuthTransitionLinkProps) {
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();

    const navigate = () => {
      startTransition(() => {
        router.push(href);
      });
    };
    const transitionDocument = document as ViewTransitionDocument;

    if (!transitionDocument.startViewTransition) {
      navigate();
      return;
    }

    transitionDocument.startViewTransition(navigate);
  };

  return (
    <Link className={className} href={href} onClick={handleClick}>
      {children}
    </Link>
  );
}

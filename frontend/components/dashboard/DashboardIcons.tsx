interface DashboardIconProps {
  className?: string;
}

export function GridIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function FileIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M7 4h7l4 4v12H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 4v5h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function ArchiveIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16v13H4zM3 4h18v3H3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 11h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13.3c.1-.4.1-.8.1-1.3s0-.9-.1-1.3l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14.5 3h-5l-.3 2.5A7 7 0 0 0 7 6.8l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.6l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3l.3 2.5h5l.3-2.5a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BellIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M6.7 10.4c0-3.1 2.1-5.6 5.3-5.6s5.3 2.5 5.3 5.6v3.1l1.7 2.8H5l1.7-2.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18.2a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m17 17 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function PlusIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: DashboardIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

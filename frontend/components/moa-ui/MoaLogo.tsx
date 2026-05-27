import { classNames } from "@/lib/classNames";

interface MoaLogoProps {
  className?: string;
  markClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "white";
}

const sizeClasses = {
  sm: "gap-2 text-base",
  md: "gap-2.5 text-xl",
  lg: "gap-3 text-2xl",
};

const markSizeClasses = {
  sm: "h-[22px] w-[36px]",
  md: "h-[33px] w-[54px]",
  lg: "h-[40px] w-[65px]",
};

export function MoaLogo({ className, markClassName, showText = true, size = "md", variant = "brand" }: MoaLogoProps) {
  return (
    <div
      className={classNames(
        "inline-flex items-center font-bold tracking-[-0.03em]",
        variant === "white" ? "text-white" : "text-[var(--moa-logo-text)]",
        sizeClasses[size],
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 54 33"
        className={classNames(
          "shrink-0",
          variant === "white" ? "text-white" : "text-[var(--moa-logo-mark)]",
          markSizeClasses[size],
          markClassName,
        )}
        fill="none"
      >
        <path
          d="M6.00601 0.0457849C6.50145 0.0226528 6.96888 0.00341847 7.46491 0.0326514C8.64375 0.0967943 9.78102 0.491903 10.7475 1.17307C11.8855 1.97685 14.979 5.50785 16.0432 6.7141C18.1195 9.0674 20.4466 11.4069 22.5089 13.7309C22.4468 12.7451 22.482 11.2405 22.4843 10.2118C22.4898 7.75996 22.2182 4.70288 23.8482 2.67929C25.097 1.19807 26.4962 0.248805 28.4242 0.0512927C32.028 -0.318059 33.4746 1.3461 35.7399 3.79344C36.957 5.09909 38.1561 6.42169 39.3368 7.76073C41.7709 10.4925 44.4057 13.1204 46.7724 15.9103C49.1744 18.7418 52.7721 20.7495 53.1724 24.7404C53.8335 31.3398 45.7639 35.2023 41.2628 30.1445C38.5272 27.0705 35.6468 24.0644 32.896 21.0035L30.5949 18.4623C29.9849 17.7772 29.308 16.9444 28.6185 16.359C27.8633 15.6963 27.2348 14.4209 26.0633 15.5949C24.5745 17.0866 27.9217 18.8988 28.6195 20.0276C28.874 20.4392 29.5527 20.9206 29.872 21.4708C33.7947 28.2302 26.2031 35.6969 19.7484 30.9618C18.6247 30.1376 17.928 29.0385 16.9335 28.0815C13.162 23.8939 9.41436 19.6775 5.54051 15.5851C4.67167 14.4154 2.84897 15.9333 3.52133 16.9557C4.74908 18.8227 6.84703 20.645 8.29648 22.3809C9.21011 23.4751 10.3077 24.3875 11.0221 25.5483C11.334 26.044 11.533 26.6028 11.6048 27.1848C11.7611 28.4139 11.4871 29.4201 10.7483 30.4298C7.43666 34.9557 0.62082 31.2436 0.115855 26.473C-0.0350102 25.0477 0.00437387 23.5459 0.00530149 22.0745V15.5202L0.00732429 9.65315C0.0085049 8.44766 -0.0424309 7.00957 0.132974 5.82627C0.566933 2.89866 3.06292 0.404714 6.00601 0.0457849Z"
          fill={variant === "white" ? "currentColor" : "url(#moa-logo-gradient-main)"}
        />
        <circle cx="49.4121" cy="3.80076" r="3.80076" fill={variant === "white" ? "currentColor" : "url(#moa-logo-gradient-dot)"} />
        <defs>
          <linearGradient id="moa-logo-gradient-main" x1="50.6061" y1="1.45635" x2="-0.000314075" y2="16.2385" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0542FF" />
            <stop offset="1" stopColor="#089EF5" />
          </linearGradient>
          <linearGradient id="moa-logo-gradient-dot" x1="52.8408" y1="0.340847" x2="45.2362" y2="1.69671" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0542FF" />
            <stop offset="1" stopColor="#089EF5" />
          </linearGradient>
        </defs>
      </svg>
      {showText ? <span>MOA</span> : null}
    </div>
  );
}

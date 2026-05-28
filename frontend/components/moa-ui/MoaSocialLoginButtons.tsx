function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 lg:h-[clamp(20px,2vw,39px)] lg:w-[clamp(20px,2vw,39px)]">
      <path fill="#4285F4" d="M22.1 12.25c0-.77-.07-1.5-.2-2.2H12v4.15h5.65a4.84 4.84 0 0 1-2.1 3.18v2.64h3.4c1.99-1.83 3.15-4.53 3.15-7.77Z" />
      <path fill="#34A853" d="M12 22c2.84 0 5.23-.94 6.97-2.55l-3.4-2.64c-.94.63-2.14 1-3.57 1-2.74 0-5.06-1.85-5.9-4.34H2.6v2.72A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.1 13.47A6 6 0 0 1 5.78 12c0-.5.08-1 .22-1.47V7.81H2.6A10 10 0 0 0 2 12c0 1.61.39 3.13 1.1 4.19l3-2.72Z" />
      <path fill="#EA4335" d="M12 6.18c1.55 0 2.93.53 4.02 1.57l3.02-3.02A10 10 0 0 0 12 2a10 10 0 0 0-9.4 6.19l3.5 2.72c.84-2.49 3.16-4.73 5.9-4.73Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 lg:h-[clamp(20px,2vw,48px)] lg:w-[clamp(20px,2vw,48px)]" fill="currentColor">
      <path d="M16.53 12.78c-.02-2.24 1.83-3.31 1.91-3.36-1.04-1.52-2.65-1.73-3.22-1.75-1.37-.14-2.68.81-3.37.81-.7 0-1.78-.79-2.93-.77-1.51.02-2.9.88-3.68 2.23-1.57 2.73-.4 6.77 1.13 8.98.75 1.08 1.64 2.3 2.81 2.25 1.13-.04 1.56-.73 2.92-.73 1.37 0 1.75.73 2.94.71 1.21-.02 1.98-1.1 2.72-2.19.86-1.25 1.21-2.47 1.23-2.53-.03-.01-2.37-.91-2.42-3.65ZM14.32 6.22c.62-.75 1.04-1.79.92-2.83-.89.04-1.97.59-2.61 1.34-.57.66-1.07 1.72-.94 2.73.99.08 2-.5 2.63-1.24Z" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" className="h-6 w-6 lg:h-[clamp(24px,2vw,43px)] lg:w-[clamp(24px,2vw,43px)]" fill="none">
      <path fill="#111" d="M14 5.25c-5.1 0-9.25 3.2-9.25 7.14 0 2.52 1.69 4.73 4.24 6l-.68 2.46c-.1.38.33.69.66.47l3.02-2.02c.64.12 1.31.19 2.01.19 5.1 0 9.25-3.2 9.25-7.1 0-3.94-4.15-7.14-9.25-7.14Z" />
      <path fill="#fff" d="M8.27 12.24h1.06v3.02h.88v-3.02h1.06v-.73h-3v.73Zm5.54-.73h-.93l-1.19 3.75h.86l.19-.66h1.18l.19.66h.89l-1.19-3.75Zm-.87 2.37.39-1.38.39 1.38h-.78Zm3.5-2.37h-.87v3.75h2.38v-.74h-1.51v-3.01Zm4.04 0h-1.02l-1.13 1.53v-1.53h-.87v3.75h.87v-1.1l.37-.47.85 1.57h1.01l-1.29-2.25 1.2-1.5Z" />
    </svg>
  );
}

export function MoaSocialLoginButtons() {
  return (
    <div className="mt-[30px] lg:mt-[clamp(30px,5vh,68px)]">
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-[#d7d7d7]" />
        <span className="text-[11px] font-medium leading-4 text-[#777] lg:text-[clamp(11px,1vw,20px)] lg:leading-[163%]">간편 로그인</span>
        <span className="h-px flex-1 bg-[#d7d7d7]" />
      </div>
      <div className="mt-[22px] flex items-center justify-center gap-[46px] lg:mt-[clamp(22px,4vh,52px)] lg:gap-[clamp(46px,4vw,93px)]">
        {[
          { label: "Google 로그인", icon: <GoogleIcon /> },
          { label: "Apple 로그인", icon: <AppleIcon /> },
          { label: "Kakao 로그인", icon: <KakaoIcon /> },
        ].map((item) => (
          <button
            aria-label={item.label}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[#d6d6d6] bg-white text-black transition hover:border-[#bdbdbd] hover:bg-[#fafafa] lg:h-[clamp(38px,3vw,74px)] lg:w-[clamp(38px,3vw,74px)]"
            key={item.label}
            type="button"
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

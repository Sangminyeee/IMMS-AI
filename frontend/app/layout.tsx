import type { Metadata } from "next";
import localFont from "next/font/local";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { FigmaCaptureDebugButton } from "@/components/FigmaCaptureDebugButton";

export const metadata: Metadata = {
  title: "IMMS Meeting AI Assistant",
  description: "AI meeting workspace for live transcription, agenda analysis, shared canvas, and personal notes.",
};

export const dynamic = "force-dynamic";

interface RootLayoutProps {
  children: ReactNode;
}

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
});

const gmarketSans = localFont({
  src: [
    {
      path: "./fonts/GmarketSansTTFLight.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/GmarketSansTTFMedium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/GmarketSansTTFBold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-gmarket-sans",
  display: "swap",
});

const gilroy = localFont({
  src: [
    {
      path: "./fonts/Gilroy-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/Gilroy-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-gilroy",
  display: "swap",
});

const fontVariables = {
  "--font-body": 'var(--font-pretendard), "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif',
  "--font-display": 'var(--font-pretendard), "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif',
  "--font-inter": '"Inter", var(--font-pretendard), "Segoe UI", sans-serif',
  "--font-noto-sans-kr": 'var(--font-pretendard), "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  "--font-logo": 'var(--font-gilroy), var(--font-gmarket-sans), var(--font-pretendard), sans-serif',
} as CSSProperties;

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="ko">
      <body className={`${pretendard.variable} ${gmarketSans.variable} ${gilroy.variable}`} style={fontVariables}>
        <div data-imms-figma-capture-root>
          <AuthProvider>
            {children}
          </AuthProvider>
        </div>
        <FigmaCaptureDebugButton />
      </body>
    </html>
  );
}

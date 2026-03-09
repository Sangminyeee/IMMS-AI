import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Microsoft Teams Color Palette
        teams: {
          purple: '#6264A7',
          'purple-dark': '#464775',
          'purple-light': '#E8E8F7',
          blue: '#5B5FC7',
          'blue-light': '#8B8CC7',
          hover: 'rgba(98, 100, 167, 0.1)',
          'hover-strong': 'rgba(98, 100, 167, 0.2)',
        },
        // Surface colors
        surface: {
          DEFAULT: '#FFFFFF',
          gray: '#F5F5F5',
          'gray-light': '#FAFAFA',
        },
        // Text colors
        text: {
          primary: '#252423',
          secondary: '#605E5C',
          tertiary: '#8A8886',
        },
        // Border colors
        border: {
          DEFAULT: '#E1DFDD',
          light: '#EDEBE9',
        },
        // Status colors
        status: {
          success: '#107C10',
          'success-bg': '#DFF6DD',
          warning: '#F7630C',
          'warning-bg': '#FFF4CE',
          error: '#D13438',
          'error-bg': '#FDE7E9',
          info: '#0078D4',
          'info-bg': '#D3E4F4',
        },
      },
      boxShadow: {
        'teams-sm': '0 1.6px 3.6px rgba(0,0,0,0.132), 0 0.3px 0.9px rgba(0,0,0,0.108)',
        'teams-md': '0 3.2px 7.2px rgba(0,0,0,0.132), 0 0.6px 1.8px rgba(0,0,0,0.108)',
        'teams-lg': '0 6.4px 14.4px rgba(0,0,0,0.132), 0 1.2px 3.6px rgba(0,0,0,0.108)',
        'teams-xl': '0 12.8px 28.8px rgba(0,0,0,0.132), 0 2.4px 7.2px rgba(0,0,0,0.108)',
      },
      borderRadius: {
        'teams': '4px',
        'teams-md': '8px',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

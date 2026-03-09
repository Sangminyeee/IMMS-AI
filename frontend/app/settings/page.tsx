"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import MainLayout from "@/components/MainLayout";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [language, setLanguage] = useState('ko');

  // 인증 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const handleSaveSettings = () => {
    // TODO: 설정 저장 로직 구현
    alert('설정이 저장되었습니다.');
  };

  // 로딩 중
  if (authLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center bg-surface-gray">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teams-blue mx-auto"></div>
            <p className="mt-4 text-text-secondary">로딩 중...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // 인증되지 않은 경우
  if (!user) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center bg-surface-gray">
          <div className="text-center">
            <p className="text-text-secondary">로그인이 필요합니다. 리다이렉트 중...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-surface-gray">
        {/* Header */}
        <header className="bg-surface border-b border-border shadow-teams-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-text-primary">설정</h1>
                <p className="text-sm text-text-secondary mt-1">시스템 설정을 관리합니다.</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {/* General Settings */}
          <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">일반 설정</h2>
            
            <div className="space-y-4">
              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  언어
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>

          {/* Meeting Settings */}
          <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">회의 설정</h2>
            
            <div className="space-y-4">
              {/* Auto Transcribe */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-text-primary">자동 전사</p>
                  <p className="text-sm text-text-secondary">회의 시작 시 자동으로 전사를 시작합니다.</p>
                </div>
                <label className="relative inline-block w-12 h-6">
                  <input
                    type="checkbox"
                    checked={autoTranscribe}
                    onChange={(e) => setAutoTranscribe(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-full h-full bg-gray-300 peer-checked:bg-teams-blue rounded-full transition cursor-pointer after:content-[''] after:absolute after:top-1 after:left-1 after:bg-surface after:rounded-full after:h-4 after:w-4 after:transition peer-checked:after:translate-x-6"></div>
                </label>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-text-primary">알림</p>
                  <p className="text-sm text-text-secondary">중요한 이벤트 발생 시 알림을 받습니다.</p>
                </div>
                <label className="relative inline-block w-12 h-6">
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-full h-full bg-gray-300 peer-checked:bg-teams-blue rounded-full transition cursor-pointer after:content-[''] after:absolute after:top-1 after:left-1 after:bg-surface after:rounded-full after:h-4 after:w-4 after:transition peer-checked:after:translate-x-6"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="px-6 py-3 bg-teams-blue hover:bg-teams-purple-dark text-white rounded-teams font-semibold transition shadow-teams-md"
            >
              설정 저장
            </button>
          </div>

        </main>
      </div>
    </MainLayout>
  );
}

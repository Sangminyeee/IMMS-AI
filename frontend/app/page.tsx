"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const meetingId = searchParams.get('meeting_id');

  // 인증 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 로딩 중이거나 인증되지 않은 경우
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 회의 ID가 없으면 대시보드로 리다이렉트
  if (!meetingId) {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">회의 워크스페이스</h1>
              <p className="text-sm text-gray-600 mt-1">Meeting ID: {meetingId}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition font-medium"
            >
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left: 실시간 전사 */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">실시간 전사</h2>
            <div className="space-y-3">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">홍길동:</span> 안녕하세요, 오늘 회의를 시작하겠습니다.
                </p>
                <p className="text-xs text-gray-500 mt-1">10:30:15</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">김철수:</span> 네, 안건부터 검토하시죠.
                </p>
                <p className="text-xs text-gray-500 mt-1">10:30:32</p>
              </div>
            </div>
            
            {/* 마이크 컨트롤 */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition">
                🎤 녹음 시작
              </button>
            </div>
          </div>

          {/* Center: 안건 분석 */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">안건 분석</h2>
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-3 py-2">
                <h3 className="font-semibold text-gray-900">1. 프로젝트 일정 검토</h3>
                <p className="text-sm text-gray-600 mt-1">논의 중...</p>
                <div className="mt-2">
                  <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    진행 중
                  </span>
                </div>
              </div>
              
              <div className="border-l-4 border-gray-300 pl-3 py-2">
                <h3 className="font-semibold text-gray-900">2. 예산 승인</h3>
                <p className="text-sm text-gray-600 mt-1">대기 중</p>
                <div className="mt-2">
                  <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    시작 전
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: 의사결정 & 액션 */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* 의사결정 */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">의사결정</h2>
              <div className="space-y-3">
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <p className="text-sm text-gray-700">일정을 2주 연장하기로 결정</p>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      ✓ 승인
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 액션 아이템 */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">액션 아이템</h2>
              <div className="space-y-3">
                <div className="p-3 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-700 font-medium">일정표 수정</p>
                  <p className="text-xs text-gray-500 mt-1">담당: 김철수</p>
                  <p className="text-xs text-gray-500">기한: 2026-03-15</p>
                  <div className="mt-2">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      진행 중
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Bottom: 회의 컨트롤 */}
        <div className="mt-6 bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex justify-center gap-4">
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition">
              📊 분석 요청
            </button>
            <button className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition">
              ⏹️ 회의 종료
            </button>
            <button className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition">
              📄 리포트 생성
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

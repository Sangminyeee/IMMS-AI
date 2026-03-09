"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import MainLayout from "@/components/MainLayout";
import Link from "next/link";

interface Stats {
  totalMeetings: number;
  activeMeetings: number;
  completedMeetings: number;
  scheduledMeetings: number;
  totalTranscripts: number;
}

interface RecentMeeting {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  
  const [stats, setStats] = useState<Stats>({
    totalMeetings: 0,
    activeMeetings: 0,
    completedMeetings: 0,
    scheduledMeetings: 0,
    totalTranscripts: 0
  });
  const [recentMeetings, setRecentMeetings] = useState<RecentMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  // 인증 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 대시보드 데이터 로드
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 회의 통계 로드
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('*');

      if (meetingsError) throw meetingsError;

      const activeMeetings = meetings?.filter(m => m.status === 'active' || m.status === 'in_progress').length || 0;
      const completedMeetings = meetings?.filter(m => m.status === 'completed').length || 0;
      const scheduledMeetings = meetings?.filter(m => m.status === 'scheduled' || m.status === 'waiting').length || 0;

      // 전사 통계 로드
      const { count: transcriptCount } = await supabase
        .from('transcripts')
        .select('*', { count: 'exact', head: true });

      // 최근 회의 5개 로드
      const { data: recent, error: recentError } = await supabase
        .from('meetings')
        .select('id, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentError) throw recentError;

      setStats({
        totalMeetings: meetings?.length || 0,
        activeMeetings,
        completedMeetings,
        scheduledMeetings,
        totalTranscripts: transcriptCount || 0
      });

      setRecentMeetings(recent || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // 로딩 중
  if (authLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">로딩 중...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // 인증되지 않은 경우
  if (!user) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <p className="text-gray-600">로그인이 필요합니다. 리다이렉트 중...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
                <p className="text-sm text-gray-600 mt-1">
                  환영합니다, {profile?.name || user.email}님
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Meetings */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">전체 회의</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
              </div>
            </div>

            {/* Active Meetings */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">진행 중</p>
                  <p className="text-3xl font-bold text-green-600">{stats.activeMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🟢</span>
                </div>
              </div>
            </div>

            {/* Completed Meetings */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">완료됨</p>
                  <p className="text-3xl font-bold text-gray-600">{stats.completedMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </div>

            {/* Total Transcripts */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">전사 건수</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.totalTranscripts}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📝</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Recent Meetings */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">최근 회의</h2>
                <Link 
                  href="/meetings"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  전체 보기 →
                </Link>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : recentMeetings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>아직 생성된 회의가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentMeetings.map((meeting) => (
                    <div 
                      key={meeting.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                      onClick={() => router.push(`/?meeting_id=${meeting.id}`)}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{meeting.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(meeting.created_at).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        meeting.status === 'active' || meeting.status === 'in_progress'
                          ? 'bg-green-100 text-green-800'
                          : meeting.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {meeting.status === 'active' || meeting.status === 'in_progress' ? '진행 중' :
                         meeting.status === 'scheduled' ? '예정됨' : '종료됨'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">빠른 작업</h2>
              
              <div className="space-y-3">
                <Link
                  href="/meetings"
                  className="flex items-center justify-between p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-xl">➕</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">새 회의 만들기</p>
                      <p className="text-sm text-gray-600">실시간 회의를 시작합니다</p>
                    </div>
                  </div>
                  <span className="text-blue-600 group-hover:translate-x-1 transition">→</span>
                </Link>

                <Link
                  href="/reports"
                  className="flex items-center justify-between p-4 bg-green-50 rounded-lg hover:bg-green-100 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📄</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">리포트 보기</p>
                      <p className="text-sm text-gray-600">회의 리포트를 확인합니다</p>
                    </div>
                  </div>
                  <span className="text-green-600 group-hover:translate-x-1 transition">→</span>
                </Link>

                <Link
                  href="/profile"
                  className="flex items-center justify-between p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                      <span className="text-xl">👤</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">프로필 설정</p>
                      <p className="text-sm text-gray-600">개인 정보를 관리합니다</p>
                    </div>
                  </div>
                  <span className="text-purple-600 group-hover:translate-x-1 transition">→</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">🎉 IMMS 실시간 회의 시스템</h3>
                <p className="text-blue-100">
                  AI 기반 실시간 전사 및 분석으로 더 효율적인 회의를 경험하세요.
                </p>
              </div>
              <Link
                href="/meetings"
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
              >
                시작하기
              </Link>
            </div>
          </div>

        </main>
      </div>
    </MainLayout>
  );
}

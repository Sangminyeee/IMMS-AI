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
        {/* Header - Microsoft Teams Style */}
        <header className="bg-surface border-b border-border shadow-teams-sm">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">대시보드</h1>
                <p className="text-sm text-text-secondary mt-0.5">
                  환영합니다, {profile?.name || user.email}님
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-status-error hover:bg-red-600 text-white rounded-teams transition-colors font-medium text-sm shadow-teams-sm"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          
          {/* Stats Cards - Microsoft Teams Style */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total Meetings */}
            <div className="bg-surface rounded-teams-md shadow-teams-sm border border-border p-5 hover:shadow-teams-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">전체 회의</p>
                  <p className="text-3xl font-semibold text-text-primary">{stats.totalMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-teams-purple-light rounded-teams flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
              </div>
            </div>

            {/* Active Meetings */}
            <div className="bg-surface rounded-teams-md shadow-teams-sm border border-border p-5 hover:shadow-teams-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">진행 중</p>
                  <p className="text-3xl font-semibold text-status-success">{stats.activeMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-status-success-bg rounded-teams flex items-center justify-center">
                  <span className="text-2xl">🟢</span>
                </div>
              </div>
            </div>

            {/* Completed Meetings */}
            <div className="bg-surface rounded-teams-md shadow-teams-sm border border-border p-5 hover:shadow-teams-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">완료됨</p>
                  <p className="text-3xl font-semibold text-text-secondary">{stats.completedMeetings}</p>
                </div>
                <div className="w-12 h-12 bg-surface-gray rounded-teams flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </div>

            {/* Total Transcripts */}
            <div className="bg-surface rounded-teams-md shadow-teams-sm border border-border p-5 hover:shadow-teams-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">전사 건수</p>
                  <p className="text-3xl font-semibold text-teams-purple">{stats.totalTranscripts}</p>
                </div>
                <div className="w-12 h-12 bg-teams-purple-light rounded-teams flex items-center justify-center">
                  <span className="text-2xl">📝</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Recent Meetings */}
            <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-semibold text-text-primary">최근 회의</h2>
                <Link 
                  href="/meetings"
                  className="text-sm text-teams-blue hover:text-teams-purple transition-colors font-medium flex items-center gap-1"
                >
                  전체 보기
                  <span className="text-xs">→</span>
                </Link>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teams-blue mx-auto"></div>
                </div>
              ) : recentMeetings.length === 0 ? (
                <div className="text-center py-12 text-text-tertiary bg-surface-gray rounded-teams">
                  <p className="text-sm">아직 생성된 회의가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentMeetings.map((meeting) => (
                    <div 
                      key={meeting.id}
                      className="flex items-center justify-between p-4 bg-surface-gray-light rounded-teams hover:bg-surface-gray transition-colors cursor-pointer border border-transparent hover:border-border-light"
                      onClick={() => router.push(`/?meeting_id=${meeting.id}`)}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-text-primary text-sm">{meeting.title}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {new Date(meeting.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        meeting.status === 'active' || meeting.status === 'in_progress'
                          ? 'bg-status-success-bg text-status-success'
                          : meeting.status === 'scheduled'
                          ? 'bg-status-info-bg text-status-info'
                          : 'bg-surface-gray text-text-secondary'
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
            <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-5">빠른 작업</h2>
              
              <div className="space-y-3">
                <Link
                  href="/meetings"
                  className="flex items-center justify-between p-4 bg-status-info-bg rounded-teams hover:shadow-teams-sm transition-all group border border-transparent hover:border-status-info"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 bg-status-info rounded-teams flex items-center justify-center shadow-teams-sm">
                      <span className="text-xl">➕</span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary text-sm">새 회의 만들기</p>
                      <p className="text-xs text-text-tertiary">실시간 회의를 시작합니다</p>
                    </div>
                  </div>
                  <span className="text-status-info group-hover:translate-x-1 transition-transform text-sm">→</span>
                </Link>

                <Link
                  href="/reports"
                  className="flex items-center justify-between p-4 bg-status-success-bg rounded-teams hover:shadow-teams-sm transition-all group border border-transparent hover:border-status-success"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 bg-status-success rounded-teams flex items-center justify-center shadow-teams-sm">
                      <span className="text-xl">📄</span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary text-sm">리포트 보기</p>
                      <p className="text-xs text-text-tertiary">회의 리포트를 확인합니다</p>
                    </div>
                  </div>
                  <span className="text-status-success group-hover:translate-x-1 transition-transform text-sm">→</span>
                </Link>

                <Link
                  href="/profile"
                  className="flex items-center justify-between p-4 bg-teams-purple-light rounded-teams hover:shadow-teams-sm transition-all group border border-transparent hover:border-teams-purple"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 bg-teams-purple rounded-teams flex items-center justify-center shadow-teams-sm">
                      <span className="text-xl">👤</span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary text-sm">프로필 설정</p>
                      <p className="text-xs text-text-tertiary">개인 정보를 관리합니다</p>
                    </div>
                  </div>
                  <span className="text-teams-purple group-hover:translate-x-1 transition-transform text-sm">→</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Info Banner - Microsoft Teams Style */}
          <div className="bg-gradient-to-r from-teams-purple to-teams-blue rounded-teams-md shadow-teams-lg p-6 text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-1.5 flex items-center gap-2">
                  <span>🎉</span>
                  IMMS 실시간 회의 시스템
                </h3>
                <p className="text-white/90 text-sm">
                  AI 기반 실시간 전사 및 분석으로 더 효율적인 회의를 경험하세요.
                </p>
              </div>
              <Link
                href="/meetings"
                className="px-6 py-2.5 bg-white text-teams-purple rounded-teams font-semibold hover:bg-white/95 transition-colors text-sm shadow-teams-md"
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

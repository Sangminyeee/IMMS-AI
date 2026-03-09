"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import MainLayout from "@/components/MainLayout";

interface Meeting {
  id: string;
  title: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
  host_id: string;
}

export default function MeetingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');

  // 인증 체크
  useEffect(() => {
    console.log('💬 Meetings - Auth check:', { authLoading, userEmail: user?.email });
    if (!authLoading && !user) {
      console.log('❌ Meetings - No user, redirecting to /login');
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 회의 목록 로드
  useEffect(() => {
    if (user) {
      console.log('💬 Meetings - Loading meetings for user:', user.email);
      loadMeetings();
    }
  }, [user]);

  const loadMeetings = async () => {
    try {
      setLoading(true);
      console.log('💬 Meetings - Fetching meetings from Supabase...');
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('❌ Meetings - Failed to load meetings:', error);
        throw error;
      }

      console.log('✅ Meetings - Loaded meetings:', data?.length || 0);
      setMeetings(data || []);
    } catch (error) {
      console.error('Error loading meetings:', error);
      alert('회의 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMeeting = async () => {
    if (!user) return;
    if (!newMeetingTitle.trim()) {
      alert('회의 제목을 입력해주세요.');
      return;
    }

    try {
      console.log('💬 Meetings - Creating new meeting:', newMeetingTitle);
      
      const { data, error } = await supabase
        .from('meetings')
        .insert([
          {
            title: newMeetingTitle,
            host_id: user.id,
            status: 'scheduled'
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('❌ Meetings - Failed to create meeting:', error);
        throw error;
      }

      console.log('✅ Meetings - Meeting created:', data.id);
      setShowCreateModal(false);
      setNewMeetingTitle('');
      
      // 회의 목록 새로고침
      await loadMeetings();
      
      // 회의 페이지로 이동
      router.push(`/?meeting_id=${data.id}`);
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('회의 생성에 실패했습니다: ' + (error as any).message);
    }
  };

  const handleJoinMeeting = (meetingId: string) => {
    console.log('💬 Meetings - Joining meeting:', meetingId);
    router.push(`/?meeting_id=${meetingId}`);
  };

  const handleDeleteMeeting = async (meetingId: string, hostId: string) => {
    if (!user) return;

    // 호스트만 삭제 가능
    if (hostId !== user.id) {
      alert('회의 호스트만 회의를 삭제할 수 있습니다.');
      return;
    }

    if (!confirm('정말로 이 회의를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      console.log('💬 Meetings - Deleting meeting:', meetingId);
      
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);

      if (error) {
        console.error('❌ Meetings - Failed to delete meeting:', error);
        throw error;
      }

      console.log('✅ Meetings - Meeting deleted');
      alert('회의가 삭제되었습니다.');
      
      // 회의 목록 새로고침
      await loadMeetings();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      alert('회의 삭제에 실패했습니다: ' + (error as any).message);
    }
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
                <h1 className="text-2xl font-semibold text-text-primary">회의 워크스페이스</h1>
                <p className="text-sm text-text-secondary mt-0.5">회의를 생성하고 관리합니다.</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          
          {/* Create Meeting Button - Teams Style */}
          <div className="mb-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2.5 bg-teams-purple hover:bg-teams-purple-dark text-white rounded-teams font-semibold transition-colors shadow-teams-md text-sm flex items-center gap-2"
            >
              <span className="text-lg">+</span>
              새 회의 만들기
            </button>
          </div>

          {/* Meetings List - Teams Style */}
          <div className="bg-surface rounded-teams-md shadow-teams-md border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface-gray-light">
              <h2 className="text-base font-semibold text-text-primary">내 회의 목록</h2>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teams-blue mx-auto"></div>
                <p className="mt-4 text-text-secondary text-sm">회의 목록을 불러오는 중...</p>
              </div>
            ) : meetings.length === 0 ? (
              <div className="p-12 text-center text-text-tertiary">
                <p className="text-sm">아직 생성된 회의가 없습니다.</p>
                <p className="text-xs mt-2">위의 "새 회의 만들기" 버튼을 눌러 회의를 시작하세요.</p>
              </div>
            ) : (
              <div className="divide-y divide-border-light">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="px-6 py-4 hover:bg-surface-gray-light transition-colors"
                  >
                    <div className="flex justify-between items-center gap-4">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleJoinMeeting(meeting.id)}
                      >
                        <h3 className="text-base font-medium text-text-primary">{meeting.title}</h3>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${
                            meeting.status === 'active' || meeting.status === 'in_progress'
                              ? 'bg-status-success-bg text-status-success'
                              : meeting.status === 'scheduled' || meeting.status === 'waiting'
                              ? 'bg-status-info-bg text-status-info'
                              : 'bg-surface-gray text-text-secondary'
                          }`}>
                            {meeting.status === 'active' || meeting.status === 'in_progress' ? '진행 중' :
                             meeting.status === 'scheduled' || meeting.status === 'waiting' ? '예정됨' :
                             meeting.status === 'completed' ? '종료됨' : meeting.status}
                          </span>
                          <span className="text-xs text-text-tertiary">
                            {new Date(meeting.created_at).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          {meeting.host_id === user.id && (
                            <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full bg-teams-purple-light text-teams-purple">
                              호스트
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinMeeting(meeting.id);
                          }}
                          className="px-4 py-2 bg-teams-blue hover:bg-teams-purple text-white rounded-teams transition-colors font-medium text-sm shadow-teams-sm"
                        >
                          {meeting.status === 'completed' ? '열기' : '참여하기'}
                        </button>
                        {meeting.host_id === user.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeeting(meeting.id, meeting.host_id);
                            }}
                            className="px-4 py-2 bg-status-error hover:bg-red-600 text-white rounded-teams transition-colors font-medium text-sm shadow-teams-sm"
                            title="회의 삭제 (호스트만 가능)"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Create Meeting Modal - Teams Style */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-surface rounded-teams-md shadow-teams-xl p-6 max-w-md w-full mx-4 border border-border">
              <h2 className="text-lg font-semibold text-text-primary mb-4">새 회의 만들기</h2>
              <input
                type="text"
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                placeholder="회의 제목을 입력하세요"
                className="w-full px-4 py-2.5 border border-border rounded-teams focus:outline-none focus:ring-2 focus:ring-teams-blue focus:border-transparent text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateMeeting();
                }}
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewMeetingTitle('');
                  }}
                  className="flex-1 px-4 py-2 bg-surface-gray hover:bg-border text-text-primary rounded-teams transition-colors font-medium text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handleCreateMeeting}
                  disabled={!newMeetingTitle.trim()}
                  className="flex-1 px-4 py-2 bg-teams-purple hover:bg-teams-purple-dark text-white rounded-teams transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-teams-sm"
                >
                  생성
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

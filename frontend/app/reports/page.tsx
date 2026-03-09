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
  ended_at?: string;
  host_id: string;
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  // 인증 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 종료된 회의 목록 로드
  useEffect(() => {
    if (user) {
      loadCompletedMeetings();
    }
  }, [user]);

  const loadCompletedMeetings = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('❌ Failed to load completed meetings:', error);
        throw error;
      }

      console.log('✅ Loaded completed meetings:', data?.length || 0);
      setMeetings(data || []);
    } catch (error) {
      console.error('Error loading meetings:', error);
      alert('회의 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (meetingId: string, meetingTitle: string) => {
    setGeneratingReport(meetingId);
    
    try {
      // Gateway로 리포트 생성 요청
      const response = await fetch(`http://localhost:8001/gateway/reports/${meetingId}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Report generated:', data);
        alert(`"${meetingTitle}" 회의 리포트가 생성되었습니다!`);
        
        // 리포트 데이터를 JSON 파일로 다운로드
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${meetingId.substring(0, 8)}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        throw new Error(`리포트 생성 실패: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('리포트 생성에 실패했습니다: ' + (error as any).message);
    } finally {
      setGeneratingReport(null);
    }
  };

  const handleExportPDF = async (meetingId: string, meetingTitle: string) => {
    alert('PDF 내보내기 기능은 추후 구현 예정입니다.');
    
    // TODO: 실제 PDF 생성 로직 구현
    // 예: jsPDF 라이브러리 사용하여 리포트 내용을 PDF로 변환
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
                <h1 className="text-2xl font-bold text-gray-900">회의 리포트</h1>
                <p className="text-sm text-gray-600 mt-1">종료된 회의의 리포트를 생성하고 내보낼 수 있습니다.</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {/* Completed Meetings List */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">종료된 회의 목록</h2>
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">회의 목록을 불러오는 중...</p>
              </div>
            ) : meetings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>아직 종료된 회의가 없습니다.</p>
                <p className="text-sm mt-2">회의를 종료하면 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="px-6 py-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900">{meeting.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                            종료됨
                          </span>
                          <span className="text-sm text-gray-500">
                            생성: {new Date(meeting.created_at).toLocaleDateString('ko-KR')}
                          </span>
                          {meeting.ended_at && (
                            <span className="text-sm text-gray-500">
                              종료: {new Date(meeting.ended_at).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerateReport(meeting.id, meeting.title)}
                          disabled={generatingReport === meeting.id}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingReport === meeting.id ? '생성 중...' : '리포트 생성'}
                        </button>
                        <button
                          onClick={() => handleExportPDF(meeting.id, meeting.title)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
                        >
                          PDF 내보내기
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 리포트 기능 안내</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>리포트 생성</strong>: AI가 회의 내용을 분석하여 요약, 안건, 의사결정, 액션 아이템을 정리합니다.</li>
              <li>• <strong>PDF 내보내기</strong>: 생성된 리포트를 PDF 파일로 다운로드할 수 있습니다. (추후 구현 예정)</li>
              <li>• 리포트는 회의가 종료된 후에만 생성할 수 있습니다.</li>
            </ul>
          </div>

        </main>
      </div>
    </MainLayout>
  );
}

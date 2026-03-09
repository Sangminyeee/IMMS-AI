"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import MainLayout from "@/components/MainLayout";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [department, setDepartment] = useState('');
  const [occupation, setOccupation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // 인증 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 프로필 데이터 로드
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setRank(profile.role || '');
      setDepartment(profile.team || '');
      setOccupation(profile.occupation || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // 프로필 정보 업데이트
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name,
          role: rank,
          team: department,
          occupation,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // 비밀번호 변경 (입력된 경우)
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          alert('비밀번호가 일치하지 않습니다.');
          setSaving(false);
          return;
        }

        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword
        });

        if (passwordError) throw passwordError;
      }

      alert('프로필이 저장되었습니다.');
      setEditing(false);
      setNewPassword('');
      setConfirmPassword('');
      
      // 프로필 새로고침
      await refreshProfile();
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('프로필 저장에 실패했습니다: ' + (error as any).message);
    } finally {
      setSaving(false);
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
        {/* Header */}
        <header className="bg-surface border-b border-border shadow-teams-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-text-primary">내 프로필</h1>
                <p className="text-sm text-text-secondary mt-1">개인 정보를 관리합니다.</p>
              </div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-teams-blue hover:bg-teams-purple-dark text-white rounded-teams transition font-medium"
                >
                  수정
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          
          {/* Profile Picture */}
          <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6 mb-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-3xl font-bold text-white">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{name || '이름 없음'}</h2>
                <p className="text-text-secondary">{user.email}</p>
                {editing && (
                  <button className="mt-2 text-sm text-teams-blue hover:text-blue-700">
                    프로필 사진 변경 (추후 구현 예정)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Profile Information */}
          <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">개인 정보</h2>
            
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  이름
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!editing}
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Email (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={user.email || ''}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams bg-gray-100 cursor-not-allowed"
                />
              </div>

              {/* Rank */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  직급
                </label>
                <input
                  type="text"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  disabled={!editing}
                  placeholder="예: 과장, 차장, 부장"
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  부서
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!editing}
                  placeholder="예: 개발팀, 기획팀"
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Occupation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  직책
                </label>
                <input
                  type="text"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  disabled={!editing}
                  placeholder="예: 백엔드 개발자, PM"
                  className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Change Password (Only when editing) */}
          {editing && (
            <div className="bg-surface rounded-teams-md shadow-teams-md border border-border p-6 mb-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">비밀번호 변경</h2>
              
              <div className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    새 비밀번호
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="변경하지 않으려면 비워두세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    비밀번호 확인
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호를 다시 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-teams focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons (Only when editing) */}
          {editing && (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditing(false);
                  // 원래 값으로 복구
                  if (profile) {
                    setName(profile.name || '');
                    setRank(profile.role || '');
                    setDepartment(profile.team || '');
                    setOccupation(profile.occupation || '');
                  }
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-teams font-semibold transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="px-6 py-3 bg-teams-blue hover:bg-teams-purple-dark text-white rounded-teams font-semibold transition shadow-teams-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          )}

        </main>
      </div>
    </MainLayout>
  );
}

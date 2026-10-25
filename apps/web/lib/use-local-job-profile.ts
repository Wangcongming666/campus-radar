'use client';
import { useMemo } from 'react';
import { useRadarStore } from './store';
import { useInterviewLocal } from './interview-repository';
import { isResumeLibrary, type ResumeVersion } from './resume-files';
import { parseProfileText, parseSavedProfile } from './local-matching';
import { useCampus } from '@/components/campus-provider';
export function useLocalJobProfile() {
  const { mode, user } = useCampus();
  const raw = useRadarStore((s) => s.notes['onboarding-profile']);
  const library = useInterviewLocal<ResumeVersion[]>('resume-library-v2', [], isResumeLibrary);
  return useMemo(() => {
    const education = { any: '', associate: '专科', bachelor: '本科', master: '硕士', doctorate: '博士' };
    const profile = mode === 'api' && user ? {
      name: user.displayName,
      school: user.school ?? '',
      degree: user.education ? education[user.education] : '',
      year: String(user.graduationYear ?? user.preferences.graduationYear ?? ''),
      roles: user.preferences.roles,
      cities: user.preferences.cities,
      resumeText: '',
    } : parseSavedProfile(raw);
    const resume = library.value.find((r) => r.default) ?? library.value[0];
    const resumeText = resume?.text || profile.resumeText || '';
    const extracted = parseProfileText(resumeText);
    return {
      ...profile,
      degree: profile.degree || extracted.degree,
      year: profile.year || extracted.year,
      resumeText,
    };
  }, [raw, library.value, mode, user]);
}

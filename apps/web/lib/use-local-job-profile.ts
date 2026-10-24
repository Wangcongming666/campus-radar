'use client';
import { useMemo } from 'react';
import { useRadarStore } from './store';
import { useInterviewLocal } from './interview-repository';
import { isResumeLibrary, type ResumeVersion } from './resume-files';
import { parseProfileText, parseSavedProfile } from './local-matching';
export function useLocalJobProfile() {
  const raw = useRadarStore((s) => s.notes['onboarding-profile']);
  const library = useInterviewLocal<ResumeVersion[]>('resume-library-v2', [], isResumeLibrary);
  return useMemo(() => {
    const profile = parseSavedProfile(raw);
    const resume = library.value.find((r) => r.default) ?? library.value[0];
    const resumeText = resume?.text || profile.resumeText || '';
    const extracted = parseProfileText(resumeText);
    return {
      ...profile,
      degree: profile.degree || extracted.degree,
      year: profile.year || extracted.year,
      resumeText,
    };
  }, [raw, library.value]);
}

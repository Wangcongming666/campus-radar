'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { experiences, questions, type Experience } from './data';
import { decodeKnowledgeRecord } from './knowledge-records';
export const KNOWLEDGE_EVENT = 'radar-knowledge-change';
export const KNOWLEDGE_PREFIX = 'radar-extended-';
export function readLocalKnowledge<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  const raw = localStorage.getItem(`${KNOWLEDGE_PREFIX}${key}`);
  if (!raw) return initial;
  const parsed: unknown = decodeKnowledgeRecord(key, raw);
  if (
    Array.isArray(initial)
      ? !Array.isArray(parsed)
      : parsed === null || typeof parsed !== typeof initial || Array.isArray(parsed)
  )
    throw new Error('本地记录格式错误，请先导出并在设置中重置');
  return parsed as T;
}
export function readLocalExperiences(): Experience[] {
  return readLocalKnowledge<Experience[]>('knowledge-experiences', []).filter(
    (e) =>
      e && typeof e.id === 'string' && typeof e.title === 'string' && Array.isArray(e.sections),
  );
}
export function readAllExperiences(): Experience[] {
  return [...readLocalExperiences(), ...experiences];
}
export function useKnowledgeLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const ref = useRef(initial);
  const initialRef = useRef(initial);
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail?.key && event.detail.key !== key) return;
      if (event instanceof StorageEvent && event.key && event.key !== `${KNOWLEDGE_PREFIX}${key}`)
        return;
      try {
        const next = readLocalKnowledge(key, initialRef.current);
        ref.current = next;
        setValue(next);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : '本地记录读取失败');
      }
      setReady(true);
    };
    sync();
    window.addEventListener(KNOWLEDGE_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('radar-local-reset', sync);
    return () => {
      window.removeEventListener(KNOWLEDGE_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('radar-local-reset', sync);
    };
  }, [key]);
  const save = useCallback(
    (next: T | ((current: T) => T)) => {
      try {
        const latest = readLocalKnowledge(key, initialRef.current);
        const updated = typeof next === 'function' ? (next as (current: T) => T)(latest) : next;
        localStorage.setItem(`${KNOWLEDGE_PREFIX}${key}`, JSON.stringify(updated));
        ref.current = updated;
        setValue(updated);
        setError('');
        window.dispatchEvent(new CustomEvent(KNOWLEDGE_EVENT, { detail: { key } }));
        return true;
      } catch {
        setError('保存失败：浏览器存储不可用或空间不足。编辑内容已保留，请释放空间后重试。');
        return false;
      }
    },
    [key],
  );
  return [value, save, error, ready] as const;
}
export function downloadKnowledge(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function useAllExperiences() {
  const [local] = useKnowledgeLocal<Experience[]>('knowledge-experiences', []);
  return [...local, ...experiences];
}
export function useAllQuestions() {
  return questions;
}

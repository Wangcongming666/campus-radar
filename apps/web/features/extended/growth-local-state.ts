'use client';
import { useEffect, useMemo, type SetStateAction } from 'react';
import type { z } from 'zod';
import { toast } from 'sonner';
import { cleanLocalRecords } from '@/lib/growth-storage';
import { useLocal } from './common';

export function useValidatedArray<T>(key: string, schema: z.ZodType<T>, initial: T[]) {
  const [stored, persist] = useLocal<T[]>(key, initial);
  const checked = useMemo(() => cleanLocalRecords(stored, schema), [stored, schema]);
  useEffect(() => {
    if (checked.invalid)
      toast.error(
        `有 ${checked.invalid} 条损坏的本地记录已跳过。其他记录仍可使用；可从设置导出备份。`,
        { id: `invalid-${key}` },
      );
  }, [checked.invalid, key]);
  function save(next: SetStateAction<T[]>): boolean {
    return persist((raw) => {
      const current = cleanLocalRecords(raw, schema).value;
      const value = typeof next === 'function' ? next(current) : next;
      const checked = cleanLocalRecords(value, schema);
      if (checked.invalid) throw new Error('拒绝保存无效记录');
      return checked.value;
    });
  }
  return [checked.value, save] as const;
}
export function useValidatedValue<T>(key: string, schema: z.ZodType<T>, initial: T) {
  const [stored, persist] = useLocal<T>(key, initial);
  const checked = useMemo(() => schema.safeParse(stored), [stored, schema]);
  useEffect(() => {
    if (!checked.success)
      toast.error('本地提醒偏好格式损坏，已使用空白偏好。', { id: `invalid-${key}` });
  }, [checked.success, key]);
  function save(next: SetStateAction<T>): boolean {
    return persist((raw) => {
      const parsed = schema.safeParse(raw);
      const current = parsed.success ? parsed.data : initial;
      return schema.parse(typeof next === 'function' ? (next as (x: T) => T)(current) : next);
    });
  }
  return [checked.success ? checked.data : initial, save] as const;
}

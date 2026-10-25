'use client';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { isApiMode, useWorkspaceRecord } from './api/workspace-client';
import {
  LOCAL_RESET_EVENT,
  LOCAL_STATE_EVENT,
  localStorageKey,
  parseLocalValue,
} from './local-workspace';

/** Persistent setters are synchronous and return false when storage is unavailable. */
export function useLocalState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T,
) {
  const remote = useWorkspaceRecord(key, initial);
  const seed = useRef(initial);
  const validator = useRef(validate);
  validator.current = validate;
  const read = () => {
    const raw = localStorage.getItem(localStorageKey(key));
    if (raw && validator.current && !validator.current(JSON.parse(raw))) {
      toast.error('本地记录格式异常，已显示初始内容；可导入有效备份恢复。', {
        id: `local-invalid-${key}`,
      });
      return seed.current;
    }
    return parseLocalValue(raw, seed.current);
  };
  const [state, setState] = useState<{ key: string; value: T }>({ key, value: initial });
  const keyRef = useRef(key);
  if (keyRef.current !== key) seed.current = initial;
  keyRef.current = key;
  useEffect(() => {
    if (isApiMode()) return;
    const load = () => {
      try {
        setState({
          key,
          value: read(),
        });
      } catch {
        toast.error('浏览器无法读取本地记录，请检查存储权限。', { id: 'local-storage-read' });
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === localStorageKey(key)) load();
    };
    const onLocal = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) load();
    };
    load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_STATE_EVENT, onLocal);
    window.addEventListener(LOCAL_RESET_EVENT, load);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_STATE_EVENT, onLocal);
      window.removeEventListener(LOCAL_RESET_EVENT, load);
    };
  }, [key]);
  async function save(next: SetStateAction<T>): Promise<boolean> {
    if (isApiMode()) {
      if (validator.current && typeof next !== 'function' && !validator.current(next)) return false;
      return remote.save(next);
    }
    try {
      const current = read();
      const value = typeof next === 'function' ? (next as (previous: T) => T)(current) : next;
      if (validator.current && !validator.current(value)) throw new Error('Invalid local record');
      localStorage.setItem(localStorageKey(key), JSON.stringify(value));
      if (keyRef.current === key) setState({ key, value });
      window.dispatchEvent(new CustomEvent(LOCAL_STATE_EVENT, { detail: { key } }));
      return true;
    } catch {
      toast.error('本地保存失败，可能是空间不足或存储权限关闭。请导出备份后重试。', {
        id: 'local-storage-write',
      });
      return false;
    }
  }
  return [isApiMode() ? remote.value : state.key === key ? state.value : seed.current, save] as const;
}

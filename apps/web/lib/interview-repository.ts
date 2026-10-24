'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const INTERVIEW_FILE_DATABASE = 'radar-interview-files-v1';
export type StoredInterviewFile = { id: string; blob: Blob; name: string; updatedAt: string };
async function openFiles(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    throw new Error('此浏览器不支持本地文件存储，请更换浏览器。');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INTERVIEW_FILE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files'))
        request.result.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地文件库，文件未保存。'));
    request.onblocked = () => reject(new Error('其他标签页占用了文件库，请关闭后重试。'));
  });
}
export async function saveInterviewFile(id: string, blob: Blob, name: string): Promise<void> {
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction
        .objectStore('files')
        .put({ id, blob, name, updatedAt: new Date().toISOString() } satisfies StoredInterviewFile);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('本地存储空间不足或已被禁用，文件未保存。'));
      transaction.onabort = () => reject(new Error('本地文件保存中断，请重试。'));
    });
  } finally {
    db.close();
  }
}
export async function readInterviewFile(id: string): Promise<StoredInterviewFile | undefined> {
  const db = await openFiles();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法读取本地文件，请重新导入。'));
    });
  } finally {
    db.close();
  }
}
export async function deleteInterviewFile(id: string): Promise<void> {
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('删除失败，请重试。'));
      transaction.onabort = () => reject(new Error('删除中断，请重试。'));
    });
  } finally {
    db.close();
  }
}
export async function listInterviewFiles(): Promise<StoredInterviewFile[]> {
  const db = await openFiles();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法读取本地文件备份。'));
    });
  } finally {
    db.close();
  }
}
export async function putInterviewFile(record: StoredInterviewFile): Promise<void> {
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error('文件恢复失败，请检查可用存储空间。'));
    });
  } finally {
    db.close();
  }
}
export async function clearInterviewFiles(): Promise<void> {
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error('文件清理失败，请重试。'));
    });
  } finally {
    db.close();
  }
}

/** Metadata only. All binary files stay in IndexedDB. A write failure keeps the draft visible. */
export function useInterviewLocal<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T,
) {
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const validatorRef = useRef(validate);
  validatorRef.current = validate;
  const current = useRef(initial);
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const storageKey = `radar-extended-${key}`;
  useEffect(() => {
    setReady(false);
    const load = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed: unknown = raw ? JSON.parse(raw) : initialRef.current;
        const sameShape = Array.isArray(initialRef.current)
          ? Array.isArray(parsed)
          : initialRef.current === null
            ? parsed === null || (typeof parsed === 'object' && !Array.isArray(parsed))
            : typeof parsed === typeof initialRef.current &&
              (typeof parsed !== 'object' || (parsed !== null && !Array.isArray(parsed)));
        if (!sameShape || (validatorRef.current && !validatorRef.current(parsed)))
          throw new Error('INVALID_LOCAL_DATA');
        const next = parsed as T;
        current.current = next;
        setValue(next);
        setError('');
      } catch {
        current.current = initialRef.current;
        setValue(initialRef.current);
        setError(
          '无法读取本机记录，数据可能损坏或存储被禁用。可从设置恢复备份；当前编辑仍可保留。',
        );
      }
      setReady(true);
    };
    load();
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) load();
    };
    const localSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === storageKey || detail.key === key) load();
    };
    window.addEventListener('storage', sync);
    window.addEventListener('radar-local-change', localSync);
    window.addEventListener('radar-local-reset', load);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('radar-local-change', localSync);
      window.removeEventListener('radar-local-reset', load);
    };
  }, [storageKey, key]);
  const save = useCallback(
    (update: T | ((previous: T) => T)): boolean => {
      const next =
        typeof update === 'function' ? (update as (previous: T) => T)(current.current) : update;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        current.current = next;
        setValue(next);
        setError('');
        window.dispatchEvent(
          new CustomEvent('radar-local-change', { detail: { key: storageKey } }),
        );
        return true;
      } catch {
        setError('本机保存失败，可能存储空间不足。编辑内容未提交，请保留当前页面并重试。');
        return false;
      }
    },
    [storageKey],
  );
  return { value, save, ready, error };
}

export function downloadInterviewBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

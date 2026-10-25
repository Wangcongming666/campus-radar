export type DraftSaveStatus = 'saved' | 'pending' | 'saving' | 'failed';
/** One write in flight; edits and retries always target the latest draft. */
export function createCoalescedDraftWriter<T>(options: {
  save: (value: T) => Promise<boolean>;
  scope: () => string | null;
  onStatus: (status: DraftSaveStatus) => void;
  onConfirmed?: (value: T) => void;
  initial?: T;
  delay?: number;
}) {
  let serial = options.initial === undefined ? 0 : 1;
  let confirmed = 0;
  let latest: { value: T; serial: number; scope: string | null } | null =
    options.initial === undefined
      ? null
      : { value: options.initial, serial, scope: options.scope() };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<boolean> | null = null;
  let requested = false;
  let stopped = false;
  const dirty = () => !!latest && latest.serial > confirmed;
  const publish = (status: DraftSaveStatus) => {
    if (!stopped) options.onStatus(status);
  };
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  function flush(): Promise<boolean> {
    clearTimer();
    if (stopped) return Promise.resolve(false);
    requested = true;
    if (running) return running;
    if (!dirty()) return Promise.resolve(true);
    running = (async () => {
      while (!stopped && dirty() && requested) {
        requested = false;
        const item = latest!;
        if (!item.scope || item.scope !== options.scope()) {
          publish('failed');
          return false;
        }
        publish('saving');
        let saved = false;
        try {
          saved = await options.save(item.value);
        } catch {
          saved = false;
        }
        if (item.scope !== options.scope()) {
          clearTimer();
          publish('failed');
          return false;
        }
        if (!saved) {
          clearTimer();
          requested = false;
          publish('failed');
          return false;
        }
        confirmed = item.serial;
        options.onConfirmed?.(item.value);
        publish(dirty() ? 'pending' : 'saved');
      }
      return !dirty();
    })().finally(() => {
      running = null;
    });
    return running;
  }
  return {
    dirty,
    edit(value: T) {
      latest = { value, serial: ++serial, scope: options.scope() };
      clearTimer();
      publish('pending');
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, options.delay ?? 800);
    },
    flush,
    start() {
      stopped = false;
    },
    stop() {
      stopped = true;
      requested = false;
      clearTimer();
    },
  };
}

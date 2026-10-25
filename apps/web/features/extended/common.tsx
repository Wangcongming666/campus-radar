'use client';
import { cloneElement, isValidElement, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocalState } from '@/lib/use-local-state';
import { WorkspaceSaveErrors } from '@/components/workspace-save-errors';
export function useLocal<T>(key: string, initial: T, validate?: (value: unknown) => value is T) {
  return useLocalState(key, initial, validate);
}
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  type ControlProps = { 'aria-label'?: string; label?: string };
  const control = isValidElement<ControlProps>(children)
    ? cloneElement(
        children,
        children.type === Pick
          ? { label: children.props.label ?? label }
          : { 'aria-label': children.props['aria-label'] ?? label },
      )
    : children;
  return (
    <label className={cn('grid gap-2 text-xs text-muted-foreground', className)}>
      <span>{label}</span>
      {control}
    </label>
  );
}
export function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? (process.env.NEXT_PUBLIC_DATA_MODE === 'api' ? '保存后同步到当前账户的数据库记录。' : '产品交互预览 · 使用虚构演示数据')}</DialogDescription>
        </DialogHeader>
        <WorkspaceSaveErrors inline />
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function FilterButtons({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((x) => (
        <Button
          key={x}
          size="sm"
          variant={value === x ? 'default' : 'outline'}
          onClick={() => onChange(x)}
        >
          {x}
        </Button>
      ))}
    </div>
  );
}
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border/60 py-4 last:border-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-7 text-muted-foreground">
      <span className="mt-3 size-1 shrink-0 rounded-full bg-primary" />
      {children}
    </li>
  );
}

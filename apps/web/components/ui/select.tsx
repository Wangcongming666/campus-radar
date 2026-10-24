'use client';
import * as React from 'react';
import * as P from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
const Select = P.Root,
  SelectGroup = P.Group,
  SelectValue = P.Value;
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof P.Trigger>,
  React.ComponentPropsWithoutRef<typeof P.Trigger>
>(({ className, children, ...props }, ref) => (
  <P.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <P.Icon asChild>
      <ChevronDown className="size-3.5 opacity-50" />
    </P.Icon>
  </P.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';
const SelectContent = React.forwardRef<
  React.ElementRef<typeof P.Content>,
  React.ComponentPropsWithoutRef<typeof P.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-overlay',
        position === 'popper' && 'translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <P.ScrollUpButton className="flex items-center justify-center py-1">
        <ChevronUp className="size-4" />
      </P.ScrollUpButton>
      <P.Viewport
        className={cn(
          'p-1',
          position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </P.Viewport>
      <P.ScrollDownButton className="flex items-center justify-center py-1">
        <ChevronDown className="size-4" />
      </P.ScrollDownButton>
    </P.Content>
  </P.Portal>
));
SelectContent.displayName = 'SelectContent';
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof P.Label>,
  React.ComponentPropsWithoutRef<typeof P.Label>
>(({ className, ...props }, ref) => (
  <P.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold', className)} {...props} />
));
SelectLabel.displayName = 'SelectLabel';
const SelectItem = React.forwardRef<
  React.ElementRef<typeof P.Item>,
  React.ComponentPropsWithoutRef<typeof P.Item>
>(({ className, children, ...props }, ref) => (
  <P.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-2 pr-8 text-xs outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <P.ItemText>{children}</P.ItemText>
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <P.ItemIndicator>
        <Check className="size-3" />
      </P.ItemIndicator>
    </span>
  </P.Item>
));
SelectItem.displayName = 'SelectItem';
const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof P.Separator>,
  React.ComponentPropsWithoutRef<typeof P.Separator>
>(({ className, ...props }, ref) => (
  <P.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
));
SelectSeparator.displayName = 'SelectSeparator';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};

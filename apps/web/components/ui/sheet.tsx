'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
const Sheet = Primitive.Root,
  SheetTrigger = Primitive.Trigger,
  SheetClose = Primitive.Close;
const SheetContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content> & {
    side?: 'top' | 'bottom' | 'left' | 'right';
  }
>(({ side = 'right', className, children, ...props }, ref) => (
  <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <Primitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col gap-4 border bg-background p-6 shadow-overlay transition ease-in-out data-[state=open]:animate-in data-[state=open]:duration-300',
        side === 'right' &&
          'inset-y-0 right-0 h-full w-full sm:max-w-[560px] data-[state=open]:slide-in-from-right',
        side === 'left' && 'inset-y-0 left-0 h-full w-80 data-[state=open]:slide-in-from-left',
        side === 'bottom' &&
          'inset-x-0 bottom-0 rounded-t-panel data-[state=open]:slide-in-from-bottom',
        side === 'top' && 'inset-x-0 top-0 data-[state=open]:slide-in-from-top',
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Close className="absolute right-5 top-5 text-muted-foreground hover:text-foreground">
        <X className="size-4" />
        <span className="sr-only">关闭预览</span>
      </Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>
));
SheetContent.displayName = 'SheetContent';
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2', className)} {...props} />
);
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex gap-2', className)} {...props} />
);
const SheetTitle = Primitive.Title,
  SheetDescription = Primitive.Description;
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

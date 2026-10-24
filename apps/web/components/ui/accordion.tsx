'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
const Accordion = Primitive.Root;
const AccordionItem = React.forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item>
>(({ className, ...props }, ref) => (
  <Primitive.Item ref={ref} className={cn('border-b', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';
const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof Primitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof Primitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <Primitive.Header className="flex">
    <Primitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between gap-4 py-5 text-left text-sm font-medium transition-all hover:text-primary [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
    </Primitive.Trigger>
  </Primitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';
const AccordionContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, children, ...props }, ref) => (
  <Primitive.Content ref={ref} className="overflow-hidden text-sm text-muted-foreground" {...props}>
    <div className={cn('pb-5 pt-0', className)}>{children}</div>
  </Primitive.Content>
));
AccordionContent.displayName = 'AccordionContent';
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

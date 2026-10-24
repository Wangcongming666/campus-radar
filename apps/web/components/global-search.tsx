'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  BookOpen,
  FileQuestion,
  MessagesSquare,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { jobs, companies, experiences, questions, getCompany } from '@/lib/data';
import { allNav } from '@/lib/navigation';
import { useAllExperiences } from '@/lib/knowledge-local';
export function GlobalSearch({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const localExperiences = useAllExperiences();
  const [query, setQuery] = useState('');
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [open, setOpen]);
  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    router.push(path);
  };
  const includes = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="搜索岗位、公司、面经、题目…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>没有找到结果，换一个关键词试试。</CommandEmpty>
        <CommandGroup heading="岗位">
          {jobs
            .filter((job) =>
              includes(job.title + getCompany(job.companyId).name + job.tags.join(' ')),
            )
            .slice(0, 4)
            .map((job) => (
              <CommandItem
                key={job.id}
                value={`${job.id} ${job.title} ${getCompany(job.companyId).name} ${job.tags.join(' ')}`}
                onSelect={() => go(`/jobs?preview=job:${job.id}`)}
              >
                <BriefcaseBusiness />
                <span className="flex-1">{job.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {getCompany(job.companyId).name} · {job.city}
                </span>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="公司">
          {companies
            .filter((c) => includes(c.name + c.en))
            .slice(0, 3)
            .map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.en}`}
                onSelect={() => go(`/company/${c.id}`)}
              >
                <Building2 />
                {c.name}
                <span className="ml-auto text-[10px] text-muted-foreground">{c.en}</span>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="面经">
          {localExperiences
            .filter((e) => includes(e.title))
            .slice(0, 2)
            .map((e) => (
              <CommandItem
                key={e.id}
                value={e.title}
                onSelect={() => go(`/experiences?preview=experience:${e.id}`)}
              >
                <MessagesSquare />
                {e.title}
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="题库">
          {questions
            .filter((q) => includes(q.title + q.topic))
            .slice(0, 3)
            .map((q) => (
              <CommandItem
                key={q.id}
                value={q.title + q.topic}
                onSelect={() => go(`/questions?preview=question:${q.id}`)}
              >
                <FileQuestion />
                {q.title}
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="快捷跳转">
          {allNav
            .filter((n) => includes(n.label))
            .slice(0, query ? 5 : 3)
            .map((item) => (
              <CommandItem key={item.href} onSelect={() => go(item.href)} value={item.label}>
                <item.icon />
                {item.label}
                <ArrowRight className="ml-auto" />
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-3 border-t px-4 py-2 text-[10px] text-subtle">
        <span>↑↓ 选择</span>
        <span>↵ 打开</span>
        <span className="ml-auto">ESC 关闭 · 演示内容</span>
      </div>
    </CommandDialog>
  );
}

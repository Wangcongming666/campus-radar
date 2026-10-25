'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useKnowledgeLocal } from '@/lib/knowledge-local';
import { removeDiscussionThread, validateText } from '@/lib/knowledge-domain';
import { useRadarStore } from '@/lib/store';
import { useCampus } from '@/components/campus-provider';
type Comment = { id: string; parent?: string; name: string; content: string };
export function LocalDiscussion({ id }: { id: string }) {
  const [comments, save, error] = useKnowledgeLocal<Comment[]>(`discussion-${id}`, []);
  const [content, setContent] = useState('');
  const [reply, setReply] = useState<Comment | null>(null);
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const localName = useRadarStore((s) => s.userName);
  const { mode, user } = useCampus();
  const name = mode === 'api' ? user?.displayName || '同学' : localName;
  async function add() {
    if (saving) return;
    setSaving(true);
    try {
      const text = validateText(content, 1, 1000);
      if (
        await save((v) => [
          ...v,
          { id: crypto.randomUUID(), parent: reply?.id, name, content: text },
        ])
      ) {
        setContent('');
        setReply(null);
        setValidation('');
      }
    } catch (e) {
      setValidation((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">交流与讨论 · {comments.length}</h2>
      <p className="text-xs text-subtle">
        {mode === 'api'
          ? '讨论记录保存到你的账号，不会向其他用户发送消息。'
          : '仅保存于本机，不会向其他用户发送。'}
      </p>
      {comments.length ? (
        comments.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border border-border p-4 ${c.parent ? 'ml-5' : ''}`}
          >
            <p className="text-xs text-primary">
              {c.name}
              {c.parent &&
                ` · 回复 ${comments.find((p) => p.id === c.parent)?.name ?? '已删除评论'}`}
            </p>
            <p className="my-3 whitespace-pre-wrap break-words text-sm leading-7">{c.content}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setReply(c)}>
                回复
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save((v) => removeDiscussionThread(v, c.id))}
              >
                删除评论
              </Button>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-subtle py-5">还没有讨论，写下第一条思考。</p>
      )}
      {reply && (
        <p className="text-xs">
          回复 {reply.name}
          <Button size="sm" variant="ghost" onClick={() => setReply(null)}>
            取消回复
          </Button>
        </p>
      )}
      <Textarea
        aria-label="讨论内容"
        value={content}
        maxLength={1000}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的思考或准备心得…"
      />
      <p className="text-xs text-subtle">{content.length} / 1000</p>
      {(error || validation) && (
        <p role="alert" className="text-sm text-destructive">
          {error || validation}
        </p>
      )}
      <Button disabled={saving} onClick={add}>
        {saving ? '正在保存…' : '保存讨论'}
      </Button>
    </section>
  );
}

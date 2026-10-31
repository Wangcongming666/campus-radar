import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, ChevronDown, RefreshCw } from "lucide-react";
import { Button, Empty, Field } from "../components/ui";
import { bankName, bankQuestions, composePractice, difficultyLabels, questionBanks, type PracticeQuestion } from "./practice-banks";
import "./practice-setup.css";

export type PracticeInput = { role: string; questionIds: string[]; durationSeconds: number };
export function PracticeSetup({ questions, initialRole, busy, onStart }: {
  questions: PracticeQuestion[]; initialRole: string; busy: boolean; onStart: (input: PracticeInput) => Promise<void>;
}) {
  const banks = questionBanks(questions);
  const firstRole = banks.find(bank => bank.role === initialRole)?.role ?? banks[0]?.role ?? "";
  const [role, setRole] = useState(firstRole);
  const [count, setCount] = useState("10");
  const [duration, setDuration] = useState("30");
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => composePractice(questions, firstRole, { count: 10 }).map(q => q.id));
  const [localError, setLocalError] = useState("");
  const bank = banks.find(bank => bank.role === role);
  const eligible = bankQuestions(questions, role, { difficulty, topic });
  const visible = eligible.filter(q => `${q.title} ${q.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const selected = questions.filter(q => selectedIds.includes(q.id));
  const levels = [...new Set(selected.map(q => q.difficulty))].map(value => difficultyLabels[value] ?? value);
  function compose(nextRole = role, nextCount = count, nextDifficulty = difficulty, nextTopic = topic) {
    setRole(nextRole); setCount(nextCount); setDifficulty(nextDifficulty); setTopic(nextTopic);
    setSelectedIds(composePractice(questions, nextRole, { count: Number(nextCount), difficulty: nextDifficulty, topic: nextTopic }).map(q => q.id));
    setLocalError("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) { setLocalError("练习时长请输入 5–120 之间的整数分钟。"); return; }
    if (!selectedIds.length) { setLocalError("请先选择题库并组题。"); return; }
    void onStart({ role, questionIds: selectedIds, durationSeconds: minutes * 60 });
  }
  if (!banks.length) return <Empty title="暂无可用题库" description="题库按已发布题目自动分类，题目发布后会显示在这里。" action={<Link to="/questions">前往面试题库</Link>}/>;
  return <section className="practice-setup" aria-label="按题库创建练习">
    <aside className="practice-banks">
      <h2><BookOpen aria-hidden="true" />选择题库</h2>
      <p>先选一个方向，批量组成一套练习。</p>
      <div className="practice-bank-list" role="group" aria-label="练习题库">
        {banks.map(item => <button type="button" key={item.role} className={`practice-bank${item.role === role ? " is-selected" : ""}`} aria-pressed={item.role === role} disabled={busy} onClick={() => { setQuery(""); compose(item.role, count, "", ""); }}>
          <span><strong>{item.name}</strong><small>{item.count} 道题 · {item.topics.length ? `${item.topics.length} 个知识点` : "综合练习"}</small></span>
          {item.role === role && <Check aria-hidden="true" />}
        </button>)}
      </div>
    </aside>
    <form className="practice-config" onSubmit={submit}>
      <header><h2>{bankName(role)}</h2><p>自动组题覆盖不同难度，也可以按知识点专项练习。</p></header>
      {!!bank?.topics.length && <div className="practice-bank-topics" aria-label="题库知识点">{bank.topics.slice(0, 6).map(tag => <span key={tag}>{tag}</span>)}{bank.topics.length > 6 && <span>等 {bank.topics.length} 个知识点</span>}</div>}
      <div className="practice-config-fields">
        <Field label="知识点"><select aria-label="知识点" className="input" disabled={busy} value={topic} onChange={e => compose(role, count, difficulty, e.target.value)}><option value="">综合练习</option>{bank?.topics.map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label="题目难度"><select aria-label="题目难度" className="input" disabled={busy} value={difficulty} onChange={e => compose(role, count, e.target.value, topic)}><option value="">混合难度</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="练习题量"><select aria-label="练习题量" className="input" disabled={busy} value={count} onChange={e => compose(role, e.target.value)}>{[5, 10, 20, 30].map(value => <option key={value} value={value}>{value} 题</option>)}</select></Field>
        <Field label="时长（分钟）"><input className="input" type="number" disabled={busy} min={5} max={120} step={1} value={duration} onChange={e => setDuration(e.target.value)} /></Field>
      </div>
      <div className="practice-composition">
        <div aria-live="polite"><strong>已选 {selectedIds.length} 题</strong><p>{levels.length ? `包含${levels.join("、")}题目` : "当前条件下暂无题目，请调整知识点或难度。"}{eligible.length > 0 && eligible.length < Number(count) ? ` 当前条件下共 ${eligible.length} 题，已全部选入。` : ""}</p></div>
        <Button onClick={() => compose()} disabled={busy || !eligible.length}><RefreshCw aria-hidden="true" />换一组题</Button>
      </div>
      <details className="practice-question-preview">
        <summary>查看题目并调整<span>{selectedIds.length} 题已选</span><ChevronDown aria-hidden="true" /></summary>
        <div className="practice-preview-tools"><input className="input" aria-label="搜索当前题目列表" placeholder="搜索题目名称或标签" value={query} onChange={e => setQuery(e.target.value)} /><Button size="sm" disabled={busy} onClick={() => setSelectedIds([])}>清空已选</Button></div>
        <div className="practice-question-list">{visible.map(question => <label key={question.id}><input type="checkbox" checked={selectedIds.includes(question.id)} disabled={busy || (!selectedIds.includes(question.id) && selectedIds.length >= 30)} onChange={e => { const checked = e.target.checked; setSelectedIds(ids => checked ? [...ids, question.id] : ids.filter(id => id !== question.id)); }} /><span>{question.title}<small>{difficultyLabels[question.difficulty]}{question.tags.length ? ` · ${question.tags.join("、")}` : ""}</small></span></label>)}</div>
        {!visible.length && <p className="muted">没有找到符合当前条件的题目。</p>}
        <p className="practice-preview-note">最多 30 题，按当前选中顺序出题；可取消或补选题目。</p>
      </details>
      {localError && <p role="alert">{localError}</p>}
      <div className="practice-start"><p>题目与回答保存在你的账号中。</p><Button type="submit" variant="primary" disabled={busy || !selectedIds.length}>{busy ? "正在创建练习…" : `开始练习（${selectedIds.length} 题）`}</Button></div>
    </form>
  </section>;
}

'use client';
import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { useCampus } from './campus-provider';
import { loadCatalog } from '@/lib/catalog';
export function CatalogImport() {
  const { adapter, mode } = useCampus();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [jsonMode, setJsonMode] = useState(false),
    [json, setJson] = useState(''),
    [company, setCompany] = useState(''),
    [title, setTitle] = useState(''),
    [role, setRole] = useState(''),
    [city, setCity] = useState(''),
    [url, setUrl] = useState(''),
    [year, setYear] = useState(String(new Date().getFullYear() + 1)),
    [description, setDescription] = useState(''),
    [type, setType] = useState('campus'),
    [deadline, setDeadline] = useState(''),
    [error, setError] = useState('');
  if (mode !== 'api') return null;
  async function save() {
    setBusy(true);
    setError('');
    try {
      const input = jsonMode
        ? JSON.parse(json)
        : {
            jobs: [
              {
                company: { name: company },
                title,
                role,
                cities: city
                  .split(/[,，、]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
                canonicalUrl: url,
                recruitmentType: type,
                graduationYears: year.split(/[,，、]/).map(Number),
                descriptionMd: description,
                ...(deadline
                  ? {
                      deadlineAt: new Date(deadline + 'T23:59:59+08:00').toISOString(),
                      deadlinePrecision: 'date',
                    }
                  : {}),
              },
            ],
          };
      const result = await adapter.importJobs(input);
      await loadCatalog(adapter);
      toast.success(`已保存 ${result.inserted} 个真实岗位`);
      setOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : '录入失败，请重试。';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        录入岗位
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto p-6 sm:max-w-xl">
          <SheetTitle>录入真实岗位</SheetTitle>
          <SheetDescription>
            保存来源链接以便核验。手动记录会标明“官方未核验”，不会启用自动采集。
          </SheetDescription>
          <div className="flex gap-2 my-5">
            <Button
              variant={!jsonMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setJsonMode(false)}
            >
              手动填写
            </Button>
            <Button
              variant={jsonMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setJsonMode(true)}
            >
              <Upload />
              JSON 导入
            </Button>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {jsonMode ? (
              <label className="block space-y-2 text-sm">
                岗位 JSON
                <textarea
                  className={inputClass + ' min-h-96 font-mono'}
                  required
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder={
                    '{"jobs":[{"company":{"name":"公司名称"},"title":"岗位名称","role":"frontend","cities":["北京"],"canonicalUrl":"https://…","recruitmentType":"campus","graduationYears":[2027],"descriptionMd":"真实岗位说明"}]}'
                  }
                />
                <span className="text-xs text-muted-foreground">
                  支持最多 100 个岗位；任一条校验失败时整批不保存。已有公司请用 company.id（UUID）。
                </span>
              </label>
            ) : (
              <>
                <label className="block space-y-2 text-sm">
                  公司名称
                  <input
                    className={inputClass}
                    required
                    maxLength={150}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  岗位名称
                  <input
                    className={inputClass}
                    required
                    maxLength={300}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  岗位方向
                  <input
                    className={inputClass}
                    required
                    placeholder="例如 frontend / 前端开发"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  工作城市
                  <input
                    className={inputClass}
                    required
                    placeholder="多个城市用逗号分隔"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  真实来源链接
                  <input
                    className={inputClass}
                    required
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  届别
                  <input
                    className={inputClass}
                    required
                    placeholder="例如 2027"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  招聘类型
                  <select
                    className={inputClass}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="campus">校招</option>
                    <option value="internship">实习</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm">
                  截止日期（可选）
                  <input
                    className={inputClass}
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  岗位说明
                  <textarea
                    className={inputClass + ' min-h-40'}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit" className="w-full">
              {busy ? '正在保存…' : '保存到云端目录'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

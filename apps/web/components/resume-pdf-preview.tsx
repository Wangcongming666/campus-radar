'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Draws locally stored PDFs directly; native PDF plugins are never required. */
export function ResumePdfPreview({ source, name }: { source: string; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const measure = () => {
      if (container.current) setWidth(Math.max(160, container.current.clientWidth - 24));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setPageNumber(1);
    setZoom(1);
    setLoading(true);
    setError('');
    void import('pdfjs-dist')
      .then(async (pdfjs) => {
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        task = pdfjs.getDocument({
          url: source,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          wasmUrl: '/pdfjs/wasm/',
        });
        const document = await task.promise;
        if (cancelled) {
          await task.destroy();
          return;
        }
        setPdf(document);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('PDF 预览加载失败。可在下方查看提取文字，或下载原件后打开。');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (task) void task.destroy().catch(() => undefined);
    };
  }, [source]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    setDrawing(true);
    setError('');
    canvas.current?.removeAttribute('data-rendered-page');
    void pdf
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const original = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(width / original.width, 1.6) * zoom;
        const viewport = page.getViewport({ scale: scale * ratio });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        target.style.width = `${viewport.width / ratio}px`;
        target.style.height = `${viewport.height / ratio}px`;
        render = page.render({ canvas: target, viewport });
        await render.promise;
        if (!cancelled) {
          target.dataset.renderedPage = String(pageNumber);
          setDrawing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('此页绘制失败。可尝试调整缩放，或查看提取文字与原文件。');
          setDrawing(false);
        }
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, pageNumber, zoom, width]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="PDF上一页"
            disabled={!pdf || pageNumber <= 1 || loading}
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-24 text-center font-mono text-xs" aria-label="PDF页码">
            {pdf ? `第 ${pageNumber} / ${pdf.numPages} 页` : '载入页码…'}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="PDF下一页"
            disabled={!pdf || pageNumber >= pdf.numPages || loading}
            onClick={() => setPageNumber((page) => Math.min(pdf?.numPages ?? page, page + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          缩放
          <select
            aria-label="PDF缩放"
            className="rounded-md border border-input bg-background p-2 text-foreground"
            disabled={!pdf || loading}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value * 100}%{value === 1 ? '（适应宽度）' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        ref={container}
        className="relative max-h-[760px] min-h-64 overflow-auto rounded-lg border border-border bg-slate-100 p-3"
      >
        {(loading || drawing) && (
          <p
            role="status"
            className="sticky left-0 top-0 z-10 rounded-md bg-background/95 px-3 py-2 text-xs text-muted-foreground"
          >
            {loading ? '正在读取 PDF…' : `正在绘制第 ${pageNumber} 页…`}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-background p-4 text-sm leading-7 text-destructive"
          >
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${name} · 第 ${pageNumber} 页`}
          data-pdf-page={pageNumber}
          className={`mx-auto block bg-white shadow-sm ${!pdf || error ? 'hidden' : ''}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        原件在本机逐页绘制，支持前后翻页与缩放。提取文字和校正入口位于下方。
      </p>
    </div>
  );
}

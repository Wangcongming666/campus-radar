'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isApiMode } from '@/lib/api/workspace-client';
import {
  deleteInterviewFile,
  downloadInterviewBlob,
  readInterviewFile,
  saveInterviewFile,
} from '@/lib/interview-repository';

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type LocalRecognition = {
  processLocally?: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: SpeechResult[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = {
  new (): LocalRecognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
};
function recognitionConstructor(): RecognitionConstructor | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Uses only on-device recognition. Browsers offering server recognition fall back to text. */
export function InterviewSpeechControls({
  text,
  onTranscript,
  disabled = false,
}: {
  text: string;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const recognition = useRef<LocalRecognition | null>(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  useEffect(() => {
    const Constructor = recognitionConstructor();
    if (Constructor) {
      const instance = new Constructor();
      setAvailable('processLocally' in instance);
    }
    return () => {
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (disabled) {
      recognition.current?.stop();
      window.speechSynthesis?.cancel();
    }
  }, [disabled]);
  useEffect(() => {
    // Stop the previous question before its late recognition results can reach the next answer.
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setListening(false);
  }, [text]);
  async function listen() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setMessage('当前浏览器不支持离线语音识别，请使用文字输入。');
      return;
    }
    try {
      const instance = new Constructor();
      if (!('processLocally' in instance))
        throw new Error('当前浏览器只提供在线语音识别。为保持本地处理，请使用文字输入。');
      if (Constructor.available) {
        const status = await Constructor.available({ langs: ['zh-CN'], processLocally: true });
        if (status !== 'available')
          throw new Error('浏览器尚未安装中文离线语音包，请在浏览器设置中安装，或继续文字输入。');
      }
      instance.processLocally = true;
      instance.lang = 'zh-CN';
      instance.continuous = true;
      instance.interimResults = false;
      instance.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++)
          if (event.results[i].isFinal) callback.current(event.results[i][0].transcript);
      };
      instance.onerror = (event) => {
        setMessage(`离线语音无法继续（${event.error}），已保留文字，请继续编辑。`);
        setListening(false);
      };
      instance.onend = () => setListening(false);
      recognition.current = instance;
      instance.start();
      setListening(true);
      setMessage('正在使用浏览器离线识别，识别文字可继续修改。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '语音不可用，请使用文字输入。');
      setListening(false);
    }
  }
  function speak() {
    if (!window.speechSynthesis) {
      setMessage('此浏览器不支持朗读。');
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.localService && v.lang.toLowerCase().startsWith('zh'));
    if (!voice) {
      setMessage('没有可用的本机中文语音，请阅读题目文字。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    setMessage('正在使用本机语音朗读。');
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={speak}>
          <Volume2 className="size-3" />
          朗读题目
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !available}
          onClick={listen}
        >
          {listening ? <Square className="size-3" /> : <Mic className="size-3" />}
          {listening ? '停止识别' : '语音作答（离线）'}
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground" role="status">
        {message ||
          (available
            ? '离线语音需要浏览器中文语言包和麦克风授权。'
            : '此浏览器没有可用的本地语音识别，文字作答可正常使用。')}
      </p>
    </div>
  );
}

export function InterviewAudio({
  audioId,
  audioName,
  onChange,
}: {
  audioId?: string;
  audioName?: string;
  onChange: (value: { audioId?: string; audioName?: string }) => Promise<boolean>;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ blob: Blob; name: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const callback = useRef(onChange);
  callback.current = onChange;
  const previousId = useRef(audioId);
  previousId.current = audioId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    let disposed = false,
      objectUrl = '';
    setUrl('');
    if (pending) {
      objectUrl = URL.createObjectURL(pending.blob);
      setUrl(objectUrl);
    } else if (audioId)
      readInterviewFile(audioId)
        .then((file) => {
          if (disposed) return;
          if (!file) {
            setError('录音文件已不存在，可重新录制或导入。');
            return;
          }
          objectUrl = URL.createObjectURL(file.blob);
          setUrl(objectUrl);
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioId, pending]);
  async function storeAudio(blob: Blob, name: string) {
    setBusy(true);
    setError('');
    setPending({ blob, name });
    const id = `audio-${crypto.randomUUID()}`;
    try {
      await saveInterviewFile(id, blob, name);
      if (!mounted.current || !(await callback.current({ audioId: id, audioName: name }))) {
        await deleteInterviewFile(id);
        return;
      }
      const oldId = previousId.current;
      if (oldId && oldId !== id) await deleteInterviewFile(oldId);
      setPending(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '录音保存失败，可重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('此浏览器无法录音，请导入音频文件或直接输入复盘文字。');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const next = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      next.onerror = () => {
        setError('录音中断，请重新录制或导入音频。');
        setRecording(false);
        stream.current?.getTracks().forEach((track) => track.stop());
      };
      next.onstop = () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' });
        if (!blob.size) {
          setError('没有录到声音，请检查麦克风后重试。');
          return;
        }
        if (blob.size > 30 * 1024 * 1024) {
          setPending({ blob, name: '面试录音.webm' });
          setError('录音超过 30 MB，请下载原件并分段导入。');
          return;
        }
        void storeAudio(
          blob,
          `面试录音_${new Date().toISOString().replace(/[:.]/g, '-')}.${next.mimeType.includes('mp4') ? 'm4a' : next.mimeType.includes('ogg') ? 'ogg' : 'webm'}`,
        );
      };
      recorder.current = next;
      next.start(1000);
      setSeconds(0);
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError('无法使用麦克风，请检查浏览器授权，或导入已有音频。');
    }
  }
  async function download() {
    try {
      if (pending) {
        downloadInterviewBlob(pending.blob, pending.name);
        return;
      }
      const file = audioId ? await readInterviewFile(audioId) : undefined;
      if (!file) throw new Error('没有可下载的录音。');
      downloadInterviewBlob(file.blob, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败');
    }
  }
  async function remove() {
    if (!audioId) {
      setPending(null);
      return;
    }
    if (!(await callback.current({ audioId: undefined, audioName: undefined }))) return;
    try {
      await deleteInterviewFile(audioId);
      setPending(null);
    } catch (e) {
      await callback.current({ audioId, audioName });
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-xs leading-6 text-muted-foreground">
        点击录制才会申请麦克风权限，
        {isApiMode() ? '音频保存在当前账户的私有存储中。' : '音频仅保存在本机。'}
        离开此页前请停止并保存录音。导入音频不会自动识别文字，可手动转写或导入 TXT。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={recording ? 'destructive' : 'outline'}
          disabled={busy}
          onClick={() => (recording ? recorder.current?.stop() : void start())}
        >
          {recording ? <Square className="size-3" /> : <Mic className="size-3" />}
          {recording
            ? `停止并保存录音 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : '开始录音'}
        </Button>
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          导入音频（最多 30 MB）
          <Input
            aria-label="导入面试音频"
            className="mt-2"
            type="file"
            accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg"
            disabled={recording || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!file.size || file.size > 30 * 1024 * 1024) {
                setError('请选择非空且不超过 30 MB 的音频。');
                return;
              }
              if (
                !file.type.startsWith('audio/') &&
                !/\.(webm|mp3|wav|m4a|ogg|mp4)$/i.test(file.name)
              ) {
                setError('文件格式不受支持，请选择音频文件。');
                return;
              }
              void storeAudio(file, file.name);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs">
          正在保存音频…
        </p>
      )}
      {url && (
        <div className="space-y-3">
          <p className="break-all text-xs text-muted-foreground">
            {pending?.name ?? audioName}
            {pending ? ' · 尚未持久保存' : ' · 已保存'}
          </p>
          <audio controls src={url} className="w-full" aria-label="面试录音回放" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="size-3" />
              下载录音
            </Button>
            {pending && (
              <Button
                size="sm"
                disabled={busy || pending.blob.size > 30 * 1024 * 1024}
                onClick={() => void storeAudio(pending.blob, pending.name)}
              >
                重试保存录音
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy || recording} onClick={remove}>
              <Trash2 className="size-3" />
              删除录音
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

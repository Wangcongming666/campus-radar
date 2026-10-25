import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { authenticate, rateLimit } from './auth';
import { transaction, type Db } from './db';
import { ApiError, json, notFound } from './http';

const MB = 1024 * 1024;
const fileId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\p{L}\p{N}_.:@-]+$/u);
const invalid = () => new ApiError(422, 'INVALID_FILE', '文件类型、名称或文件头无效。');
const oversized = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', '简历上限 10 MB，录音上限 30 MB。');
export function inspectPrivateFile(bytes: Buffer, providedType: string, name: string): string {
  const type = providedType.toLowerCase().split(';')[0].trim();
  if (!bytes.length) throw invalid();
  const head = bytes.subarray(0, 64);
  let mime: string;
  if (type === 'application/pdf') {
    if (head.subarray(0, 5).toString('ascii') !== '%PDF-' || !/\.pdf$/i.test(name)) throw invalid();
    mime = 'application/pdf';
  } else if (['text/plain', 'text/markdown', 'text/x-markdown'].includes(type)) {
    if (!/\.(txt|md|markdown)$/i.test(name)) throw invalid();
    if (bytes.length > 10 * MB) throw oversized();
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw invalid();
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw invalid();
    mime = type === 'text/x-markdown' ? 'text/markdown' : type;
  } else if (type === 'audio/webm') {
    if (
      head.length < 4 ||
      head.readUInt32BE(0) !== 0x1a45dfa3 ||
      !bytes.subarray(0, 4096).includes(Buffer.from('webm'))
    )
      throw invalid();
    mime = type;
  } else if (['audio/ogg', 'application/ogg'].includes(type)) {
    if (
      head.subarray(0, 4).toString('ascii') !== 'OggS' ||
      (!bytes.subarray(0, 4096).includes(Buffer.from('OpusHead')) &&
        !bytes.subarray(0, 4096).includes(Buffer.from('vorbis')))
    )
      throw invalid();
    mime = 'audio/ogg';
  } else if (['audio/wav', 'audio/x-wav', 'audio/wave'].includes(type)) {
    if (
      head.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      head.subarray(8, 12).toString('ascii') !== 'WAVE'
    )
      throw invalid();
    mime = 'audio/wav';
  } else if (['audio/mp4', 'audio/x-m4a'].includes(type)) {
    if (head.subarray(4, 8).toString('ascii') !== 'ftyp') throw invalid();
    mime = 'audio/mp4';
  } else if (type === 'audio/mpeg') {
    if (
      head.subarray(0, 3).toString('ascii') !== 'ID3' &&
      !(head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
    )
      throw invalid();
    mime = type;
  } else throw invalid();
  if (bytes.length > (mime.startsWith('audio/') ? 30 : 10) * MB) throw oversized();
  return mime;
}
function root(): string {
  // Private user attachments are runtime data on a persistent mount, never build inputs.
  return resolve(/* turbopackIgnore: true */ process.env.PRIVATE_FILE_ROOT || join(process.cwd(), '.data', 'private-files'));
}
function filePath(storageKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) throw notFound();
  return join(/* turbopackIgnore: true */ root(), storageKey);
}
function metadata(row: Record<string, any>) {
  return {
    id: row.client_key,
    name: row.name,
    type: row.mime_type,
    size: Number(row.size_bytes),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('Private file cleanup deferred.');
  }
}
async function multipart(request: Request): Promise<{ bytes: Buffer; name: string; type: string }> {
  if (!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get('content-type') ?? ''))
    throw invalid();
  const max = 30 * MB + 64 * 1024;
  if (Number(request.headers.get('content-length')) > max) throw oversized();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw oversized();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw invalid();
  }
  if (
    [...form.keys()].some((key) => !['file', 'name'].includes(key)) ||
    form.getAll('file').length !== 1 ||
    form.getAll('name').length > 1
  )
    throw invalid();
  const file = form.get('file'),
    customName = form.get('name');
  if (!(file instanceof File) || (customName !== null && typeof customName !== 'string'))
    throw invalid();
  const name = (typeof customName === 'string' ? customName : file.name).trim();
  if (
    !name ||
    name.length > 300 ||
    /[\x00-\x1f\x7f/\\]/.test(name) ||
    name === '.' ||
    name === '..'
  )
    throw invalid();
  const bytes = Buffer.from(await file.arrayBuffer());
  return { bytes, name, type: inspectPrivateFile(bytes, file.type, name) };
}
async function withFiles(
  request: Request,
  write: boolean,
  run: (sql: Db, userId: string) => Promise<Response>,
): Promise<Response> {
  const session = await authenticate(request, write);
  return transaction(session.userId, async (sql) => {
    if (write) {
      await sql`select pg_advisory_xact_lock(hashtextextended(${'files:' + session.userId},0))`;
      await rateLimit(sql, 'files:' + session.userId, 30, 60);
    }
    const response = await run(sql, session.userId);
    response.headers.set('X-CSRF-Token', session.csrf);
    return response;
  });
}
export async function files(request: Request): Promise<Response> {
  return withFiles(request, false, async (sql, userId) => {
    const rows =
      await sql`select client_key,name,mime_type,size_bytes,updated_at from private_files where user_id=${userId}::uuid order by updated_at desc,id limit 1001`;
    if (rows.length > 1000) throw new ApiError(422, 'FILE_LIMIT', '文件数量超过限制。');
    return json({ data: rows.map(metadata) });
  });
}
export async function privateFile(request: Request, id: string): Promise<Response> {
  if (!fileId.safeParse(id).success) throw notFound();
  // Authenticate and CSRF-check before buffering a multipart upload or touching disk.
  if (request.method === 'PUT') {
    const session = await authenticate(request, true);
    const input = await multipart(request);
    const storageKey = randomBytes(32).toString('hex'),
      destination = filePath(storageKey),
      temporary = destination + '.tmp';
    let oldKey: string | undefined;
    try {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      await writeFile(temporary, input.bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
      const result = await transaction(session.userId, async (sql) => {
        await sql`select pg_advisory_xact_lock(hashtextextended(${'files:' + session.userId},0))`;
        await rateLimit(sql, 'files:' + session.userId, 30, 60);
        const old =
          await sql`select storage_key from private_files where user_id=${session.userId}::uuid and client_key=${id} for update`;
        oldKey = old[0]?.storage_key;
        if (
          !oldKey &&
          (
            await sql`select count(*)::int count from private_files where user_id=${session.userId}::uuid`
          )[0].count >= 1000
        )
          throw new ApiError(422, 'FILE_LIMIT', '最多保存 1000 个文件。');
        const rows =
          await sql`insert into private_files(user_id,client_key,storage_key,name,mime_type,size_bytes,file_hash) values(${session.userId}::uuid,${id},${storageKey},${input.name},${input.type},${input.bytes.length},${createHash('sha256').update(input.bytes).digest('hex')}) on conflict(user_id,client_key) do update set storage_key=excluded.storage_key,name=excluded.name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,file_hash=excluded.file_hash,updated_at=now() returning client_key,name,mime_type,size_bytes,updated_at`;
        return metadata(rows[0]);
      });
      if (oldKey) await safeUnlink(filePath(oldKey));
      const response = json({ data: result });
      response.headers.set('X-CSRF-Token', session.csrf);
      return response;
    } catch (error) {
      await safeUnlink(temporary);
      await safeUnlink(destination);
      throw error;
    }
  }
  if (request.method === 'DELETE') {
    let storageKey: string | undefined;
    const response = await withFiles(request, true, async (sql, userId) => {
      const rows =
        await sql`delete from private_files where user_id=${userId}::uuid and client_key=${id} returning storage_key`;
      storageKey = rows[0]?.storage_key;
      return new Response(null, { status: 204 });
    });
    if (storageKey) await safeUnlink(filePath(storageKey));
    return response;
  }
  return withFiles(request, false, async (sql, userId) => {
    const rows =
      await sql`select storage_key,name,mime_type,size_bytes,updated_at from private_files where user_id=${userId}::uuid and client_key=${id}`;
    if (!rows[0]) throw notFound();
    let bytes: Buffer;
    try {
      bytes = await readFile(/* turbopackIgnore: true */ filePath(rows[0].storage_key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw notFound();
      throw error;
    }
    if (bytes.length !== Number(rows[0].size_bytes)) throw notFound();
    const fallback = rows[0].name.replace(/[^\x20-\x7e]|["\\;]/g, '_');
    return new Response(new Uint8Array(bytes), {
      headers: {
        'X-File-Name': encodeURIComponent(rows[0].name),
        'Last-Modified': new Date(rows[0].updated_at).toUTCString(),
        'Content-Type': rows[0].mime_type,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(rows[0].name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      },
    });
  });
}

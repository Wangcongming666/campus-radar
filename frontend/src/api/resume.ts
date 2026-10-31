import type { components } from "./generated";
import { apiRequest, ApiError } from "./auth";
export type Resume = components["schemas"]["Resume"];
export type PrivateFile = components["schemas"]["File"];
export type RuleReport = components["schemas"]["RuleReport"];
export type ResumeDiff = components["schemas"]["ResumeDiff"];
export type PageResult<T> = { data: T[]; page: components["schemas"]["Page"] };
async function page<T>(path: string, signal?: AbortSignal): Promise<PageResult<T>> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new ApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "无法加载记录。"); }
  return response.json() as Promise<PageResult<T>>;
}
export function listResumes(signal?: AbortSignal) { return page<Resume>("/api/v1/resumes?page=1&size=100", signal); }
export function listFiles(signal?: AbortSignal) { return page<PrivateFile>("/api/v1/files?page=1&size=100", signal); }
export function uploadResumeFile(file: File, key: string) { const form = new FormData(); form.set("purpose", "RESUME"); form.set("file", file); return apiRequest<PrivateFile>("/api/v1/files", { method: "POST", headers: { "Idempotency-Key": key }, body: form }); }
export function createResume(body: components["schemas"]["ResumeInput"], key: string) { return apiRequest<Resume>("/api/v1/resumes", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) }); }
export function patchResume(resume: Resume, patch: Omit<components["schemas"]["ResumePatch"], "version">) { return apiRequest<Resume>(`/api/v1/resumes/${resume.id}`, { method: "PATCH", body: JSON.stringify({ version: resume.version, ...patch }) }); }
export function deleteResume(resume: Resume) { return apiRequest<void>(`/api/v1/resumes/${resume.id}?version=${resume.version}`, { method: "DELETE" }); }
export function deleteFile(file: PrivateFile) { return apiRequest<void>(`/api/v1/files/${file.id}?version=${file.version}`, { method: "DELETE" }); }
export function diagnoseResume(resumeId: string, jobId?: string) { return apiRequest<RuleReport>("/api/v1/resume-diagnoses", { method: "POST", body: JSON.stringify({ resumeId, ...(jobId ? { jobId } : {}) }) }); }
export function diffResumes(baseId: string, compareId: string) { return apiRequest<ResumeDiff>(`/api/v1/resumes/diff?baseId=${encodeURIComponent(baseId)}&compareId=${encodeURIComponent(compareId)}`); }
export async function downloadPrivateFile(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/v1/files/${encodeURIComponent(id)}/download`, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) { const body = await response.json().catch(() => null); throw new ApiError(response.status, body?.error?.code ?? "DOWNLOAD_FAILED", body?.error?.message ?? "无法读取文件。"); }
  return response.blob();
}

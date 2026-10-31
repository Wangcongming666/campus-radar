import type { components } from "./generated";
import { apiRequest } from "./auth";
export type Application = components["schemas"]["Application"];
export type Board = components["schemas"]["Board"];
export type ApplicationStage = Application["stage"];
export type ApplicationMutation = components["schemas"]["ApplicationMutation"];
export const stageLabels: Record<ApplicationStage, string> = { PENDING: "待投递", APPLIED: "已投递", ASSESSMENT: "笔试测评", INTERVIEW_1: "一面", INTERVIEW_2: "二面", HR: "HR 面", OFFER: "已获 Offer", CLOSED: "已结束" };
const base = "/api/v1/applications";
export function fetchBoard(signal?: AbortSignal) { return apiRequest<Board>(`${base}/board`, { signal }); }
export function fetchArchived(page = 1, signal?: AbortSignal) { return apiRequest<Application[]>(`${base}?archived=true&page=${page}&size=20`, { signal }); }
export function createApplication(jobId: string, key = crypto.randomUUID()) { return apiRequest<ApplicationMutation>(base, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ jobId }) }); }
export function patchApplication(id: string, body: components["schemas"]["ApplicationPatch"]) { return apiRequest<ApplicationMutation>(`${base}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
export function moveApplication(id: string, body: components["schemas"]["ApplicationMove"], key = crypto.randomUUID()) { return apiRequest<ApplicationMutation>(`${base}/${encodeURIComponent(id)}/move`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) }); }
export function undoApplication(id: string, body: components["schemas"]["ApplicationUndo"], key = crypto.randomUUID()) { return apiRequest<ApplicationMutation>(`${base}/${encodeURIComponent(id)}/undo`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) }); }
export function fetchApplicationHistory(id: string, signal?: AbortSignal) { return apiRequest<components["schemas"]["StageEvent"][]>(`${base}/${encodeURIComponent(id)}/history?page=1&size=100`, { signal }); }
export function favoriteJob(id: string) { return apiRequest<components["schemas"]["Favorite"]>(`/api/v1/favorites/JOB/${encodeURIComponent(id)}`, { method: "PUT" }); }

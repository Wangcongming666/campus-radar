import { route } from '@/server/http';
import { importAccountData } from '@/server/account-data';
export const runtime = 'nodejs';
export const POST = route(importAccountData);

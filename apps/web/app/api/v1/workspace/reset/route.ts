import { route } from '@/server/http';
import { resetAccountData } from '@/server/account-data';
export const runtime = 'nodejs';
export const POST = route(resetAccountData);

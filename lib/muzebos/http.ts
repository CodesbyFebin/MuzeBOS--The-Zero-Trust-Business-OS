import { cookieFromHeader, readAuthState, sessionIsValid } from '@/lib/auth';
import { isLoopbackHost, hostnameOf, SESSION_COOKIE } from '@/lib/auth-gate';
import { BusinessError } from './store';

/** Defense in depth for new commerce endpoints; never trust forwarded headers. */
export function businessAccess(req: Request) {
  const host=req.headers.get('host') || new URL(req.url).host;
  const auth=readAuthState();
  if(auth.configured) {
    if(!sessionIsValid(cookieFromHeader(req.headers.get('cookie'),SESSION_COOKIE))) throw new BusinessError('Operator authentication required',401);
  } else if(!isLoopbackHost(hostnameOf(host))) throw new BusinessError('Configure an operator password locally before remote access',503);
  if(!['GET','HEAD'].includes(req.method)) {
    const origin=req.headers.get('origin');
    const expected=process.env.MUZEBOS_ORIGIN || `${new URL(req.url).protocol}//${host}`;
    if(!origin || origin!==expected || req.headers.get('sec-fetch-site')==='cross-site') throw new BusinessError('Same-origin request required',403);
  }
}

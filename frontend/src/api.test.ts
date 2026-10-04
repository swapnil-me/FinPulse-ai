import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const user={id:1,name:'One',email:'one@example.com'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{vi.resetModules();vi.stubEnv('VITE_API_URL','https://api.example');vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Session-aware client',()=>{
  it('discards a late response after sign-out',async()=>{
    let resolve!:(response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
    const {api,clearToken}=await import('./api');
    const pending=api.transactions();
    clearToken();resolve(json([{id:99,note:'old account data'}]));
    await expect(pending).rejects.toThrow('session changed');
  });
  it('shares a single refresh across simultaneous requests',async()=>{
    let resolve!:(response:Response)=>void;
    const fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
    const {restoreSession}=await import('./api');
    const first=restoreSession();const second=restoreSession();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(json({access_token:'new-token',user}));
    expect(await first).toEqual(user);expect(await second).toEqual(user);
    expect(fetch.mock.calls[0]).toBeDefined();
  });
  it('retries once after an expired access token, using the renewed token',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({access_token:'renewed',user})).mockResolvedValueOnce(json([]));vi.stubGlobal('fetch',fetch);
    const {api}=await import('./api');
    expect(await api.transactions()).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer renewed');
  });
  it('never retries an ambiguous failed write',async()=>{
    const fetch=vi.fn().mockRejectedValue(new TypeError('Network failed'));vi.stubGlobal('fetch',fetch);
    const {api}=await import('./api');
    await expect(api.remove(1)).rejects.toThrow('Network failed');expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('clears the workspace when both access and refresh are invalid',async()=>{
    const fetch=vi.fn().mockResolvedValue(json({},401));vi.stubGlobal('fetch',fetch);
    const {api,SESSION_CLEARED}=await import('./api');const onClear=vi.fn();window.addEventListener(SESSION_CLEARED,onClear);
    await expect(api.transactions()).rejects.toThrow('session has ended');expect(onClear).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(2);
  });
});

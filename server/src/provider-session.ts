import type pg from 'pg';

export class LookupLimitError extends Error {
  statusCode=429;
  constructor(message:string, readonly retryAfterSeconds:number){super(message)}
}
export const GOOGLE_MONTHLY_LOOKUP_CAP=2000;
/** Short-lived, bounded instance memory only. Identical concurrent checks share one provider call. */
export function providerSession(pool:Pick<pg.Pool,'query'>, send:(url:string,body:unknown,mask:string)=>Promise<unknown>,ttlMs=180_000){
 const entries=new Map<string,{result:Promise<unknown>;expires:number}>();
 return (url:string,body:unknown,mask:string,kind:'places'|'routes'):Promise<any>=>{
  const key=JSON.stringify([url,body,mask,kind]),now=Date.now(),cached=entries.get(key);
  if(cached&&cached.expires>now)return cached.result;
  if(cached)entries.delete(key);
  if(entries.size>=256)entries.delete(entries.keys().next().value!);
  const result=(async()=>{
   const {rows:[q]}=await pool.query(`INSERT INTO request_quotas(owner_hash,category,window_at,used) VALUES('project',$1,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',1) ON CONFLICT(owner_hash,category,window_at) DO UPDATE SET used=request_quotas.used+1 RETURNING used`,['google-'+kind]);
   if(q.used>GOOGLE_MONTHLY_LOOKUP_CAP)throw new LookupLimitError('Map search capacity is used up for this month. Your current openings are still available.',3600);
   return send(url,body,mask);
  })();
  const entry={result,expires:now+ttlMs};entries.set(key,entry);
  const timer=setTimeout(()=>{if(entries.get(key)===entry)entries.delete(key)},ttlMs);timer.unref();
  void result.catch(()=>{clearTimeout(timer);if(entries.get(key)===entry)entries.delete(key)});
  return result;
 };
}

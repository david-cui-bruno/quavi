export type Fix = {timestamp:number;coords:{latitude:number;longitude:number;accuracy:number}};
export const FIX_MAX_AGE:number;
export function usableFix(fix:Fix|undefined,now?:number):boolean;
export function canArrive(distance:number,fix:Fix|undefined,now?:number,radius?:number):boolean;
export function locationMessage(error:unknown):string;
export type LocationAdapter = {permission(prompt:boolean):Promise<string>;watch(callback:(position:Fix|null,error?:unknown)=>void):Promise<string>;clear(id:string):Promise<void>};
export function beginLocationWatch(adapter:LocationAdapter,prompt:boolean,onPosition:(position:Fix)=>void,onError:(error:unknown)=>void):()=>void;

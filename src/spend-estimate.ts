import type {Story} from './data'
/** Deliberately broad, LLM-authored category ranges, not live prices or admission quotes.
 * USD per person for an optional casual purchase; browsing-only stops can be free. */
export function estimateSpend(story: Pick<Story,'chapters'>) {
  const range=(kind:string):[number,number]=>{
    if(/park|garden|public art|landmark|library|walk/i.test(kind))return [0,0]
    if(/book|record|shop|gallery/i.test(kind))return [0,25]
    if(/museum|cinema|theat|arcade/i.test(kind))return [10,30]
    if(/restaurant|meal/i.test(kind))return [15,35]
    if(/bar|pub|wine/i.test(kind))return [10,25]
    if(/café|cafe|coffee|tea|bakery|ice cream|quick bite/i.test(kind))return [5,15]
    return [0,20]
  }
  const [lo,hi]=story.chapters.reduce(([a,b],c)=>{const [x,y]=range(c.kind??c.place);return[a+x,b+y]},[0,0])
  return {low:lo,high:hi,currency:'USD' as const,label:hi===0?'Free':`$${lo}–${hi}`}
}

/** Category artwork is an illustration, never a substitute photograph of a particular venue. */
export function VenuePlaceholder({ kind }: { kind?: string }) {
  const category = /gallery|museum|art/i.test(kind ?? '') ? 'gallery'
    : /book|library/i.test(kind ?? '') ? 'books'
    : /cafe|café|coffee|bakery|restaurant|food/i.test(kind ?? '') ? 'cafe'
    : /park|garden|outdoor/i.test(kind ?? '') ? 'park' : 'place';
  return <svg className={`venue-placeholder ${category}`} viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <rect width="120" height="120" fill="var(--soft)" />
    {category === 'gallery' ? <>
      <rect x="23" y="27" width="74" height="67" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
      <path d="M32 85V58L60 36H88V85Z" fill="var(--orange-p)" />
      <circle cx="73" cy="51" r="13" fill="var(--yellow)" />
      <path d="M32 85 59 60 88 85" fill="var(--orange)" />
      <path d="M18 102H102" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
    </> : category === 'books' ? <>
      <path d="M22 37H48Q60 37 60 45Q60 37 72 37H98V91H72Q60 91 60 99Q60 91 48 91H22Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 45V99M31 50H48M31 61H48M71 50H89M71 61H89" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M77 37V76L84 70 91 76V37" fill="var(--orange)" />
    </> : category === 'cafe' ? <>
      <path d="M83 49H91A13 13 0 0 1 91 75H84" stroke="var(--ink)" strokeWidth="3" />
      <path d="M30 48H85V77A15 15 0 0 1 70 92H45A15 15 0 0 1 30 77Z" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="3" />
      <path d="M22 99H95M46 25V35M62 21V35M78 25V35" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
    </> : category === 'park' ? <>
      <circle cx="60" cy="51" r="30" fill="var(--yellow)" />
      <path d="M35 72 60 29 85 72Z" fill="var(--orange)" />
      <path d="M60 67V99M34 99H86" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
    </> : <>
      <path d="M60 99S30 72 30 49A30 30 0 0 1 90 49C90 72 60 99 60 99Z" fill="var(--orange)" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="60" cy="49" r="12" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="3" />
    </>}
  </svg>;
}

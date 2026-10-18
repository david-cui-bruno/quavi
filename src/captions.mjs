/** Draft only from explicit personal evidence. Never invent purchases, companions, emotions or completed visits. */
export function groundedCaptions(story, notes = [], tone = "Cozy") {
  const concise = (value) => {
    const chars = Array.from(value.trim().replace(/\s+/g, " "));
    return chars.length > 280
      ? chars.slice(0, 277).join("") + "…"
      : chars.join("");
  };
  return story.chapters.map((chapter, i) => {
    const note =
      story.moments?.[i]?.note?.trim() ||
      notes.find((n) => n.chapter === i && n.note?.trim())?.note;
    if (note) return `${chapter.place}: ${concise(note)}`;
    if (!story.arrivedStops?.includes(i))
      return `On the plan: ${chapter.place}.`;
    if (tone === "Funny") return `Plot twist: ${chapter.place}.`;
    if (tone === "Dramatic") return `${chapter.place}. A chapter of its own.`;
    return `A pause at ${chapter.place}.`;
  });
}

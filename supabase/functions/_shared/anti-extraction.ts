const LEAK_MARKERS = [
  "system prompt",
  "instructions:",
  "you are a",
  "você é um",
  "knowledge base:",
  "## [",
  "do not reveal",
  "ignore previous",
];

export function detectLeak(text: string, kb: string): { leak: boolean; reason?: string } {
  const lower = text.toLowerCase();
  const matchedMarkers = LEAK_MARKERS.filter((m) => lower.includes(m));
  if (matchedMarkers.length >= 3) {
    return { leak: true, reason: `markers: ${matchedMarkers.join(",")}` };
  }

  // Long substring check: find contiguous KB segments in text
  if (text.length >= 200) {
    // Split text into 200-char windows with overlap
    for (let i = 0; i <= text.length - 200; i += 50) {
      const win = text.slice(i, i + 200);
      if (kb.includes(win)) return { leak: true, reason: "kb_substring" };
    }
    // Alternative: check if the text contains KB repeated (duplication detection)
    const kbCount = (text.match(new RegExp(kb.slice(0, 50), 'g')) || []).length;
    if (kbCount >= 2) return { leak: true, reason: "kb_duplication" };
  }
  return { leak: false };
}

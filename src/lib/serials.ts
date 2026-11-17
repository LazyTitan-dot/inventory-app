/** OCR suggestions are untrusted. Require explicit review before any write. */
export function serialCandidates(raw: string): string[] {
 const candidates: string[] = [];
 for (const line of raw.split(/\r?\n/)) {
   const match = line.match(/(?:S\/?N|SERIAL(?:\s*(?:NO|NUMBER|NÚMERO))?|N[ÚU]MERO\s+DE\s+SERIE)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._/-]{3,79})/i);
   if (match?.[1]) candidates.push(match[1]);
 }
 return [...new Set(candidates)];
}

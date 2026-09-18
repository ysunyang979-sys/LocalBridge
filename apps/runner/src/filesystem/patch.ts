import { LocalBridgeError, LocalBridgeErrorCode, type PatchReplacement } from "@localbridge/protocol";

function truncateForError(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}

function countOccurrences(text: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

export interface PatchApplyResult {
  updatedText: string;
  replacementsApplied: number;
}

/**
 * Sequentially applies search/replace patches in memory with strict single-match verification.
 * Fails if any replacement pattern is not found (PATCH_NOT_FOUND) or matches multiple times (PATCH_AMBIGUOUS).
 */
export function applyPatches(
  originalText: string,
  replacements: PatchReplacement[]
): PatchApplyResult {
  let currentText = originalText;

  for (let i = 0; i < replacements.length; i++) {
    const item = replacements[i]!;
    const occurrences = countOccurrences(currentText, item.search);

    if (occurrences === 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PATCH_NOT_FOUND,
        `Replacement ${i + 1}/${replacements.length} failed: search block not found: "${truncateForError(item.search)}"`
      );
    }

    if (occurrences > 1) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PATCH_AMBIGUOUS,
        `Replacement ${i + 1}/${replacements.length} failed: search block is ambiguous (${occurrences} matches found): "${truncateForError(item.search)}"`
      );
    }

    // Replace exactly one occurrence
    const idx = currentText.indexOf(item.search);
    currentText =
      currentText.slice(0, idx) +
      item.replace +
      currentText.slice(idx + item.search.length);
  }

  return {
    updatedText: currentText,
    replacementsApplied: replacements.length,
  };
}

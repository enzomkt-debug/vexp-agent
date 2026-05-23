// Rough estimate: ~4 characters per token (safe for Portuguese text)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

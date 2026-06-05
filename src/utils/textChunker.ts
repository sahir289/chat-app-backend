function normalizeBlock(block: string): string {
  return block
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitIntoLogicalBlocks(text: string): string[] {
  const normalized = normalizeBlock(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function splitOversizedBlock(block: string, targetChunkSize: number): string[] {
  if (block.length <= targetChunkSize) {
    return [block];
  }

  const sentenceParts = block
    .split(/(?<=[.!?])\s+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (sentenceParts.length <= 1) {
    const pieces: string[] = [];
    for (let index = 0; index < block.length; index += targetChunkSize) {
      pieces.push(block.slice(index, index + targetChunkSize).trim());
    }
    return pieces.filter((piece) => piece.length > 0);
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentenceParts) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > targetChunkSize && current) {
      chunks.push(current.trim());
      current = sentence;
      continue;
    }

    current = candidate;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function takeTrailingOverlap(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) {
    return text;
  }

  const slice = text.slice(-overlap);
  const startIndex = slice.indexOf(" ");
  return startIndex >= 0 ? slice.slice(startIndex + 1).trim() : slice.trim();
}

export function chunkText(
  text: string,
  targetChunkSize: number = 1200,
  overlap: number = 180
): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const logicalBlocks = splitIntoLogicalBlocks(text)
    .flatMap((block) => splitOversizedBlock(block, targetChunkSize))
    .filter((block) => block.length > 0);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const block of logicalBlocks) {
    const candidate = currentChunk ? `${currentChunk}\n\n${block}` : block;
    if (candidate.length > targetChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      const overlapText = takeTrailingOverlap(currentChunk, overlap);
      currentChunk = overlapText ? `${overlapText}\n\n${block}` : block;
      continue;
    }

    currentChunk = candidate;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 0 && text.trim().length > 0) {
    return [normalizeBlock(text)];
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

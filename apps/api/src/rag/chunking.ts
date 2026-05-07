import type { ChunkStrategy } from './types';

export interface Chunk {
  content: string;
  sectionPath: string | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

const APPROX_CHARS_PER_TOKEN = 4;

export function approxTokenCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_TOKEN));
}

export function chunkText(text: string, strategy: ChunkStrategy): Chunk[] {
  const cleaned = normalizeWhitespace(text);

  if (cleaned.length === 0) {
    return [];
  }

  if (strategy.type === 'markdown_first') {
    return chunkMarkdown(cleaned, strategy);
  }

  return chunkPlainText(cleaned, strategy, null);
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

interface MarkdownSection {
  headingPath: string[];
  content: string;
  charStart: number;
}

function chunkMarkdown(text: string, strategy: ChunkStrategy): Chunk[] {
  const sections = splitMarkdownSections(text);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    if (section.content.trim().length === 0) continue;

    const sectionPath = section.headingPath.length > 0
      ? section.headingPath.join(' > ')
      : null;

    const sectionChunks = chunkPlainText(section.content, strategy, sectionPath, section.charStart);

    chunks.push(...sectionChunks);
  }

  return chunks;
}

function splitMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split('\n');
  const sections: MarkdownSection[] = [];
  const headingStack: { level: number; title: string }[] = [];

  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];
  let currentCharStart = 0;
  let cursor = 0;

  const pushSection = (atChar: number) => {
    if (currentLines.length === 0) {
      currentCharStart = atChar;
      return;
    }
    sections.push({
      headingPath: [...currentHeadingPath],
      content: currentLines.join('\n').trim(),
      charStart: currentCharStart,
    });
    currentLines = [];
    currentCharStart = atChar;
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (headingMatch) {
      pushSection(cursor);

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      currentHeadingPath = headingStack.map((h) => h.title);
    } else {
      currentLines.push(line);
    }

    cursor += line.length + 1;
  }

  pushSection(cursor);

  return sections;
}

function chunkPlainText(
  text: string,
  strategy: ChunkStrategy,
  sectionPath: string | null,
  baseCharOffset = 0,
): Chunk[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const targetChars = strategy.target_tokens * APPROX_CHARS_PER_TOKEN;
  const overlapChars = Math.min(
    strategy.overlap_tokens * APPROX_CHARS_PER_TOKEN,
    Math.floor(targetChars / 2),
  );

  if (trimmed.length <= targetChars) {
    return [
      {
        content: trimmed,
        sectionPath,
        charStart: baseCharOffset,
        charEnd: baseCharOffset + trimmed.length,
        tokenCount: approxTokenCount(trimmed),
      },
    ];
  }

  const segments = splitIntoSegments(trimmed);
  const chunks: Chunk[] = [];

  let buffer = '';
  let bufferStart = 0;
  let cursor = 0;

  for (const segment of segments) {
    const candidate = buffer.length === 0 ? segment : `${buffer}\n${segment}`;

    if (candidate.length <= targetChars) {
      if (buffer.length === 0) {
        bufferStart = cursor;
      }
      buffer = candidate;
      cursor += segment.length + 1;
      continue;
    }

    if (buffer.length === 0) {
      const slices = sliceLongSegment(segment, targetChars, overlapChars);
      for (const slice of slices) {
        chunks.push({
          content: slice,
          sectionPath,
          charStart: baseCharOffset + cursor,
          charEnd: baseCharOffset + cursor + slice.length,
          tokenCount: approxTokenCount(slice),
        });
      }
      cursor += segment.length + 1;
      buffer = '';
      bufferStart = cursor;
      continue;
    }

    chunks.push({
      content: buffer,
      sectionPath,
      charStart: baseCharOffset + bufferStart,
      charEnd: baseCharOffset + bufferStart + buffer.length,
      tokenCount: approxTokenCount(buffer),
    });

    const overlap = overlapChars > 0 ? buffer.slice(-overlapChars) : '';
    buffer = overlap.length > 0 ? `${overlap}\n${segment}` : segment;
    bufferStart = bufferStart + Math.max(0, buffer.length - segment.length - overlap.length);
    bufferStart = cursor - overlap.length;
    cursor += segment.length + 1;
  }

  if (buffer.trim().length > 0) {
    chunks.push({
      content: buffer.trim(),
      sectionPath,
      charStart: baseCharOffset + bufferStart,
      charEnd: baseCharOffset + bufferStart + buffer.length,
      tokenCount: approxTokenCount(buffer),
    });
  }

  return chunks;
}

function splitIntoSegments(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs;
  }

  const sentences = splitIntoSentences(paragraphs[0] ?? text);
  if (sentences.length > 1) {
    return sentences;
  }

  return [text.trim()];
}

function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function sliceLongSegment(text: string, targetChars: number, overlapChars: number): string[] {
  const slices: string[] = [];
  const stride = Math.max(1, targetChars - overlapChars);

  for (let start = 0; start < text.length; start += stride) {
    const end = Math.min(text.length, start + targetChars);
    let sliceEnd = end;

    if (sliceEnd < text.length) {
      const lastSpace = text.lastIndexOf(' ', sliceEnd);
      if (lastSpace > start + Math.floor(targetChars / 2)) {
        sliceEnd = lastSpace;
      }
    }

    const slice = text.slice(start, sliceEnd).trim();
    if (slice.length > 0) {
      slices.push(slice);
    }

    if (sliceEnd >= text.length) break;
  }

  return slices;
}

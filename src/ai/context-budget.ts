export type ContextBlock = {
  prefix: string;
  content: string;
  suffix: string;
};

export type FittedContext = {
  text: string;
  truncatedChars: number;
};

const BLOCK_SEPARATOR = "\n\n";

function renderBlock(block: ContextBlock): string {
  return `${block.prefix}${block.content}${block.suffix}`;
}

export function fitContext(
  blocks: ContextBlock[],
  cap: number,
  onKept?: (index: number, chars: number) => void,
): FittedContext {
  const original = blocks.map(renderBlock).join(BLOCK_SEPARATOR);
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  const kept: string[] = [];
  let used = 0;

  for (const [index, block] of blocks.entries()) {
    const separator = kept.length ? BLOCK_SEPARATOR : "";
    const rendered = renderBlock(block);
    if (used + separator.length + rendered.length <= limit) {
      onKept?.(index, block.content.length);
      kept.push(rendered);
      used += separator.length + rendered.length;
      continue;
    }

    const available = limit - used - separator.length;
    const wrapperLength = block.prefix.length + block.suffix.length;
    if (available >= wrapperLength) {
      const contentLength = available - wrapperLength;
      onKept?.(index, contentLength);
      kept.push(
        `${block.prefix}${block.content.slice(0, contentLength)}${block.suffix}`,
      );
      used = limit;
    }
    break;
  }

  const text = kept.join(BLOCK_SEPARATOR);
  return {
    text,
    truncatedChars: original.length - text.length,
  };
}

export function contextTrimWarning(truncatedChars: number): string {
  return `Context limit reached — dropped ${Math.max(
    0,
    Math.round(truncatedChars),
  ).toLocaleString("en-US")} characters. The document/selection was kept before attachments.`;
}

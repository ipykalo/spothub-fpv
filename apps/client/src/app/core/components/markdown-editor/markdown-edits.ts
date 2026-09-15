/**
 * Markdown formatting as plain text transforms: what a toolbar button does to
 * the text and the selection, with no DOM in sight. `applyEdit` is the one
 * place a textarea is touched.
 */

/** A textarea's text and what is selected in it. */
export interface TextSelection {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/** Replace `start`–`end` with `text`, then select `selectStart`–`selectEnd` of the result. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly selectStart: number;
  readonly selectEnd: number;
}

const HEADING = /^#{1,6} /;
const QUOTE = /^> ?/;
const BULLET = /^[-*+] /;
const NUMBERED = /^\d+\. /;
/** Any list marker, so switching a bulleted list to a numbered one replaces rather than stacks. */
const LIST = /^(?:[-*+]|\d+\.) /;

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'link'
  | 'heading'
  | 'quote'
  | 'bulletList'
  | 'numberedList'
  | 'code'
  | 'codeBlock';

/** What each toolbar action does to the selection. */
export function editFor(action: MarkdownAction, selection: TextSelection): TextEdit {
  switch (action) {
    case 'bold':
      return wrap(selection, '**', '**', 'bold text');
    case 'italic':
      return wrap(selection, '_', '_', 'italic text');
    case 'code':
      return wrap(selection, '`', '`', 'code');
    case 'link':
      return link(selection);
    case 'heading':
      return prefixLines(selection, () => '## ', HEADING, HEADING);
    case 'quote':
      return prefixLines(selection, () => '> ', QUOTE, QUOTE);
    case 'bulletList':
      return prefixLines(selection, () => '- ', BULLET, LIST);
    case 'numberedList':
      return prefixLines(selection, (index) => `${String(index + 1)}. `, NUMBERED, LIST);
    case 'codeBlock':
      return codeBlock(selection);
  }
}

/**
 * Wraps the selection in markers, or unwraps it when it is already wrapped.
 * With nothing selected, inserts a placeholder and selects it for typing over.
 */
export function wrap(
  { value, start, end }: TextSelection,
  before: string,
  after: string,
  placeholder: string,
): TextEdit {
  const selected = value.slice(start, end);
  const outerStart = start - before.length;

  if (
    selected &&
    outerStart >= 0 &&
    value.slice(outerStart, start) === before &&
    value.slice(end, end + after.length) === after
  ) {
    return {
      start: outerStart,
      end: end + after.length,
      text: selected,
      selectStart: outerStart,
      selectEnd: outerStart + selected.length,
    };
  }

  const inner = selected || placeholder;

  return {
    start,
    end,
    text: `${before}${inner}${after}`,
    selectStart: start + before.length,
    selectEnd: start + before.length + inner.length,
  };
}

/**
 * Gives every line the selection touches a prefix — or, when they all carry
 * this kind of marker already (`same`), takes it away. `strip` matches every
 * marker the new one replaces, so a numbered list becomes a bulleted one
 * rather than gaining a second marker.
 */
export function prefixLines(
  { value, start, end }: TextSelection,
  prefixFor: (index: number) => string,
  same: RegExp,
  strip: RegExp,
): TextEdit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  // A selection ending just after a newline does not reach into the next line.
  const lastChar = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = value.indexOf('\n', lastChar);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const allMarked = lines.every((line) => same.test(line));

  const text = lines
    .map((line, index) =>
      allMarked
        ? line.replace(strip, '')
        : `${prefixFor(index)}${line.replace(strip, '')}`,
    )
    .join('\n');

  return {
    start: lineStart,
    end: lineEnd,
    text,
    selectStart: lineStart,
    selectEnd: lineStart + text.length,
  };
}

/** `[text](url)`, with the URL selected so it can be pasted straight over. */
export function link({ value, start, end }: TextSelection): TextEdit {
  const label = value.slice(start, end) || 'link text';
  const url = 'https://';
  const text = `[${label}](${url})`;
  const urlStart = start + label.length + 3;

  return { start, end, text, selectStart: urlStart, selectEnd: urlStart + url.length };
}

/** A fenced block on lines of its own, around the selection or a placeholder. */
export function codeBlock({ value, start, end }: TextSelection): TextEdit {
  const inner = value.slice(start, end) || 'code';
  const lead = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const trail = end < value.length && value[end] !== '\n' ? '\n' : '';
  const open = `${lead}\`\`\`\n`;
  const text = `${open}${inner}\n\`\`\`${trail}`;

  return {
    start,
    end,
    text,
    selectStart: start + open.length,
    selectEnd: start + open.length + inner.length,
  };
}

/** Inserts text at the selection, as its own paragraph, leaving the caret after it. */
export function insertBlock(
  { value, start, end }: TextSelection,
  block: string,
): TextEdit {
  const text = `${blankLineBefore(value, start)}${block}${blankLineAfter(value, end)}`;
  const lead = blankLineBefore(value, start);
  const caret = start + lead.length + block.length;

  return { start, end, text, selectStart: caret, selectEnd: caret };
}

/** The newlines needed before `at` for what follows to start a paragraph of its own. */
function blankLineBefore(value: string, at: number): string {
  if (at === 0 || value.slice(Math.max(0, at - 2), at) === '\n\n') {
    return '';
  }

  return value[at - 1] === '\n' ? '\n' : '\n\n';
}

/** The newlines needed after `at` for what comes after to stay a paragraph of its own. */
function blankLineAfter(value: string, at: number): string {
  if (at >= value.length) {
    return '';
  }

  return value[at] === '\n' ? '\n' : '\n\n';
}

/** The textarea's current text and selection. */
export function selectionOf(textarea: HTMLTextAreaElement): TextSelection {
  return {
    value: textarea.value,
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
  };
}

/**
 * Applies an edit where the person is typing, so it can be undone with
 * Ctrl+Z like anything typed. Falls back to `setRangeText` where the browser
 * refuses; either way an `input` event tells the form the value changed.
 */
export function applyEdit(textarea: HTMLTextAreaElement, edit: TextEdit): void {
  textarea.focus();
  textarea.setSelectionRange(edit.start, edit.end);

  const inserted =
    edit.text !== '' &&
    // `execCommand` is deprecated, but it is still the only way to change a
    // textarea that keeps the change in the browser's own undo history.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    textarea.ownerDocument.execCommand('insertText', false, edit.text);

  if (!inserted) {
    textarea.setRangeText(edit.text, edit.start, edit.end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  textarea.setSelectionRange(edit.selectStart, edit.selectEnd);
}

/**
 * Replaces the first occurrence of `search` without moving focus or the
 * caret — for an upload finishing while the person is typing somewhere else.
 * False when `search` is no longer there, because they deleted it.
 */
export function replaceQuietly(
  textarea: HTMLTextAreaElement,
  search: string,
  replacement: string,
): boolean {
  const at = textarea.value.indexOf(search);

  if (at === -1) {
    return false;
  }

  const { selectionStart, selectionEnd } = textarea;
  const shift = (position: number): number =>
    position > at ? position + replacement.length - search.length : position;

  textarea.setRangeText(replacement, at, at + search.length, 'preserve');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  if (textarea.ownerDocument.activeElement === textarea) {
    textarea.setSelectionRange(shift(selectionStart), shift(selectionEnd));
  }

  return true;
}

import { describe, expect, it } from 'vitest';

import {
  type MarkdownAction,
  type TextEdit,
  type TextSelection,
  editFor,
} from './markdown-edits';

/**
 * What each toolbar button does to the text and to what stays selected — the
 * whole editor, as plain string transforms. The selection matters as much as
 * the text: a button that inserts a placeholder has to leave it selected, or
 * the next keystroke lands in the wrong place.
 */
describe('editFor', () => {
  /** The text a selection becomes once the edit is applied. */
  const apply = (selection: TextSelection, edit: TextEdit): string =>
    selection.value.slice(0, edit.start) + edit.text + selection.value.slice(edit.end);

  /** What ends up selected afterwards, which is what the next keystroke replaces. */
  const selected = (selection: TextSelection, edit: TextEdit): string =>
    apply(selection, edit).slice(edit.selectStart, edit.selectEnd);

  /** A selection of `word` inside `value`; with no word, the caret sits at the end. */
  const at = (value: string, word?: string): TextSelection => {
    const start = word === undefined ? value.length : value.indexOf(word);

    return { value, start, end: word === undefined ? start : start + word.length };
  };

  const run = (
    action: MarkdownAction,
    selection: TextSelection,
  ): { text: string; selection: string } => {
    const edit = editFor(action, selection);

    return { text: apply(selection, edit), selection: selected(selection, edit) };
  };

  describe('wrapping', () => {
    it('wraps what is selected', () => {
      expect(run('bold', at('hello world', 'world'))).toEqual({
        text: 'hello **world**',
        selection: 'world',
      });
      expect(run('italic', at('hello world', 'world')).text).toBe('hello _world_');
      expect(run('code', at('hello world', 'world')).text).toBe('hello `world`');
    });

    it('inserts a placeholder when nothing is selected, ready to type over', () => {
      expect(run('bold', at('hello '))).toEqual({
        text: 'hello **bold text**',
        selection: 'bold text',
      });
      expect(run('italic', at('')).selection).toBe('italic text');
      expect(run('code', at('')).selection).toBe('code');
    });

    it('unwraps text that is already wrapped, rather than wrapping it twice', () => {
      expect(run('bold', at('hello **world**', 'world'))).toEqual({
        text: 'hello world',
        selection: 'world',
      });
    });

    it('does not mistake one marker for another', () => {
      // The selection sits inside italics, so bold wraps rather than unwraps.
      expect(run('bold', at('hello _world_', 'world')).text).toBe('hello _**world**_');
    });
  });

  describe('links', () => {
    it('uses the selection as the label and leaves the URL selected to paste over', () => {
      expect(run('link', at('see the build log', 'build log'))).toEqual({
        text: 'see the [build log](https://)',
        selection: 'https://',
      });
    });

    it('writes a placeholder label when nothing is selected', () => {
      expect(run('link', at('')).text).toBe('[link text](https://)');
    });
  });

  describe('line prefixes', () => {
    it('marks the line the caret is on, without needing a selection', () => {
      expect(run('heading', at('The frame', 'frame')).text).toBe('## The frame');
      expect(run('quote', at('Measure twice', 'twice')).text).toBe('> Measure twice');
    });

    it('takes the marker away when every line already has one', () => {
      expect(run('heading', at('## The frame', 'frame')).text).toBe('The frame');
      expect(run('quote', at('> Measure twice', 'twice')).text).toBe('Measure twice');
    });

    it('marks every line the selection touches', () => {
      const selection = at('arms\nmotors\nprops', 'arms\nmotors\nprops');

      expect(run('bulletList', selection).text).toBe('- arms\n- motors\n- props');
    });

    it('numbers a numbered list from one, line by line', () => {
      const selection = at('arms\nmotors\nprops', 'arms\nmotors\nprops');

      expect(run('numberedList', selection).text).toBe('1. arms\n2. motors\n3. props');
    });

    it('replaces one kind of list marker with the other rather than stacking them', () => {
      const bulleted = at('- arms\n- motors', '- arms\n- motors');

      expect(run('numberedList', bulleted).text).toBe('1. arms\n2. motors');

      const numbered = at('1. arms\n2. motors', '1. arms\n2. motors');

      expect(run('bulletList', numbered).text).toBe('- arms\n- motors');
    });

    it('leaves the lines around the selection alone', () => {
      const value = 'intro\narms\nmotors\nend';
      const selection = {
        value,
        start: value.indexOf('arms'),
        end: value.indexOf('\nend'),
      };

      expect(run('bulletList', selection).text).toBe('intro\n- arms\n- motors\nend');
    });

    it('does not reach into the next line when a selection ends on a line break', () => {
      const value = 'arms\nmotors';
      const selection = { value, start: 0, end: 5 };

      expect(run('bulletList', selection).text).toBe('- arms\nmotors');
    });

    it('marks a partly-marked selection instead of clearing it', () => {
      const value = '- arms\nmotors';
      const selection = { value, start: 0, end: value.length };

      expect(run('bulletList', selection).text).toBe('- arms\n- motors');
    });
  });

  describe('blocks', () => {
    it('fences a code block on lines of its own and selects what is inside', () => {
      expect(
        run('codeBlock', at('set dshot_bidir = ON', 'set dshot_bidir = ON')),
      ).toEqual({
        text: '```\nset dshot_bidir = ON\n```',
        selection: 'set dshot_bidir = ON',
      });
    });

    it('breaks the line first when the caret is mid-paragraph', () => {
      expect(run('codeBlock', at('the tune: ')).text).toBe('the tune: \n```\ncode\n```');
    });

    it('drops in a table with its first heading selected to type over', () => {
      const result = run('table', at(''));

      expect(result.text).toBe(
        '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |',
      );
      expect(result.selection).toBe('Column 1');
    });

    it('gives the table a blank line of its own when text is already there', () => {
      const result = run('table', at('Most builds start with the frame.'));

      expect(result.text).toBe(
        'Most builds start with the frame.\n\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |',
      );
      expect(result.selection).toBe('Column 1');
    });
  });
});

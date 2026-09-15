import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { type MarkdownAction, applyEdit, editFor, selectionOf } from './markdown-edits';

interface ToolbarButton {
  readonly action: MarkdownAction | 'image';
  readonly icon: string;
  readonly label: string;
}

const BUTTONS: readonly ToolbarButton[] = [
  { action: 'bold', icon: 'format_bold', label: 'Bold (Ctrl+B)' },
  { action: 'italic', icon: 'format_italic', label: 'Italic (Ctrl+I)' },
  { action: 'link', icon: 'link', label: 'Link (Ctrl+K)' },
  { action: 'numberedList', icon: 'format_list_numbered', label: 'Numbered list' },
  { action: 'bulletList', icon: 'format_list_bulleted', label: 'Bulleted list' },
  { action: 'heading', icon: 'title', label: 'Heading' },
  { action: 'quote', icon: 'format_quote', label: 'Quote' },
  { action: 'code', icon: 'code', label: 'Inline code' },
  { action: 'codeBlock', icon: 'data_object', label: 'Code block' },
  { action: 'image', icon: 'image', label: 'Image' },
];

const SHORTCUTS: Readonly<Partial<Record<string, MarkdownAction>>> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
};

/**
 * Presenter: formatting buttons for a Markdown text box.
 *
 * It writes Markdown into the textarea it is given, as someone typing would —
 * so the form bound to that textarea sees an ordinary input, and Ctrl+Z undoes
 * a button press. Images are not its business: the button only asks, and
 * whoever owns the upload answers.
 */
@Component({
  selector: 'sh-markdown-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './markdown-toolbar.html',
  styleUrl: './markdown-toolbar.scss',
  host: { role: 'toolbar', 'aria-label': 'Formatting' },
})
export class MarkdownToolbar {
  /** The textarea the buttons write into. */
  readonly target = input.required<HTMLTextAreaElement>();
  readonly disabled = input(false);

  readonly imageRequested = output();

  protected readonly buttons = BUTTONS;

  constructor() {
    // Ctrl+B, Ctrl+I and Ctrl+K in the text box, as in every editor.
    effect((onCleanup) => {
      const textarea = this.target();

      const onKeydown = (event: KeyboardEvent): void => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
          return;
        }

        const action = SHORTCUTS[event.key.toLowerCase()];

        if (action) {
          event.preventDefault();
          this.apply(action);
        }
      };

      textarea.addEventListener('keydown', onKeydown);
      onCleanup(() => {
        textarea.removeEventListener('keydown', onKeydown);
      });
    });
  }

  protected press(button: ToolbarButton): void {
    if (button.action === 'image') {
      this.imageRequested.emit();
    } else {
      this.apply(button.action);
    }
  }

  private apply(action: MarkdownAction): void {
    const textarea = this.target();
    applyEdit(textarea, editFor(action, selectionOf(textarea)));
  }
}

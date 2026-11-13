import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from '@angular/core';

/** How large it is drawn: beside a comment, a card's byline, a page's byline, the account page. */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Readonly<Record<AvatarSize, string>> = {
  sm: 'size-6 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-10 text-base',
  xl: 'size-20 text-3xl',
};

/**
 * Presenter: a pilot's face beside their name — the photo they uploaded, or
 * the first letter of their name in a circle of the theme's colour. Never
 * their Google photo: this site loads nothing from Google.
 *
 * Decorative: the name always stands next to it, so it says nothing to a
 * screen reader. A photo that fails to load falls back to the letter.
 */
@Component({
  selector: 'sh-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
})
export class Avatar {
  readonly name = input<string | null>(null);
  readonly photoUrl = input<string | null>(null);
  readonly size = input<AvatarSize>('md');

  protected readonly initial = computed(() =>
    (this.name() ?? 'Pilot').trim().charAt(0).toUpperCase(),
  );
  protected readonly sizeClasses = computed(() => SIZES[this.size()]);

  /** Back to trying the photo whenever a different one arrives. */
  protected readonly failed = linkedSignal({
    source: this.photoUrl,
    computation: () => false,
  });
}

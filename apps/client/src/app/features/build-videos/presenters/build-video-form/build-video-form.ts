import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { CreateBuildVideoDto } from '@spothub/shared';

import { readVideoDraft } from './video-draft';

/**
 * Presenter: add a YouTube video to a build. Says up front that only YouTube
 * links are taken, and checks the link as it is pasted with the same schema
 * the API applies — so anything else is refused before it is sent.
 */
@Component({
  selector: 'sh-build-video-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './build-video-form.html',
  styleUrl: './build-video-form.scss',
})
export class BuildVideoForm {
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly added = output<CreateBuildVideoDto>();

  protected readonly link = signal('');
  protected readonly title = signal('');
  protected readonly draft = computed(() => readVideoDraft(this.link(), this.title()));

  protected onLink(event: Event): void {
    this.link.set((event.target as HTMLInputElement).value);
  }

  protected onTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  /** The container closes the form after a save, which is what empties it. */
  protected submit(): void {
    const value = this.draft().value;

    if (value && !this.saving()) {
      this.added.emit(value);
    }
  }
}

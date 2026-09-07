import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  BUILD_CLASS_LABELS,
  BUILD_STATUS_LABELS,
  BuildClass,
  BuildStatus,
  VISIBILITY_LABELS,
  Visibility,
  createBuildSchema,
  type BuildDto,
  type CreateBuildDto,
} from '@spothub/shared';

/**
 * Presenter: owns the form and its validation, nothing else. It never saves —
 * it emits a value the container has already been told is valid, so the same
 * form can be driven by a create route, an edit route or a future dialog.
 */
@Component({
  selector: 'sh-build-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './build-form.html',
  styleUrl: './build-form.scss',
})
export class BuildForm {
  readonly build = input<BuildDto | null>(null);
  readonly isEdit = input(false);
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly saved = output<CreateBuildDto>();
  readonly cancelled = output();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly classes = Object.values(BuildClass);
  protected readonly statuses = Object.values(BuildStatus);
  protected readonly visibilities = Object.values(Visibility);
  protected readonly classLabels = BUILD_CLASS_LABELS;
  protected readonly statusLabels = BUILD_STATUS_LABELS;
  protected readonly visibilityLabels = VISIBILITY_LABELS;

  private readonly validationError = signal<string | null>(null);

  /** Whatever the container reported wins; local validation fills the gap. */
  protected readonly message = computed(
    () => this.errorMessage() ?? this.validationError(),
  );

  protected readonly form = this.fb.group({
    // `Validators.required` is a static function that never reads `this`; the
    // unbound-method rule cannot tell the difference.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    name: ['', [Validators.required, Validators.maxLength(80)]],
    buildClass: [null as BuildClass | null],
    status: [BuildStatus.Planning as BuildStatus],
    visibility: [Visibility.Private as Visibility],
    weightG: [null as number | null],
    hasGps: [false],
    descriptionMd: [''],
  });

  constructor() {
    effect(() => {
      const build = this.build();

      if (!build) {
        return;
      }

      this.form.patchValue({
        name: build.name,
        buildClass: build.buildClass,
        status: build.status,
        visibility: build.visibility,
        weightG: build.weightG,
        hasGps: build.hasGps,
        descriptionMd: build.descriptionMd ?? '',
      });
    });
  }

  protected submit(): void {
    this.validationError.set(null);

    // The same schema the API validates against, so the two cannot disagree
    // about what a valid build looks like.
    const raw = this.form.getRawValue();
    const parsed = createBuildSchema.safeParse({
      ...raw,
      descriptionMd: raw.descriptionMd || null,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.validationError.set(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    this.saved.emit(parsed.data);
  }
}

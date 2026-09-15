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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  SPOT_ACCESS_LABELS,
  SPOT_HAZARD_LABELS,
  SPOT_TERRAIN_LABELS,
  SpotAccess,
  SpotHazard,
  SpotTerrain,
  VISIBILITY_LABELS,
  Visibility,
  createSpotSchema,
  type CreateSpotDto,
  type SpotDto,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { type ChoiceOption, choicesFrom } from '../../../../core/components/choice-option';
import {
  DIFFICULTY_LABELS,
  type LatLng,
  SPOT_ACCESS_STYLES,
  SPOT_TERRAIN_ICONS,
} from '../../spot-style';
import { SpotMap } from '../spot-map/spot-map';

/**
 * Presenter: owns the form and its validation, and the little map the pin is
 * placed on. It never saves — a valid `CreateSpotDto` goes up, and the
 * container decides create versus update.
 */
@Component({
  selector: 'sh-spot-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Autocomplete,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    SpotMap,
  ],
  templateUrl: './spot-form.html',
  styleUrl: './spot-form.scss',
})
export class SpotForm {
  readonly spot = input<SpotDto | null>(null);
  /** A point picked on the map before the form opened. */
  readonly initialPoint = input<LatLng | null>(null);
  readonly isEdit = input(false);
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);

  readonly saved = output<CreateSpotDto>();
  readonly cancelled = output();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly terrainOptions = choicesFrom(
    Object.values(SpotTerrain),
    SPOT_TERRAIN_LABELS,
    SPOT_TERRAIN_ICONS,
  );

  protected readonly accessOptions = Object.values(SpotAccess).map((access) => ({
    value: access,
    label: SPOT_ACCESS_LABELS[access],
    icon: SPOT_ACCESS_STYLES[access].icon,
  }));

  protected readonly difficultyOptions: readonly ChoiceOption<number>[] = [1, 2, 3, 4, 5].map(
    (value) => ({ value, label: DIFFICULTY_LABELS[value] ?? String(value) }),
  );

  protected readonly visibilityOptions = choicesFrom(Object.values(Visibility), VISIBILITY_LABELS);

  protected readonly hazardOptions = Object.values(SpotHazard).map((hazard) => ({
    value: hazard,
    label: SPOT_HAZARD_LABELS[hazard],
  }));

  protected readonly form = this.fb.group({
    name: [''],
    lat: [null as number | null],
    lng: [null as number | null],
    locality: [''],
    terrain: [null as SpotTerrain | null],
    access: [SpotAccess.Unknown as SpotAccess],
    difficulty: [null as number | null],
    hazards: [[] as SpotHazard[]],
    visibility: [Visibility.Private as Visibility],
    descriptionMd: [''],
    accessNotesMd: [''],
  });

  /** The pin, kept in step with the two coordinate fields. */
  protected readonly point = signal<LatLng | null>(null);

  private readonly validationError = signal<string | null>(null);

  protected readonly message = computed(() => this.errorMessage() ?? this.validationError());

  /** Saved from a GPS fix with only a placeholder name so far. */
  protected readonly isDraft = computed(() => this.spot()?.isDraft ?? false);

  constructor() {
    const syncPoint = (): void => {
      const { lat, lng } = this.form.getRawValue();
      this.point.set(isCoordinate(lat, 90) && isCoordinate(lng, 180) ? { lat, lng } : null);
    };

    this.form.controls.lat.valueChanges.subscribe(syncPoint);
    this.form.controls.lng.valueChanges.subscribe(syncPoint);

    effect(() => {
      const spot = this.spot();

      if (!spot) {
        return;
      }

      this.form.patchValue({
        // A draft's placeholder is not a name worth editing around: start blank.
        name: spot.isDraft ? '' : spot.name,
        lat: spot.lat,
        lng: spot.lng,
        locality: spot.locality ?? '',
        terrain: spot.terrain,
        access: spot.access,
        difficulty: spot.difficulty,
        hazards: [...spot.hazards],
        visibility: spot.visibility,
        descriptionMd: spot.descriptionMd ?? '',
        accessNotesMd: spot.accessNotesMd ?? '',
      });
    });

    effect(() => {
      const point = this.initialPoint();

      if (point && !this.spot()) {
        this.form.patchValue({ lat: point.lat, lng: point.lng });
      }
    });
  }

  protected onPointPicked(point: LatLng): void {
    this.form.patchValue({ lat: point.lat, lng: point.lng });
    this.form.controls.lat.markAsDirty();
  }

  protected submit(): void {
    this.validationError.set(null);

    const raw = this.form.getRawValue();
    const parsed = createSpotSchema.safeParse({
      ...raw,
      locality: raw.locality || null,
      descriptionMd: raw.descriptionMd || null,
      accessNotesMd: raw.accessNotesMd || null,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.validationError.set(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    this.saved.emit(parsed.data);
  }
}

function isCoordinate(value: number | null, limit: number): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= limit;
}

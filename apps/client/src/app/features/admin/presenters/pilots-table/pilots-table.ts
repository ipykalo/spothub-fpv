import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  type AdminUserDto,
  Role,
  USER_STATUS_LABELS,
  UserStatus,
  countryName,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { formatBytes, percentUsed } from '../../../../core/format/bytes';
import { storageLimitChoices } from '../../storage-limits';
import { countryOf } from '../../country-options';
import { type ChoiceOption } from '../../../../core/components/choice-option';
import { FilterChips } from '../../../../core/components/filter-chips/filter-chips';
import { GridToolbar } from '../../../../core/components/grid-toolbar/grid-toolbar';
import {
  type GridSpec,
  GridState,
  type SortOption,
  gridView,
} from '../../../../core/components/grid-toolbar/grid-view';

type PilotSortKey = 'joined' | 'seen' | 'name';

const pilotName = (user: AdminUserDto): string => user.displayName ?? user.email;

const PILOT_GRID: GridSpec<AdminUserDto, PilotSortKey> = {
  text: (user) => [
    user.lastSignInCountry ? countryName(user.lastSignInCountry) : null,
    user.displayName,
    user.pilotName,
    user.email,
    USER_STATUS_LABELS[user.status],
  ],
  sortBy: {
    joined: (user) => user.createdAt,
    seen: (user) => user.lastSignInAt,
    name: pilotName,
  },
};

const SORTS: readonly SortOption<PilotSortKey>[] = [
  { key: 'joined', label: 'Joined', direction: 'desc' },
  { key: 'seen', label: 'Last sign-in', direction: 'desc' },
  { key: 'name', label: 'Name' },
];

/** What each status means, shown beside it in the picker. */
const STATUS_HINTS: Readonly<Record<UserStatus, string>> = {
  [UserStatus.Active]: 'Full use',
  [UserStatus.Restricted]: 'Can look, cannot change anything',
  [UserStatus.Blocked]: 'Cannot sign in; signed out at once',
};

/**
 * Presenter: every pilot, with what an admin may change — whether they can
 * use the app fully, only read, or not sign in at all. Admins' own rows have
 * no picker: the page cannot lock out the people it belongs to.
 */
@Component({
  selector: 'sh-pilots-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Autocomplete,
    DatePipe,
    FilterChips,
    GridToolbar,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './pilots-table.html',
  styleUrl: './pilots-table.scss',
})
export class PilotsTable {
  readonly users = input.required<readonly AdminUserDto[]>();
  /** The restricted countries, to flag a pilot whose last sign-in came from one. */
  readonly blockedCountries = input<readonly string[]>([]);
  /** What a pilot without a limit of their own may keep. */
  readonly defaultLimitBytes = input.required<number>();

  /** Where a pilot last signed in from, and whether that country is restricted. */
  protected countryOf(user: AdminUserDto): ReturnType<typeof countryOf> {
    return countryOf(user.lastSignInCountry, this.blockedCountries());
  }
  readonly saving = input(false);

  readonly statusChanged = output<{ id: string; status: UserStatus }>();
  /** A pilot's own limit; null puts them back on the default. */
  readonly limitChanged = output<{ id: string; bytes: number | null }>();
  readonly defaultLimitChanged = output<number>();
  /** Hide every post a pilot wrote, or show them all again. */
  readonly postsHidden = output<{ id: string; hidden: boolean }>();

  protected readonly formatBytes = formatBytes;
  protected readonly percentUsed = percentUsed;
  protected readonly defaultLimitOptions = computed(() =>
    storageLimitChoices(this.defaultLimitBytes()),
  );
  protected readonly defaultLabel = computed(
    () => `Default (${formatBytes(this.defaultLimitBytes())})`,
  );

  protected readonly labels = USER_STATUS_LABELS;
  protected readonly admin = Role.Admin;
  protected readonly sorts = SORTS;

  protected readonly statusOptions: readonly ChoiceOption<UserStatus>[] = Object.values(
    UserStatus,
  ).map((status) => ({
    value: status,
    label: USER_STATUS_LABELS[status],
    hint: STATUS_HINTS[status],
  }));

  protected readonly grid = new GridState<PilotSortKey, UserStatus>({
    key: 'joined',
    direction: 'desc',
  });

  protected readonly rows = computed(() => {
    const status = this.grid.filter();

    return gridView(
      this.users(),
      PILOT_GRID,
      this.grid.query(),
      this.grid.sort(),
      (user) => status === null || user.status === status,
    );
  });

  /** Every row's choices, built once per list rather than per change detection. */
  protected readonly limitOptions = computed(
    () =>
      new Map(
        this.users().map((user) => [
          user.id,
          storageLimitChoices(user.storageQuotaBytes),
        ]),
      ),
  );

  protected changeLimit(user: AdminUserDto, bytes: number | null): void {
    if (bytes !== user.storageQuotaBytes) {
      this.limitChanged.emit({ id: user.id, bytes });
    }
  }

  protected changeDefault(bytes: number | null): void {
    if (bytes !== null && bytes !== this.defaultLimitBytes()) {
      this.defaultLimitChanged.emit(bytes);
    }
  }

  protected change(user: AdminUserDto, status: UserStatus | null): void {
    if (status !== null && status !== user.status) {
      this.statusChanged.emit({ id: user.id, status });
    }
  }
}

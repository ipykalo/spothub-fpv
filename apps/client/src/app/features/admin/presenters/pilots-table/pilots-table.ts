import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { type AdminUserDto, Role, USER_STATUS_LABELS, UserStatus } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
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
  text: (user) => [user.displayName, user.email, USER_STATUS_LABELS[user.status]],
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
  imports: [Autocomplete, DatePipe, FilterChips, GridToolbar, MatIconModule],
  templateUrl: './pilots-table.html',
  styleUrl: './pilots-table.scss',
})
export class PilotsTable {
  readonly users = input.required<readonly AdminUserDto[]>();
  readonly saving = input(false);

  readonly statusChanged = output<{ id: string; status: UserStatus }>();

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

  protected change(user: AdminUserDto, status: UserStatus | null): void {
    if (status !== null && status !== user.status) {
      this.statusChanged.emit({ id: user.id, status });
    }
  }
}

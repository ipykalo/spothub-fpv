import { PartCategory } from '@spothub/shared';

/**
 * A glyph per part category.
 *
 * Twelve categories in a grid of cards is more than a text heading can
 * separate at a glance — the eye finds a shape faster than it reads a word.
 * Condition already speaks in icon and colour; category speaks in icon alone,
 * because a second colour axis would fight the first.
 *
 * Lives in the feature rather than in `libs/shared`: an icon name is
 * presentation, and the API has no use for one. The labels beside these are
 * shared, because both sides need the same words.
 *
 * Names are ligatures from the classic **Material Icons** set, which is what
 * `index.html` loads. Material Symbols has better fits for several of these
 * (`mode_fan` for a motor, `raven` for props) but is a different font — check
 * a name renders before swapping it in.
 */
export const PART_CATEGORY_ICONS: Readonly<Record<PartCategory, string>> = {
  // The airframe the rest bolts to.
  [PartCategory.Frame]: 'filter_frames',
  // Rotation, which is the one thing a motor does.
  [PartCategory.Motor]: 'rotate_right',
  // A speed controller, so: speed.
  [PartCategory.Esc]: 'speed',
  // A chip on a board.
  [PartCategory.Fc]: 'memory',
  // An FC and ESC sold as one unit — literally layered boards.
  [PartCategory.Stack]: 'layers',
  // Sends video out.
  [PartCategory.Vtx]: 'cast',
  // `videocam` rather than `photo_camera`: an FPV cam is a video feed.
  [PartCategory.Camera]: 'videocam',
  // The other end of the radio link.
  [PartCategory.Rx]: 'settings_remote',
  [PartCategory.Antenna]: 'settings_input_antenna',
  // `filter_vintage` is rounded blades radiating from a hub — the closest
  // thing to a propeller in the classic set. (`toys` is a toy car, not the
  // pinwheel its name suggests; `mode_fan` would be ideal but is Symbols.)
  [PartCategory.Prop]: 'filter_vintage',
  [PartCategory.Battery]: 'battery_full',
  [PartCategory.Other]: 'category',
};

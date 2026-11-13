import { ReportPlaceKind, type ReportDto } from '@spothub/shared';

/** The page a report is about, as router commands: the post, or the spot or build a comment is under. */
export function reportLink(place: ReportDto['place']): readonly string[] {
  switch (place.kind) {
    case ReportPlaceKind.Post:
      return place.slug ? ['/blog', place.id, place.slug] : ['/blog', place.id];
    case ReportPlaceKind.Spot:
      return ['/spots', place.id];
    case ReportPlaceKind.Build:
      return ['/hangar', place.id];
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';
import { injectPageMeta } from '../../core/seo/page-meta';
import { injectStructuredData } from '../../core/seo/structured-data';

/** One part of the app, as the about page introduces it. */
interface Feature {
  readonly icon: string;
  readonly title: string;
  readonly text: string;
  /** Where it lives once signed in. */
  readonly path: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: 'flight_takeoff',
    title: 'Hangar',
    text: 'A page per quad: what is fitted to it, what it cost, what broke and how it was repaired, and photos. Each build is in planning, active, down or retired.',
    path: '/hangar',
  },
  {
    icon: 'inventory_2',
    title: 'Parts',
    text: 'The shelf. A part is a kind of thing, a unit is the one in your hand. Fit units to builds and take them off again, so spares are always known. Paste a shop link to fill in the name and picture.',
    path: '/parts',
  },
  {
    icon: 'tune',
    title: 'Firmware snapshots',
    text: 'Paste a Betaflight CLI diff or dump and it is kept against the build with a date. Compare two side by side, or download one again as the file Configurator expects.',
    path: '/hangar',
  },
  {
    icon: 'timeline',
    title: 'Flight logbook',
    text: 'Drop the radio’s whole LOGS folder and every flight lands in the logbook, grouped into sessions. Each flight has a timeline of link, sticks and voltage, and a map when there was GPS.',
    path: '/flights',
  },
  {
    icon: 'battery_charging_full',
    title: 'Battery packs',
    text: 'Mark which pack flew which flight and each one builds its own record: cycles, airtime, average sag, and whether the sag is getting worse.',
    path: '/parts',
  },
  {
    icon: 'place',
    title: 'Flying spots',
    text: 'A map of places to fly, with notes, a video and directions. One tap at the field saves where you stand. Keep a spot private, share it by link, or list it for other pilots.',
    path: '/spots',
  },
  {
    icon: 'article',
    title: 'Blog',
    text: 'Build logs, repairs and what the logs turned up, written in Markdown with photos. The one part of the site anyone can read.',
    path: '/',
  },
];

/** The log files the logbook reads, and what each one brings. */
const FORMATS: readonly {
  readonly name: string;
  readonly from: string;
  readonly gives: string;
}[] = [
  {
    name: 'EdgeTX CSV',
    from: 'the radio’s SD card, LOGS folder',
    gives:
      'flight times, link quality, sticks, radio battery, and GPS when the quad sends it',
  },
  {
    name: 'Betaflight blackbox (.bbl)',
    from: 'the flight controller’s flash, over USB',
    gives: 'pack voltage, current and charge used',
  },
  {
    name: 'GPX',
    from: 'a phone, goggles or GPS logger',
    gives: 'the path flown, joined to the flight it lines up with',
  },
];

const DESCRIPTION =
  'SpotHub FPV keeps an FPV pilot’s quads, parts, Betaflight configs, flight logs, battery packs and flying spots in one place. What it does and how to start.';

/**
 * Container: what the site is, what each part of it does and how to begin —
 * the page a visitor who lands on the blog has nowhere else to find. Public
 * and rendered on the server. It holds no state: the only thing it reads is
 * whether the reader is signed in, to offer the hangar rather than sign-in.
 */
@Component({
  selector: 'sh-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {
  protected readonly auth = inject(AuthStore);
  protected readonly features = FEATURES;
  protected readonly formats = FORMATS;

  constructor() {
    injectPageMeta().set({
      title: 'About — a hangar and flight logbook for FPV pilots',
      description: DESCRIPTION,
      path: '/about',
    });
    injectStructuredData().setAbout(DESCRIPTION);
  }
}

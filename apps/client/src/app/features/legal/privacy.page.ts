import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { injectPageMeta } from '../../core/seo/page-meta';
import { LEGAL } from './legal';

/**
 * Container: what personal data the site keeps, why, where, for how long,
 * and how to have it deleted. Public, rendered on the server, linked from the
 * footer only. Static: everything it says is in its template.
 */
@Component({
  selector: 'sh-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './privacy.page.html',
  styleUrl: './privacy.page.scss',
})
export class PrivacyPage {
  protected readonly legal = LEGAL;

  constructor() {
    injectPageMeta().set({
      title: 'Privacy',
      description:
        'What SpotHub FPV keeps about the pilots who use it, why, where, for how long, and how to have it deleted.',
      path: '/privacy',
    });
  }
}

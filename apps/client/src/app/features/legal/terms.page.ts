import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { injectPageMeta } from '../../core/seo/page-meta';
import { LEGAL } from './legal';

/**
 * Container: the terms of use — mostly what pilots may post, and what the
 * site promises and does not. Public, rendered on the server, linked from
 * the footer only. Static: everything it says is in its template.
 */
@Component({
  selector: 'sh-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './terms.page.html',
  styleUrl: './terms.page.scss',
})
export class TermsPage {
  protected readonly legal = LEGAL;

  constructor() {
    injectPageMeta().set({
      title: 'Terms of use',
      description:
        'The terms of using SpotHub FPV: your account, what you may post, flying responsibly, and what the site does and does not promise.',
      path: '/terms',
    });
  }
}

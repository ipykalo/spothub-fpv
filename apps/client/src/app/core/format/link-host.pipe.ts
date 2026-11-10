import { Pipe, type PipeTransform } from '@angular/core';
import { linkHost } from '@spothub/shared';

/**
 * `aliexpress.com` for a shop link, so a template can say where a link goes
 * before it is followed — and render no link at all for anything that is not
 * a web address (null).
 */
@Pipe({ name: 'linkHost' })
export class LinkHostPipe implements PipeTransform {
  transform(href: string | null | undefined): string | null {
    return href ? linkHost(href) : null;
  }
}

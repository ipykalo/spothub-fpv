import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { type EnrichUrlDto, type UrlPreviewDto, enrichUrlSchema } from '@spothub/shared';

import { ZodValidationPipe } from '../../common';
import { UrlPreviewService } from '../services/url-preview.service';

/**
 * Paste-a-URL enrichment.
 *
 * Sits on the `parts` path because filling in a part source is the only thing
 * it is for, and it keeps its own controller because it touches no repository
 * and owns no rows — it is an outbound integration, not an aggregate.
 *
 * Registered before PartsController in the module so a future `@Post(':id')`
 * on that controller cannot swallow this route.
 */
@Controller('parts')
export class UrlPreviewController {
  constructor(private readonly preview: UrlPreviewService) {}

  /**
   * A POST rather than a GET because the URL is a body, not a path — and it
   * keeps the pasted link out of the access log.
   */
  @Post('url-preview')
  @HttpCode(HttpStatus.OK)
  urlPreview(
    @Body(new ZodValidationPipe(enrichUrlSchema)) body: EnrichUrlDto,
  ): Promise<UrlPreviewDto> {
    return this.preview.fetchPreview(body.url);
  }
}

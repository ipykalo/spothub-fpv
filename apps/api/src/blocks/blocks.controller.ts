import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { BlockedPilotDto } from '@spothub/shared';

import { type AuthenticatedUser, AllowedWhenReadOnly, CurrentUser } from '../common';
import { BlocksService } from './blocks.service';

/**
 * A pilot's own block list. Blocking and unblocking are idempotent, and stay
 * open to a read-only pilot: keeping someone away protects you, it is not
 * taking part.
 */
@Controller('users')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get('me/blocks')
  list(@CurrentUser() user: AuthenticatedUser): Promise<BlockedPilotDto[]> {
    return this.blocks.list(user.id);
  }

  @Put('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowedWhenReadOnly()
  block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.blocks.block(user.id, userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowedWhenReadOnly()
  unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.blocks.unblock(user.id, userId);
  }
}

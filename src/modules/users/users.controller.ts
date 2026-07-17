import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import {
  MyLikesResultDto,
  MyPostsResultDto,
  MyWorksResultDto,
  UserDto,
} from '../../common/dto/entities.dto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { MeListQueryDto } from './dto/me-list.dto';

@ApiTags('用户')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiData(UserDto)
  getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiData(UserDto)
  updateMe(
    @CurrentUser('userId') userId: string,
    @CurrentUser('openid') openid: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateMe(userId, openid, dto);
  }

  /** 我的作品（封面：最新 AI 图 ?? 创作台预览图；published 供删除确认文案） */
  @Get('me/works')
  @ApiData(MyWorksResultDto)
  myWorks(
    @CurrentUser('userId') userId: string,
    @Query() query: MeListQueryDto,
  ) {
    return this.usersService.myWorks(userId, query);
  }

  /** 我的发布（撤回走 DELETE /plaza/:id） */
  @Get('me/posts')
  @ApiData(MyPostsResultDto)
  myPosts(
    @CurrentUser('userId') userId: string,
    @Query() query: MeListQueryDto,
  ) {
    return this.usersService.myPosts(userId, query);
  }

  /** 我的点赞（取消赞走 POST /plaza/:id/like） */
  @Get('me/likes')
  @ApiData(MyLikesResultDto)
  myLikes(
    @CurrentUser('userId') userId: string,
    @Query() query: MeListQueryDto,
  ) {
    return this.usersService.myLikes(userId, query);
  }
}

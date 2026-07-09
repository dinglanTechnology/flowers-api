import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiData } from '../../common/dto/api-response.dto';
import { UserDto } from '../../common/dto/entities.dto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

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
}

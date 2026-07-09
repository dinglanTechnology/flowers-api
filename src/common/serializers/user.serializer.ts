import { User } from '@prisma/client';

export interface PublicUser {
  id: string;
  nickname: string;
  avatarId: string;
  avatarUrl: string | null;
  createdAt: string;
}

/** 脱敏输出：不含 openid / unionid 等内部字段 */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarId: u.avatarId,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
  };
}

import { User } from '@prisma/client';

export interface PublicUser {
  id: string;
  nickname: string;
  avatarId: string;
  avatarUrl: string | null;
  phone: string | null;
  createdAt: string;
}

/**
 * 脱敏输出：不含 openid / unionid 等内部字段。
 * 注意 phone 属于本人 PII，仅可用于返回给用户本人（登录 / getMe），
 * 切勿用于展示他人资料。
 */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarId: u.avatarId,
    avatarUrl: u.avatarUrl,
    phone: u.phone,
    createdAt: u.createdAt.toISOString(),
  };
}

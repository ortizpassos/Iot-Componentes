import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema';

// JwtStrategy has already loaded the current role from the database.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.role !== UserRole.ADMIN) throw new ForbiddenException('Acesso restrito aos administradores autorizados.');
    return true;
  }
}

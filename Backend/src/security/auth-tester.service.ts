import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthTesterService {
  async testPrivilegeEscalation(userA: any, userB: any, service: any) {
    try {
      await service.getUserData(userB.id, userA.token);
      throw new Error('Auth bypass detected');
    } catch {
      return true;
    }
  }
}
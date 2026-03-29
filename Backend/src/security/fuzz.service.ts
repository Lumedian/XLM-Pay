import { Injectable } from '@nestjs/common';
import * as faker from 'faker';

@Injectable()
export class FuzzService {
  generatePayloads(count = 1000) {
    return Array.from({ length: count }).map(() => ({
      tenantId: faker.datatype.uuid(),
      userId: faker.datatype.uuid(),
      malicious: true,
    }));
  }
}
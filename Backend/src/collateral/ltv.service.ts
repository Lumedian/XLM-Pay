import { Injectable } from "@nestjs/common";

@Injectable()
export class LtvService {
  calculate(collateral: number, loan: number) {
    return (loan / collateral) * 100;
  }
}
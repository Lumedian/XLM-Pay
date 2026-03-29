import { Injectable } from "@nestjs/common";

@Injectable()
export class AuctionService {
  start(price: number) {
    let current = price;

    setInterval(() => {
      current *= 0.98; // decay
    }, 5000);

    return current;
  }
}
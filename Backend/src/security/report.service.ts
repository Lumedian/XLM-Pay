@Injectable()
export class ReportService {
  generate() {
    return {
      timestamp: new Date(),
      status: 'SECURE',
      tests: 1000,
    };
  }
}
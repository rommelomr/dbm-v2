import * as crypto from 'crypto';

export class ChecksumService {
  static compute(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  static verify(content: string, expected: string): boolean {
    return ChecksumService.compute(content) === expected;
  }
}

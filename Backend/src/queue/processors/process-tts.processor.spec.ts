import { Test, TestingModule } from '@nestjs/testing';
import { ProcessTtsProcessor } from './process-tts.processor';

describe('ProcessTtsProcessor', () => {
  let processor: ProcessTtsProcessor;

  const createMockJob = (
    overrides: Partial<{
      text: string;
      voiceId: string;
      language: string;
      speed: number;
      sessionId: string;
    }> = {},
  ) => ({
    id: '123',
    data: {
      text: 'Hello, this is a test',
      voiceId: 'voice-001',
      language: 'en',
      speed: 1.0,
      sessionId: 'session-123',
      ...overrides,
    },
    progress: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessTtsProcessor],
    }).compile();

    processor = module.get<ProcessTtsProcessor>(ProcessTtsProcessor);
  });

  describe('handleProcessTts', () => {
    it('should successfully process TTS', async () => {
      const job = createMockJob();
      const result = await processor.handleProcessTts(job as any);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('audioUrl');
      expect(result.data).toHaveProperty('duration');
      expect(result.data).toHaveProperty('voiceId');
    });

    it('should update progress', async () => {
      const job = createMockJob();
      await processor.handleProcessTts(job as any);

      expect(job.progress).toHaveBeenCalledWith(10);
      expect(job.progress).toHaveBeenCalledWith(30);
      expect(job.progress).toHaveBeenCalledWith(50);
      expect(job.progress).toHaveBeenCalledWith(80);
      expect(job.progress).toHaveBeenCalledWith(100);
    });

    it('should throw error if text missing', async () => {
      const job = createMockJob({
        text: '',
      });

      await expect(processor.handleProcessTts(job as any)).rejects.toThrow();
    });

    it('should throw error if voiceId missing', async () => {
      const job = createMockJob({
        text: 'Hello',
        voiceId: '',
      });

      await expect(processor.handleProcessTts(job as any)).rejects.toThrow();
    });

    it('should throw error if text exceeds limit', async () => {
      const job = createMockJob({
        text: 'a'.repeat(5001),
      });

      await expect(processor.handleProcessTts(job as any)).rejects.toThrow(
        'Text exceeds maximum length',
      );
    });

    it('should include sessionId in result if provided', async () => {
      const job = createMockJob();
      const result = await processor.handleProcessTts(job as any);

      expect(result.data.sessionId).toBe('session-123');
    });

    it('should include language and speed in result', async () => {
      const job = createMockJob();
      const result = await processor.handleProcessTts(job as any);

      expect(result.data.language).toBe('en');
      expect(result.data.speed).toBe(1.0);
    });

    it('should generate audioUrl with job id', async () => {
      const job = createMockJob();
      const result = await processor.handleProcessTts(job as any);

      expect(result.data.audioUrl).toContain('123');
      expect(result.data.audioUrl).toContain('audio');
    });
  });
});

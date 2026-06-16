import { xdr } from '@stellar/stellar-sdk';
import { EventQueue } from './event-queue';
import { EventJob, EventJobPayload } from './types';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

function createJobPayload(
  overrides: Partial<EventJobPayload> = {}
): EventJobPayload {
  return {
    eventId: 'event-1',
    contractAddress: 'CCEMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
    eventName: 'TaskCreated',
    ledger: 12345,
    type: 'contract',
    topic: [xdr.ScVal.scvSymbol('TaskCreated')],
    value: xdr.ScVal.scvU32(1),
    ...overrides,
  };
}

describe('EventQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues events before processing them asynchronously', async () => {
    const processed: string[] = [];
    let releaseHandler!: () => void;
    const handlerGate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });

    const queue = new EventQueue(
      async (job) => {
        await handlerGate;
        processed.push(job.eventId);
      },
      { maxRetries: 3, retryDelayMs: 0 }
    );

    queue.start();
    queue.enqueue(createJobPayload({ eventId: 'event-a' }));

    await Promise.resolve();

    expect(processed).toEqual([]);
    expect(queue.isCurrentlyProcessing()).toBe(true);

    releaseHandler();
    await queue.waitUntilIdle();

    expect(processed).toEqual(['event-a']);
    expect(queue.getQueueSize()).toBe(0);
  });

  it('processes events in FIFO order', async () => {
    const processed: string[] = [];
    const queue = new EventQueue(
      async (job) => {
        processed.push(job.eventId);
      },
      { maxRetries: 3, retryDelayMs: 0 }
    );

    queue.start();
    queue.enqueue(createJobPayload({ eventId: 'first' }));
    queue.enqueue(createJobPayload({ eventId: 'second' }));
    queue.enqueue(createJobPayload({ eventId: 'third' }));

    await queue.waitUntilIdle();

    expect(processed).toEqual(['first', 'second', 'third']);
  });

  it('prevents duplicate event processing', async () => {
    const processed: string[] = [];
    const queue = new EventQueue(
      async (job) => {
        processed.push(job.eventId);
      },
      { maxRetries: 3, retryDelayMs: 0 }
    );

    queue.start();
    const firstEnqueue = queue.enqueue(createJobPayload({ eventId: 'duplicate' }));
    const secondEnqueue = queue.enqueue(createJobPayload({ eventId: 'duplicate' }));

    expect(firstEnqueue).toBe(true);
    expect(secondEnqueue).toBe(false);
    expect(queue.hasSeenEvent('duplicate')).toBe(true);

    await queue.waitUntilIdle();

    expect(processed).toEqual(['duplicate']);
  });

  it('retries failed jobs before moving to the next event', async () => {
    const attemptsByEvent: Record<string, number> = {};
    const queue = new EventQueue(
      async (job) => {
        attemptsByEvent[job.eventId] = (attemptsByEvent[job.eventId] || 0) + 1;
        if (job.eventId === 'retry-me' && attemptsByEvent[job.eventId] < 2) {
          throw new Error('temporary failure');
        }
      },
      { maxRetries: 3, retryDelayMs: 0 }
    );

    queue.start();
    queue.enqueue(createJobPayload({ eventId: 'retry-me' }));
    queue.enqueue(createJobPayload({ eventId: 'next-event' }));

    await queue.waitUntilIdle();

    expect(attemptsByEvent['retry-me']).toBe(2);
    expect(attemptsByEvent['next-event']).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Event processing failed, scheduling retry',
      expect.objectContaining({ eventId: 'retry-me', attempt: 1 })
    );
  });

  it('stops retrying after max retries are exhausted', async () => {
    const attempts: number[] = [];
    const queue = new EventQueue(
      async () => {
        attempts.push(1);
        throw new Error('persistent failure');
      },
      { maxRetries: 2, retryDelayMs: 0 }
    );

    queue.start();
    queue.enqueue(createJobPayload({ eventId: 'always-fails' }));

    await queue.waitUntilIdle();

    expect(attempts).toHaveLength(3);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Event processing failed after max retries',
      expect.objectContaining({ eventId: 'always-fails', attempts: 3 })
    );
  });

  it('does not process new jobs after stop is called', async () => {
    jest.useFakeTimers();

    const processed: string[] = [];
    const queue = new EventQueue(
      async (job: EventJob) => {
        processed.push(job.eventId);
        if (job.eventId === 'block') {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
      { maxRetries: 0, retryDelayMs: 0 }
    );

    queue.start();
    queue.enqueue(createJobPayload({ eventId: 'block' }));
    queue.enqueue(createJobPayload({ eventId: 'pending' }));

    await Promise.resolve();
    const stopPromise = queue.stop();

    await jest.advanceTimersByTimeAsync(50);
    await stopPromise;

    expect(processed).toEqual(['block']);
    expect(queue.getQueueSize()).toBe(1);
  });
});

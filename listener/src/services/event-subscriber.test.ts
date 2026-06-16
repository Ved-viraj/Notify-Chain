import { xdr } from '@stellar/stellar-sdk';
import * as StellarSDK from '@stellar/stellar-sdk';
import { EventSubscriber } from './event-subscriber';
import { EventQueue } from '../queue/event-queue';
import { EventJobHandler } from '../queue/types';
import { Config } from '../types';
import logger from '../utils/logger';

const mockGetEvents = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getEvents: mockGetEvents,
      })),
    },
  };
});

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const testConfig: Config = {
  stellarNetwork: 'testnet',
  stellarRpcUrl: 'https://soroban-testnet.stellar.org:443',
  contractAddresses: [
    {
      address: 'CCEMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
      events: ['*'],
    },
  ],
  pollIntervalMs: 30000,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 100,
  queueMaxRetries: 3,
  queueRetryDelayMs: 0,
};

function createEventQueue(handler?: EventJobHandler): EventQueue {
  const defaultHandler: EventJobHandler = async (job) => {
    mockLogger.info('Processing event', {
      contractAddress: job.contractAddress,
      eventId: job.eventId,
      ledger: job.ledger,
      type: job.type,
      topic: job.topic,
      value: job.value,
    });
  };

  return new EventQueue(handler ?? defaultHandler, {
    maxRetries: testConfig.queueMaxRetries,
    retryDelayMs: 0,
  });
}

function createMockEvent(
  overrides: Partial<StellarSDK.rpc.Api.EventResponse> = {}
): StellarSDK.rpc.Api.EventResponse {
  return {
    id: 'event-1',
    type: 'contract',
    ledger: 12345,
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: 'abc123def456',
    topic: [xdr.ScVal.scvSymbol('TaskCreated')],
    value: xdr.ScVal.scvU32(1),
    ...overrides,
  };
}

describe('EventSubscriber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEvents.mockResolvedValue({ events: [], cursor: '' });
  });

  it('should create an instance', () => {
    const subscriber = new EventSubscriber(testConfig);
    expect(subscriber).toBeDefined();
  });

  it('should start and stop without errors', async () => {
    jest.useFakeTimers();

    const subscriber = new EventSubscriber(testConfig);
    await subscriber.start();
    await jest.advanceTimersByTimeAsync(0);
    await subscriber.stop();

    jest.useRealTimers();
  });

  it('queues and processes events returned from RPC', async () => {
    const event = createMockEvent({ id: 'event-abc', ledger: 99999 });
    mockGetEvents.mockResolvedValue({
      events: [event],
      cursor: 'cursor-1',
    });

    const queue = createEventQueue();
    const subscriber = new EventSubscriber(testConfig, queue);
    queue.start();

    await (subscriber as any).checkForEvents();
    await queue.waitUntilIdle();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Queued event',
      expect.objectContaining({
        contractAddress: testConfig.contractAddresses[0].address,
        eventId: 'event-abc',
        ledger: 99999,
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Processing event',
      expect.objectContaining({
        contractAddress: testConfig.contractAddresses[0].address,
        eventId: 'event-abc',
        ledger: 99999,
        type: 'contract',
      })
    );
  });

  it('skips duplicate events within the same poll cycle', async () => {
    mockGetEvents.mockResolvedValue({
      events: [
        createMockEvent({ id: 'duplicate-event' }),
        createMockEvent({ id: 'duplicate-event' }),
      ],
      cursor: 'cursor-dup',
    });

    const queue = createEventQueue();
    const subscriber = new EventSubscriber(testConfig, queue);
    queue.start();

    await (subscriber as any).checkForEvents();
    await queue.waitUntilIdle();

    expect(
      mockLogger.info.mock.calls.filter(
        (call: unknown[]) => call[0] === 'Queued event'
      )
    ).toHaveLength(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Skipping duplicate event',
      expect.objectContaining({ eventId: 'duplicate-event' })
    );
  });
});

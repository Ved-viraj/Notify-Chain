import * as StellarSDK from '@stellar/stellar-sdk';

export interface EventJob {
  eventId: string;
  contractAddress: string;
  eventName: string | null;
  ledger: number;
  type: string;
  topic: StellarSDK.xdr.ScVal[];
  value: StellarSDK.xdr.ScVal;
  txHash?: string;
  attempts: number;
}

export interface EventQueueConfig {
  maxRetries: number;
  retryDelayMs: number;
}

export type EventJobHandler = (job: EventJob) => Promise<void>;

export type EventJobPayload = Omit<EventJob, 'attempts'>;

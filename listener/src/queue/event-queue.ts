import logger from '../utils/logger';
import { EventJob, EventJobHandler, EventJobPayload, EventQueueConfig } from './types';

export class EventQueue {
  private readonly handler: EventJobHandler;
  private readonly config: EventQueueConfig;
  private readonly queue: EventJob[] = [];
  private readonly seenEventIds: Set<string> = new Set();
  private isRunning = false;
  private isProcessing = false;
  private idleResolvers: Array<() => void> = [];
  private processingWaiters: Array<() => void> = [];

  constructor(handler: EventJobHandler, config: EventQueueConfig) {
    this.handler = handler;
    this.config = config;
  }

  enqueue(payload: EventJobPayload): boolean {
    if (this.seenEventIds.has(payload.eventId)) {
      return false;
    }

    this.seenEventIds.add(payload.eventId);
    this.queue.push({ ...payload, attempts: 0 });
    this.scheduleProcessing();
    return true;
  }

  start(): void {
    this.isRunning = true;
    this.scheduleProcessing();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.waitUntilNotProcessing();
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  hasSeenEvent(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  async waitUntilIdle(): Promise<void> {
    if (!this.isProcessing && this.queue.length === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private async waitUntilNotProcessing(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.processingWaiters.push(resolve);
    });
  }

  private scheduleProcessing(): void {
    if (!this.isRunning || this.isProcessing || this.queue.length === 0) {
      return;
    }

    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.isRunning && this.queue.length > 0) {
      const job = this.queue.shift()!;

      try {
        await this.handler(job);
      } catch (error) {
        job.attempts++;

        if (job.attempts <= this.config.maxRetries) {
          logger.warn('Event processing failed, scheduling retry', {
            eventId: job.eventId,
            attempt: job.attempts,
            maxRetries: this.config.maxRetries,
            error,
          });

          if (this.config.retryDelayMs > 0) {
            await this.delay(this.config.retryDelayMs);
          }

          this.queue.unshift(job);
          continue;
        }

        logger.error('Event processing failed after max retries', {
          eventId: job.eventId,
          attempts: job.attempts,
          error,
        });
      }
    }

    this.isProcessing = false;
    this.resolveProcessingWaiters();
    this.resolveIdleWaiters();
  }

  private resolveProcessingWaiters(): void {
    const resolvers = this.processingWaiters.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private resolveIdleWaiters(): void {
    if (this.isProcessing || this.queue.length > 0) {
      return;
    }

    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

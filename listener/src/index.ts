import dotenv from 'dotenv';
import { Config } from './types';
import { EventSubscriber } from './services/event-subscriber';
import logger from './utils/logger';

dotenv.config();

function loadConfig(): Config {
  return {
    stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
    stellarRpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org:443',
    contractAddresses: JSON.parse(process.env.CONTRACT_ADDRESSES || '[]'),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000'),
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '5'),
    reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY_MS || '5000'),
    queueMaxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
    queueRetryDelayMs: parseInt(process.env.QUEUE_RETRY_DELAY_MS || '1000'),
  };
}

async function main() {
  const config = loadConfig();
  const subscriber = new EventSubscriber(config);
  await subscriber.start();

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down');
    await subscriber.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down');
    await subscriber.stop();
    process.exit(0);
  });
}

main().catch(err => {
  logger.error('Error starting service', { error: err });
  process.exit(1);
});

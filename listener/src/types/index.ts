export interface ContractConfig {
  address: string;
  events: string[];
}

export interface Config {
  stellarNetwork: string;
  stellarRpcUrl: string;
  contractAddresses: ContractConfig[];
  pollIntervalMs: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  queueMaxRetries: number;
  queueRetryDelayMs: number;
}

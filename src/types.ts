export type TInfo = {
  name: string;
  contact: string;
  coinbase?: string;
  node?: string;
  net?: string | number;
  protocol?: string;
  api?: string;
  port?: string;
  os: string;
  os_v: string;
  client: string;
  canUpdateHistory: boolean;
};

export type TStats = {
  active: boolean;
  mining: boolean;
  hashrate: number;
  peers: number;
  pending: number;
  gasPrice: number;
  block: TBlock;
  syncing: boolean;
  uptime: number;
};

export type TBlock = {
  difficulty: number;
  extraData?: string;
  gasLimit?: number;
  gasUsed?: number;
  hash: string;
  logsBloom?: string;
  miner?: string;
  mixHash?: string;
  nonce?: number;
  number: number;
  parentHash?: string;
  receiptsRoot?: string;
  sha3Uncles?: string;
  size?: number;
  stateRoot?: string;
  timestamp?: number;
  totalDifficulty: number;
  transactionsRoot?: string;
  uncles: any[];
  transactions: any[];
};

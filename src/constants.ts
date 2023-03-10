// import * as os from 'os';
import * as dotenv from 'dotenv';
dotenv.config();
export const WS_SERVER = process.env.WS_SERVER || 'ws://localhost:3000';
export const RPC_HOST = process.env.RPC_HOST || 'http://localhost:8545';
export const CONTACT_DETAILS = process.env.CONTACT_DETAILS || '';
export const NODE_TYPE = process.env.NODE_TYPE || 'geth';
export const INSTANCE_NAME = process.env.INSTANCE_NAME;
export const WS_SECRET = process.env.WS_SECRET || 'eth-net-stats-has-a-secret';
export const PENDING_WORKS = true;
export const MAX_BLOCKS_HISTORY = 40;
export const UPDATE_INTERVAL = 30000;
export const PING_INTERVAL = 3000;
export const SYNC_INTERVAL = 5000;
export const MAX_HISTORY_UPDATE = 50;
export const MAX_CONNECTION_ATTEMPTS = 50;
export const CONNECTION_ATTEMPTS_TIMEOUT = 100000;

export const ENABLE_HISTORY = process.env.ENABLE_HISTORY || true;
export const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
export const DEFAULT_RPC_HOST =
  process.env.DEFAULT_RPC_HOST || 'https://bsc-dataseed1.defibit.io';
export const DIFF_BLOCK = process.env.DIFF_BLOCK || 30;

import * as os from 'os';
import * as _ from 'lodash';
import { createSocket } from 'primus';
import * as Emitter from 'primus-emit';
import * as Latency from 'primus-spark-latency';
import {
  CONNECTION_ATTEMPTS_TIMEOUT,
  CONTACT_DETAILS,
  DEFAULT_RPC_HOST,
  ENABLE_HISTORY,
  INSTANCE_NAME,
  MAX_BLOCKS_HISTORY,
  MAX_CONNECTION_ATTEMPTS,
  MAX_HISTORY_UPDATE,
  NODE_TYPE,
  PING_INTERVAL,
  RPC_HOST,
  SYNC_INTERVAL,
  UPDATE_INTERVAL,
  WS_SECRET,
  WS_SERVER,
} from './constants';
import { Socket } from 'dgram';
import { TBlock, TInfo, TStats } from './types';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { convertHexToNumber } from './utils/convert';
import { Slack } from './slack';
import console from './utils/logger';
class Node {
  info: TInfo;
  id: string;
  stats: TStats;
  _socket: boolean;
  socket: Socket;
  _lastBlock: number;
  _lastStats: string;
  _lastFetch: number;
  _tries: number;
  _down: number;
  _lastSent: number;
  _latency: number;
  _ethers: boolean;
  _provider: ethers.providers.JsonRpcProvider;
  _defaultProvider: ethers.providers.JsonRpcProvider;

  _connection_attempts: number;
  updateInterval: any;
  _lastBlockSentAt: number;
  pingInterval: any;
  syncInterval: any;
  slack: Slack;

  constructor() {
    console.log('init node');

    this.info = {
      name: INSTANCE_NAME,
      contact: CONTACT_DETAILS,
      coinbase: null,
      node: NODE_TYPE,
      net: null,
      protocol: null,
      api: null,
      os: os.platform(),
      os_v: os.release(),
      client: '1.0.0',
      canUpdateHistory: true,
    };

    this.id = _.camelCase(this.info.name);

    this.stats = {
      active: false,
      mining: false,
      hashrate: 0,
      peers: 0,
      pending: 0,
      gasPrice: 0,
      block: {
        number: 0,
        hash: '?',
        miner: '?',
        difficulty: 0,
        totalDifficulty: 0,
        transactions: [],
        uncles: [],
      },
      syncing: false,
      uptime: 0,
    };

    this._lastBlock = 0;
    this._lastStats = JSON.stringify(this.stats);
    this._lastFetch = 0;

    this._tries = 0;
    this._down = 0;
    this._lastSent = 0;
    this._latency = 0;

    this._ethers = false;
    this._socket = false;

    this.updateInterval = false;
    this.pingInterval = false;
    this.syncInterval = false;
    this._lastBlockSentAt = 0;
    this._connection_attempts = 0;
    this.startRpcConnection();
    this.startDefaultRpcConnection();
  }

  startDefaultRpcConnection = (): void => {
    if (DEFAULT_RPC_HOST !== '') {
      this.slack = new Slack();
      console.info('Starting Default RPC connection');
      this._defaultProvider = new ethers.providers.JsonRpcBatchProvider(
        DEFAULT_RPC_HOST,
      );
      this._defaultProvider.on('block', (blockNumber) => {
        this.slack.sendAlert(this.info.name, blockNumber, this._lastBlock);
      });
    }
  };
  startRpcConnection = (): void => {
    console.info('eth', 'Starting RPC connection');
    try {
      this._provider = new ethers.providers.JsonRpcProvider(RPC_HOST);
    } catch (error) {
      console.error('eth', error);
    } finally {
      this.checkRpcConnection();
    }
  };

  reconnectRpc = () => {
    console.info('eth', 'Reconnect Rpc ...');
    this._ethers = false;
    this._connection_attempts = 0;
    this._provider.removeAllListeners();
    this._defaultProvider.removeAllListeners();

    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.startRpcConnection();
    this.startDefaultRpcConnection();
  };
  checkRpcConnection = async () => {
    console.info('eth', 'Check RPC connection');
    if (!this._ethers) {
      const block = await this._provider.getBlockNumber();
      if (block > 0) {
        console.info('eth', 'RPC connected!');
        this._ethers = true;
        this._connection_attempts = 0;
        this.init();
        return true;
      } else {
        if (this._connection_attempts < MAX_CONNECTION_ATTEMPTS) {
          console.error(
            'eth',
            'RPC connection attempt',
            chalk.cyan('#' + this._connection_attempts++),
            'failed',
          );
          console.error(
            'eth',
            'Trying again in',
            chalk.cyan(
              CONNECTION_ATTEMPTS_TIMEOUT * this._connection_attempts + ' ms',
            ),
          );

          setTimeout(() => {
            this.startRpcConnection();
          }, CONNECTION_ATTEMPTS_TIMEOUT * this._connection_attempts);
        } else {
          console.error(
            'eth',
            'RPC connection failed',
            chalk.cyan(MAX_CONNECTION_ATTEMPTS),
            'times. Aborting...',
          );
        }
      }
      return false;
    }
    return true;
  };

  init = () => {
    // Fetch node info
    this.getInfo();

    // Start socket connection
    this.startSocketConnection();

    // Set filters
    this.setWatches();
    this.getLatestBlock();
    this.getStats(true);
  };

  getInfo = async () => {
    console.info('==>', 'Getting info');
    console.time('Got info');
    try {
      const [{ chainId, name }, version] = await Promise.all([
        this._provider.getNetwork(),
        this._provider.send('web3_clientVersion', []),
      ]);
      console.log('chainId', chainId, name);
      // this.info.coinbase = await this._provider.getNetwork()
      // this.info.node = name;
      this.info.net = chainId.toString();
      // this.info.protocol = web3.toDecimal(web3.version.ethereum);
      this.info.api = version;

      console.timeEnd('Got info');
      console.info(this.info);

      return true;
    } catch (err) {
      console.error("Couldn't get version");
    }

    return false;
  };

  ping = () => {
    this._latency = _.now();
    this.emit('node-ping', {
      id: this.id,
      clientTime: _.now(),
    });
  };
  setWatches = async () => {
    // this.setFilters();
    console.info('setWatches');
    if (!this.updateInterval) {
      this.updateInterval = setInterval(() => {
        if (this._ethers) this.getStats();
      }, UPDATE_INTERVAL);
    }
    if (!this.pingInterval) {
      this.pingInterval = setInterval(() => {
        this.ping();
      }, PING_INTERVAL);
    }
    if (!this.syncInterval) {
      this.syncInterval = setInterval(async () => {
        if (!this._ethers) return false;
        try {
          const sync = await this._provider.send('eth_syncing', []);
          if (sync) {
            console.info('SYNC STARTED:', sync);
            const synced = sync.currentBlock - sync.startingBlock;
            const total = sync.highestBlock - sync.startingBlock;
            sync.progress = synced / total;
            this.stats.syncing = sync;
            console.info('SYNC UPDATE:', sync);
          } else {
            console.info('SYNC STOPPED:', sync);
            this.stats.syncing = false;
            clearInterval(this.syncInterval);
          }
        } catch (error) {
          this.stats.syncing = false;
          console.error('SYNC ERROR', error);
        }
        return true;
      }, SYNC_INTERVAL);
    }
  };

  getStats = async (forced?: boolean) => {
    const now = _.now();
    const lastFetchAgo = now - this._lastFetch;
    this._lastFetch = now;
    if (this._socket) this._lastStats = JSON.stringify(this.stats);
    if (this._ethers && (lastFetchAgo >= UPDATE_INTERVAL || forced === true)) {
      console.stats('==>', 'Getting stats');
      console.stats('   ', 'last update:', chalk.reset.cyan(lastFetchAgo));
      console.stats('   ', 'forced:', chalk.reset.cyan(forced === true));

      try {
        const [peerCount, gasPrice, syncing] = await Promise.all([
          this._provider.send('net_peerCount', []),
          this._provider.getGasPrice(),
          this._provider.send('eth_syncing', []),
        ]);
        if (peerCount !== null) {
          this.stats.active = true;
          this.stats.peers = convertHexToNumber(peerCount);
          this.stats.mining = false;
          this.stats.gasPrice = convertHexToNumber(gasPrice, 0);

          if (syncing !== false) {
            const sync = syncing;

            const progress = sync.currentBlock - sync.startingBlock;
            const total = sync.highestBlock - sync.startingBlock;

            sync.progress = progress / total;

            this.stats.syncing = sync;
          } else {
            this.stats.syncing = false;
          }
        } else {
          this.setInactive();
        }

        this.setUptime();

        this.sendStatsUpdate(forced);
      } catch (error) {
        this._tries++;
        console.error('xx>', 'getStats error: ', error);
        this.setInactive();

        return false;
      }
    }
    return true;
  };

  getLatestBlock = () => {
    if (this._ethers) {
      this._provider.on('block', async (blockNumber: number) => {
        const timeString = 'Got block in' + chalk.reset.red('');
        // @ts-ignore
        console.info(`==>`, timeString);
        try {
          const result = await this._provider.send('eth_getBlockByNumber', [
            ethers.utils.hexValue(blockNumber),
            true,
          ]);

          return this.validateLatestBlock(result);
        } catch (error) {
          console.error('xx>', "getLatestBlock couldn't fetch block...");
          console.error('xx>', error);
          this.setInactive();
          return false;
        }
      });
    }
    return true;
  };

  validateLatestBlock = (result: TBlock) => {
    const block = this.formatBlock(result);
    if (block === false) {
      console.error('xx>', 'Got bad block:', chalk.reset.cyan(result.number));

      return false;
    }

    if (this.stats.block.number === block.number) {
      console.warn('==>', 'Got same block:', chalk.reset.cyan(block.number));

      if (_.isEqual(JSON.stringify(this.stats.block), JSON.stringify(block)))
        return false;

      console.stats(this.stats.block);
      console.stats(block);
      console.warn('Blocks are different... updating block');
    }

    console.sstats('==>', 'Got block:', chalk.reset.red(block.number));

    this.stats.block = block;

    this.sendBlockUpdate();

    if (this.stats.block.number - this._lastBlock > 1) {
      const range = _.range(
        Math.max(
          this.stats.block.number - MAX_BLOCKS_HISTORY,
          this._lastBlock + 1,
        ),
        Math.max(this.stats.block.number, 0),
        1,
      );
      if (ENABLE_HISTORY) this.getHistory({ list: range });
    }

    if (this.stats.block.number > this._lastBlock) {
      this._lastBlock = this.stats.block.number;
    }
    return true;
  };

  formatBlock = (block: TBlock) => {
    if (
      !_.isNull(block) &&
      !_.isUndefined(block) &&
      !_.isUndefined(block.number) &&
      block.number >= 0 &&
      !_.isUndefined(block.difficulty)
    ) {
      const transactions = block.transactions.map(
        (item) => item.blockHash || item.hash,
      );
      return {
        ...block,
        number: convertHexToNumber(block.number),
        hash: block.hash,
        difficulty: convertHexToNumber(block.difficulty),
        timestamp: convertHexToNumber(block.timestamp),
        totalDifficulty: convertHexToNumber(block.totalDifficulty),
        size: convertHexToNumber(block.size),
        nonce: block.nonce,
        gasUsed: convertHexToNumber(block.gasUsed),
        gasLimit: convertHexToNumber(block.gasLimit),
        transactions: transactions,
      };
    }

    return false;
  };

  getHistory = async (range) => {
    let interv;
    // @ts-ignore
    console.info('=H=', 'his', 'Got history in');

    if (_.isUndefined(range) || !range || range === null)
      interv = _.range(
        this.stats.block.number - 1,
        this.stats.block.number - MAX_HISTORY_UPDATE,
      );

    if (!_.isUndefined(range.list)) interv = range.list;
    console.stats(
      'his',
      'Getting history from',
      chalk.reset.cyan(interv[0]),
      'to',
      chalk.reset.cyan(interv[interv.length - 1]),
    );

    try {
      const queries = interv.map((block) =>
        this._provider.send('eth_getBlockByNumber', [
          ethers.utils.hexValue(block),
          true,
        ]),
      );
      const results = await Promise.all(queries);
      const formatResults = results.map((block) => this.formatBlock(block));
      this.emit('history', {
        id: this.id,
        history: formatResults.reverse(),
      });
      return true;
    } catch (error) {
      console.error('his', 'history fetch failed:', error);
      this.setInactive();
      return false;
    }
  };

  setInactive = () => {
    this.stats.active = false;
    this.stats.peers = 0;
    this.stats.mining = false;
    this.stats.hashrate = 0;
    this._down++;

    this.setUptime();

    this.sendStatsUpdate(true);

    // Schedule RPC reconnect
    this.reconnectRpc();

    return this;
  };

  setUptime = () => {
    this.stats.uptime = ((this._tries - this._down) / this._tries) * 100;
  };

  sendStatsUpdate = (force?: boolean) => {
    if (this.changed() || force) {
      console.stats(
        'wsc',
        'Sending',
        chalk.reset.blue(force ? 'forced' : 'changed'),
        chalk.bold.white('update'),
      );
      const stats = this.prepareStats();
      console.info(stats);
      this.emit('stats', stats);
      this.emit('stats', this.prepareStats());
    }
  };

  sendBlockUpdate = () => {
    this._lastBlockSentAt = _.now();
    console.stats(
      'wsc',
      'Sending',
      chalk.reset.red('block'),
      chalk.bold.white('update'),
    );
    this.emit('block', this.prepareBlock());
  };

  prepareStats = () => {
    return {
      id: this.id,
      stats: {
        active: this.stats.active,
        syncing: this.stats.syncing,
        mining: this.stats.mining,
        hashrate: this.stats.hashrate,
        peers: this.stats.peers,
        gasPrice: this.stats.gasPrice,
        uptime: this.stats.uptime,
      },
    };
  };

  changed = () => {
    const changed = !_.isEqual(this._lastStats, JSON.stringify(this.stats));
    return changed;
  };

  prepareBlock = () => {
    return {
      id: this.id,
      block: this.stats.block,
    };
  };

  startSocketConnection = (): void => {
    if (!this._socket) {
      console.info('wsc', 'Starting socket connection');

      const Socket = createSocket({
        transformer: 'websockets',
        pathname: '/api',
        strategy: 'disconnect,online,timeout',
        reconnect: {
          retries: 30,
        },
        plugin: { emitter: Emitter, sparkLatency: Latency },
      });

      this.socket = new Socket(WS_SERVER || 'ws://localhost:3000');

      this.setupSockets();
    }
  };

  emit = (message, payload) => {
    if (this._socket) {
      try {
        this.socket.emit(message, payload);
        console.sstats(
          'wsc',
          'Socket emited message:',
          chalk.reset.cyan(message),
        );
        // console.success('wsc', payload);
      } catch (err) {
        console.error('wsc', 'Socket emit error:', err);
      }
    }
  };

  setupSockets = (): void => {
    this.socket
      .on('open', () => {
        console.info('wsc', 'The socket connection has been opened.');
        console.info('   ', 'Trying to login');
        console.log({
          id: this.id,
          info: this.info,
          secret: WS_SECRET,
        });
        this.socket.emit('hello', {
          id: this.id,
          info: this.info,
          secret: WS_SECRET,
        });
      })
      .on('ready', () => {
        this._socket = true;
        console.success('wsc', 'The socket connection has been established.');

        // this.getLatestBlock();
        // this.getStats(true);
      })
      .on('data', (data) => {
        console.stats('Socket received some data', data);
      })
      .on('history', (data) => {
        console.stats('his', 'Got history request');
        if (ENABLE_HISTORY) this.getHistory(data);
      })
      .on('node-pong', (data) => {
        const now = _.now();
        const latency = Math.ceil((now - data.clientTime) / 2);

        this.socket.emit('latency', {
          id: this.id,
          latency: latency,
        });
      })
      .on('end', () => {
        this._socket = false;
        console.error('wsc', 'Socket connection end received');
      })
      .on('error', function error(err) {
        console.error('wsc', 'Socket error:', err);
      })
      .on('timeout', () => {
        this._socket = false;
        console.error('wsc', 'Socket connection timeout');
      })
      .on('close', () => {
        this._socket = false;
        console.error('wsc', 'Socket connection has been closed');
      })
      .on('offline', () => {
        this._socket = false;
        console.error('wsc', 'Network connection is offline');
      })
      .on('online', () => {
        this._socket = true;
        console.info('wsc', 'Network connection is online');
      })
      .on('reconnect', () => {
        console.info('wsc', 'Socket reconnect attempt started');
      })
      .on('reconnect scheduled', (opts) => {
        this._socket = false;
        console.warn('wsc', 'Reconnecting in', opts.scheduled, 'ms');
        console.warn(
          'wsc',
          'This is attempt',
          opts.attempt,
          'out of',
          opts.retries,
        );
      })
      .on('reconnected', (opts) => {
        this._socket = true;
        console.success(
          'wsc',
          'Socket reconnected successfully after',
          opts.duration,
          'ms',
        );
        this.setInactive();
        // this.getLatestBlock();
        // this.getStats(true);
      })
      .on('reconnect timeout', (err) => {
        this._socket = false;
        console.error(
          'wsc',
          'Socket reconnect atempt took too long:',
          err.message,
        );
      })
      .on('reconnect failed', (err) => {
        this._socket = false;
        console.error('wsc', 'Socket reconnect failed:', err.message);
      });
  };

  stop = () => {
    if (this._socket) this.socket.disconnect();

    if (this.updateInterval) clearInterval(this.updateInterval);

    if (this.pingInterval) clearInterval(this.pingInterval);

    this._provider.removeAllListeners();
    this._defaultProvider.removeAllListeners();
  };
}

export default Node;

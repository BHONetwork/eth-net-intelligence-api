import { IncomingWebhook } from '@slack/webhook';
import chalk from 'chalk';
import { DEFAULT_RPC_HOST, DIFF_BLOCK, SLACK_WEBHOOK_URL } from './constants';
import console from './utils/logger';
export class Slack {
  webhook: any;
  _status: boolean;
  _retries: number;
  constructor() {
    this._status = false;
    this._retries = 0;
    this.initWebHook();
  }

  initWebHook = () => {
    try {
      this._status = false;
      if (DEFAULT_RPC_HOST !== '' && SLACK_WEBHOOK_URL !== '') {
        this.webhook = new IncomingWebhook(SLACK_WEBHOOK_URL, {
          icon_emoji: ':bowtie:',
        });
        this._status = true;
      }
    } catch (error) {
      console.error('sla', 'Slack webhook connection', 'failed');
      this._status = false;
    }
  };

  sendAlert = async (
    nodeName: string,
    defaultBlock: number,
    nodeBlock: number,
  ) => {
    if (this._status) {
      try {
        const diff = defaultBlock - nodeBlock;

        if (diff > DIFF_BLOCK) {
          if (this._retries % 120 === 0) {
            console.slack(
              'sla',
              'sendAlert',
              defaultBlock,
              nodeBlock,
              diff,
              this._retries,
            );
            await this.webhook.send({
              text: `:boom: *${nodeName}* syncing error :boom: \n current block is \`${nodeBlock}\`. It doesn't reach to \`${defaultBlock}\` <@U024T9BH9GB>`,
              emoji: true,
            });
          }
          this._retries += 1;
        }
      } catch (error) {
        console.error('sla', 'Slack Alert', chalk.yellow('Send'), 'failed');
      }
    }
    return true;
  };
}

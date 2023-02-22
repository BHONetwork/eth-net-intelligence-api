import { BigNumberish } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

export const convertHexToNumber = (
  input: BigNumberish,
  decimals = 0,
): number => {
  return Number(formatUnits(input, decimals));
};

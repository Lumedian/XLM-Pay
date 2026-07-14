import { 
  SorobanRpc, 
  Networks,
  TransactionBuilder,
  FeeBumpTransaction,
  BASE_FEE
} from '@stellar/stellar-sdk';

// Environment variable validation
const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
const SOROBAN_RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

if (!STELLAR_NETWORK) {
  throw new Error(
    'Missing required environment variable: NEXT_PUBLIC_STELLAR_NETWORK. ' +
    'Set it to "testnet" or "mainnet".'
  );
}

if (!SOROBAN_RPC_URL) {
  throw new Error(
    'Missing required environment variable: NEXT_PUBLIC_SOROBAN_RPC_URL. ' +
    'Set it to your Soroban RPC endpoint URL.'
  );
}

if (STELLAR_NETWORK !== 'testnet' && STELLAR_NETWORK !== 'mainnet') {
  throw new Error(
    'Invalid NEXT_PUBLIC_STELLAR_NETWORK value. Must be "testnet" or "mainnet".'
  );
}

// Network passphrase helpers
export const getNetworkPassphrase = (): string => {
  return STELLAR_NETWORK === 'mainnet' 
    ? Networks.PUBLIC 
    : Networks.TESTNET;
};

export const getNetwork = (): 'testnet' | 'mainnet' => {
  return STELLAR_NETWORK as 'testnet' | 'mainnet';
};

// Configure Soroban RPC client
export const rpcClient = new SorobanRpc.Server(SOROBAN_RPC_URL, {
  allowHttp: STELLAR_NETWORK === 'testnet', // Allow HTTP for testnet
});

// Export configuration for use in other modules
export const config = {
  network: STELLAR_NETWORK as 'testnet' | 'mainnet',
  rpcUrl: SOROBAN_RPC_URL,
  networkPassphrase: getNetworkPassphrase(),
};

export default config;

# DID Integration Implementation Guide

## Overview

This guide provides comprehensive documentation for the Decentralized Identity (DID) integration implemented for the Stellara ecosystem. The implementation enables self-sovereign identity, verifiable credentials, and DID-based authentication.

## Architecture Summary

### Smart Contracts

1. **DID Registry Contract** (`did-registry`)
   - DID document storage and resolution
   - Support for `did:stellar` and `did:key` methods
   - Verification method management
   - Service endpoint management

2. **Verifiable Credentials Contract** (`verifiable-credentials`)
   - VC issuance and verification
   - Revocation registry
   - Credential status tracking
   - Support for multiple credential types

3. **Identity Hub Contract** (`identity-hub`)
   - Encrypted data storage
   - Permission management
   - Selective disclosure
   - Data sharing controls

### Backend Services

1. **DID Registry Service**
   - DID resolution and management
   - Contract interaction layer
   - DID method implementations

2. **DID Auth Service**
   - Challenge-response authentication
   - Signature verification
   - JWT token generation
   - Credential verification

3. **Crypto Service**
   - Cryptographic operations
   - Signature verification
   - Key management utilities

## Installation and Setup

### Prerequisites

- Rust 1.70+ for contract development
- Node.js 18+ for backend development
- Stellar CLI tools
- Soroban SDK 20.5.0

### Contract Deployment

1. **Build Contracts**
```bash
cd Contracts
cargo build --release --target wasm32-unknown-unknown
```

2. **Deploy DID Registry**
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/did_registry.wasm \
  --source deployer \
  --network testnet
```

3. **Initialize DID Registry**
```bash
stellar contract invoke \
  --id DID_REGISTRY_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --approvers '["$APPROVER1", "$APPROVER2", "$APPROVER3"]' \
  --executor "$EXECUTOR_ADDRESS"
```

4. **Deploy Verifiable Credentials Contract**
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/verifiable_credentials.wasm \
  --source deployer \
  --network testnet
```

5. **Deploy Identity Hub Contract**
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/identity_hub.wasm \
  --source deployer \
  --network testnet
```

### Backend Setup

1. **Install Dependencies**
```bash
cd Backend
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Update .env with contract IDs and configuration
```

3. **Required Environment Variables**
```env
# DID Registry Contract
DID_REGISTRY_CONTRACT_ID=YOUR_DID_REGISTRY_CONTRACT_ID

# Verifiable Credentials Contract  
VERIFIABLE_CREDENTIALS_CONTRACT_ID=YOUR_VC_CONTRACT_ID

# Identity Hub Contract
IDENTITY_HUB_CONTRACT_ID=YOUR_HUB_CONTRACT_ID

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

## Usage Examples

### Creating a DID

#### Stellar DID
```typescript
import { DIDRegistryService } from './did/did-registry.service';

const didRegistry = new DIDRegistryService();

// Create verification method
const verificationMethod = {
  id: 'did:stellar:public#key-1',
  type: 'Ed25519VerificationKey2018',
  controller: 'did:stellar:public',
  publicKey: 'public_key_bytes',
  createdAt: Date.now(),
};

// Create Stellar DID
const stellarDID = await didRegistry.createStellarDID(
  'GDQJ... (Stellar address)',
  [verificationMethod],
  []
);

console.log('Created DID:', stellarDID);
```

#### Key DID
```typescript
// Create Key DID
const keyDID = await didRegistry.createKeyDID(
  'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2do7',
  [verificationMethod],
  []
);
```

### Issuing Verifiable Credentials

```typescript
// Issue KYC Verified Credential
const credentialId = await didRegistry.issueCredential(
  'did:stellar:issuer',  // Issuer DID
  'did:stellar:user',     // Subject DID
  'KYCVerifiedCredential',
  {
    verificationLevel: 'enhanced',
    verifiedAt: new Date().toISOString(),
    country: 'US',
  },
  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiry
  {
    type: 'Ed25519Signature2018',
    created: Date.now(),
    verificationMethod: 'did:stellar:issuer#key-1',
    proofPurpose: 'assertionMethod',
    proofValue: 'signature_bytes',
  }
);
```

### DID Authentication Flow

#### 1. Generate Challenge
```typescript
const challenge = await didAuthService.generateChallenge(
  'did:stellar:user',
  'stellara.io'
);

// Response:
// {
//   challenge: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
//   expiresAt: '2023-12-01T12:00:00Z',
//   domain: 'stellara.io'
// }
```

#### 2. Sign Challenge (Client-side)
```typescript
// Client signs the challenge with their private key
const message = `${domain} wants you to sign in with your DID. Challenge: ${challenge}`;
const signature = await signMessage(message, privateKey);
```

#### 3. Verify and Login
```typescript
const loginResult = await didAuthService.loginWithDID(
  challenge,
  'did:stellar:user',
  signature,
  'did:stellar:user#key-1'
);

// Response includes JWT tokens and user info
```

### Identity Hub Usage

#### 1. Create Identity Hub
```typescript
const hubId = await identityHubService.createHub('did:stellar:user');
```

#### 2. Store Encrypted Data
```typescript
const encryptedData = encryptSensitiveData(personalInfo);
const dataHash = hashData(personalInfo);

const dataEntryId = await identityHubService.addDataEntry(
  hubId,
  'personal_profile',
  encryptedData,
  dataHash,
  null, // no expiry
  {
    category: 'personal',
    sensitivity: 'high',
  }
);
```

#### 3. Grant Access Permissions
```typescript
const permissionId = await identityHubService.grantPermission(
  hubId,
  'did:stellar:service_provider', // Grantee
  dataEntryId,
  PermissionType.Read,
  [
    {
      type: 'time_limit',
      value: '1704067200', // Unix timestamp
      operator: 'greater_than',
    },
    {
      type: 'purpose',
      value: 'identity_verification',
      operator: 'equals',
    },
  ],
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
);
```

#### 4. Selective Disclosure
```typescript
const disclosureId = await identityHubService.createSelectiveDisclosure(
  'did:stellar:user',
  'did:stellar:verifier',
  dataEntryId,
  ['name', 'age', 'country'], // Only disclose these fields
  zkProof, // Zero-knowledge proof
  nonce,
  new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
);
```

## API Reference

### DID Registry Endpoints

#### `POST /did/create-stellar`
Create a Stellar-based DID

**Request:**
```json
{
  "stellarAddress": "GDQJ...",
  "verificationMethods": [...],
  "services": [...]
}
```

#### `GET /did/:did`
Resolve DID document

**Response:**
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:stellar:GDQJ...",
  "verificationMethod": [...],
  "authentication": [...],
  "service": [...],
  "created": "2023-12-01T10:00:00Z",
  "updated": "2023-12-01T10:00:00Z",
  "deactivated": false
}
```

### Authentication Endpoints

#### `POST /auth/did/challenge`
Generate authentication challenge

#### `POST /auth/did/login`
Complete DID-based authentication

#### `GET /auth/did/credentials`
Get user's verified credentials

### Verifiable Credentials Endpoints

#### `POST /credentials/issue`
Issue a new verifiable credential

#### `POST /credentials/verify`
Verify a credential

#### `POST /credentials/revoke`
Revoke a credential

## Testing

### Contract Tests
```bash
cd Contracts
cargo test --package did-registry
cargo test --package verifiable-credentials  
cargo test --package identity-hub
```

### Backend Tests
```bash
cd Backend
npm run test
npm run test:e2e
```

### Integration Tests
```bash
cd Contracts/integration-tests
cargo test
```

## Security Considerations

### 1. Key Management
- Use hardware security modules (HSMs) for production keys
- Implement proper key rotation policies
- Secure storage of private keys

### 2. Data Protection
- All sensitive data in Identity Hubs is encrypted
- Implement proper access controls
- Use selective disclosure to minimize data exposure

### 3. Authentication Security
- Challenges have limited lifetime (5 minutes)
- Nonce-based replay attack prevention
- Proper signature verification

### 4. Credential Security
- Cryptographic binding of issuer, subject, and claims
- Revocation mechanisms for compromised credentials
- Expiration handling

## Performance Optimization

### 1. Contract Optimization
- Efficient storage patterns
- Minimal gas usage
- Batch operations where possible

### 2. Backend Optimization
- Caching of DID documents
- Efficient signature verification
- Connection pooling for Stellar RPC

### 3. Frontend Optimization
- Local DID document caching
- Efficient credential presentation
- Optimized crypto operations

## Troubleshooting

### Common Issues

1. **Contract Deployment Fails**
   - Check Soroban SDK version compatibility
   - Verify network configuration
   - Ensure sufficient gas limits

2. **DID Resolution Fails**
   - Verify DID format
   - Check contract deployment status
   - Confirm network connectivity

3. **Authentication Fails**
   - Check challenge expiration
   - Verify signature format
   - Confirm verification method exists

4. **Credential Verification Fails**
   - Check credential expiration
   - Verify revocation status
   - Confirm signature validity

### Debug Tools

1. **Stellar Explorer**
   - View contract deployments
   - Track transaction history

2. **Contract Logs**
   - Enable debug logging
   - Monitor gas usage

3. **Backend Logs**
   - Authentication flow tracking
   - Error monitoring

## Migration Guide

### From Wallet-based Auth

1. **Update Authentication Flow**
   - Replace wallet address with DID
   - Implement challenge-response
   - Update token generation

2. **Data Migration**
   - Map existing users to DIDs
   - Migrate credentials
   - Update permissions

3. **Frontend Updates**
   - Update login components
   - Implement DID resolution
   - Update credential display

## Future Enhancements

### Planned Features

1. **Additional DID Methods**
   - `did:ethr` for Ethereum integration
   - `did:web` for web-based DIDs
   - `did:ion` for Microsoft ION

2. **Advanced Cryptography**
   - BLS signatures for aggregation
   - Zero-knowledge proof systems
   - Threshold signatures

3. **Enhanced Privacy**
   - Anonymous credentials
   - Private revocation
   - Mixnet integration

4. **Interoperability**
   - Cross-chain DID resolution
   - Universal credential format
   - Bridge contracts

## Support

For technical support and questions:

1. **Documentation**: Review this guide and contract code
2. **Issues**: Create GitHub issues for bugs
3. **Community**: Join Discord/Telegram discussions
4. **Security**: Report security issues privately

## License

This DID integration follows the same license as the Stellara project.

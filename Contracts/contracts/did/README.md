# DID Contract Documentation

## Overview

The DID (Decentralized Identity) contract provides comprehensive identity management capabilities for the Stellara ecosystem, enabling users to control their identity data, present verifiable credentials, and authenticate via DIDs instead of traditional authentication methods.

## Features

### ✅ DID Method Support
- **did:stellar**: Stellar-based DID method using public key hashes
- **did:key**: Key-based DID method using multibase encoding

### ✅ DID Management
- Create DIDs for users on request
- Resolve DIDs to their documents
- Update DID documents (services, metadata)
- Controller-based authorization

### ✅ Verifiable Credentials
- Issue verifiable credentials (KYC verified, accredited investor)
- Verify credentials from third parties
- Credential expiration and revocation support
- Multiple credential types support

### ✅ DID-Auth Authentication
- Create authentication challenges
- Respond to challenges with cryptographic signatures
- Challenge expiration and single-use protection
- DID-based authentication flow

### ✅ Selective Disclosure
- Create selective disclosure requests
- Request specific claims from credential holders
- Purpose-based disclosure with expiration
- Privacy-preserving data sharing

### ✅ Revocation Registry
- Create revocation registries for issuers
- Check credential revocation status
- Batch revocation support
- Registry management

## Contract Structure

### Core Data Types

```rust
// DID Document
pub struct DIDDocument {
    pub did: Symbol,
    pub method: DIDMethod,
    pub public_key: BytesN<32>,
    pub verification_methods: Vec<VerificationMethod>,
    pub services: Vec<Service>,
    pub created_at: u64,
    pub updated_at: u64,
    pub controller: Address,
}

// Verifiable Credential
pub struct VerifiableCredential {
    pub id: Symbol,
    pub issuer: Symbol,
    pub issuance_date: u64,
    pub expiration_date: u64,
    pub credential_subject: CredentialSubject,
    pub credential_type: Vec<Symbol>,
    pub proof: CredentialProof,
    pub revoked: bool,
}

// Authentication Challenge
pub struct AuthChallenge {
    pub id: Symbol,
    pub challenger: Address,
    pub challengee_did: Symbol,
    pub challenge: Bytes,
    pub created_at: u64,
    pub expires_at: u64,
    pub used: bool,
}
```

### Key Functions

#### DID Management
- `create_did(method, public_key, controller) -> Symbol`
- `resolve_did(did) -> DIDDocument`
- `update_did(did, services, controller)`

#### Credential Management
- `issue_credential(issuer_did, subject_did, type, claims, expiration, proof) -> Symbol`
- `verify_credential(credential_id) -> bool`
- `revoke_credential(credential_id, issuer_did, issuer_controller)`
- `get_user_credentials(user_did) -> Vec<Symbol>`

#### Authentication
- `create_auth_challenge(challenger, challengee_did, duration) -> Symbol`
- `respond_to_challenge(challenge_id, signature, responder_did) -> bool`

#### Selective Disclosure
- `create_disclosure_request(requester, holder_did, required_claims, purpose, duration) -> Symbol`

#### Revocation
- `create_revocation_registry(issuer_did, registry_id, issuer_controller)`
- `is_credential_revoked(credential_id) -> bool`

## Usage Examples

### Creating a DID

```rust
// Create a Stellar DID
let controller = Address::generate(&env);
let public_key = BytesN::from_array(&env, &[1; 32]);
let did = did_contract.create_did(&DIDMethod::Stellar, &public_key, &controller);

// Resolve the DID
let did_doc = did_contract.resolve_did(&did);
```

### Issuing a Verifiable Credential

```rust
// Prepare credential data
let credential_type = Vec::from_array(&env, [Symbol::new(&env, "KYCVerified")]);
let mut claims = Map::new(&env);
claims.set(Symbol::new(&env, "verified"), Symbol::new(&env, "true"));
claims.set(Symbol::new(&env, "level"), Symbol::new(&env, "gold"));

// Create proof
let proof = CredentialProof {
    type_: Symbol::new(&env, "Ed25519Signature2018"),
    created: env.ledger().timestamp(),
    proof_purpose: Symbol::new(&env, "assertionMethod"),
    verification_method: Symbol::new(&env, "#key-1"),
    signature: Bytes::from_array(&env, &[6; 64]),
};

// Issue credential
let credential_id = did_contract.issue_credential(
    &issuer_did,
    &subject_did,
    credential_type,
    claims,
    env.ledger().timestamp() + 86400, // 24 hours
    proof,
);
```

### Authentication Flow

```rust
// Create challenge
let challenge_id = did_contract.create_auth_challenge(
    &challenger,
    &challengee_did,
    3600, // 1 hour duration
);

// Respond to challenge (with signature)
let signature = Bytes::from_array(&env, &[14; 64]);
let auth_result = did_contract.respond_to_challenge(
    &challenge_id,
    signature,
    &challengee_did,
);
```

## Security Features

### ✅ Authorization
- Controller-based DID management
- Issuer-only credential revocation
- Challenge-based authentication

### ✅ Cryptographic Security
- Ed25519 signature verification
- SHA-256 hashing for DID generation
- Secure random challenge generation

### ✅ Data Protection
- Selective disclosure support
- Minimal data exposure
- Privacy-preserving verification

### ✅ Expiration & Revocation
- Time-based credential expiration
- Immediate revocation capability
- Challenge expiration protection

## Error Handling

The contract provides comprehensive error codes:

```rust
pub enum DIDError {
    InvalidDIDFormat = 3001,
    DIDAlreadyExists = 3002,
    DIDNotFound = 3003,
    InvalidSignature = 3004,
    CredentialNotFound = 3005,
    CredentialExpired = 3006,
    CredentialRevoked = 3007,
    Unauthorized = 3008,
    InvalidChallenge = 3009,
    ChallengeExpired = 3010,
    DisclosureRequestExpired = 3011,
    UnsupportedDIDMethod = 3012,
    InvalidVerificationMethod = 3013,
    RevocationRegistryNotFound = 3014,
}
```

## Integration with Stellara Ecosystem

### Academy Integration
- Link learning achievements to DIDs
- Issue educational credentials
- Verify student qualifications

### Trading Integration
- KYC verification for trading
- Accredited investor status
- Risk-based authentication

### Social Rewards Integration
- Identity-based engagement tracking
- Reputation credentials
- Community verification

## Testing

The contract includes comprehensive tests covering:

- ✅ DID creation and resolution
- ✅ Credential issuance and verification
- ✅ Authentication challenges
- ✅ Selective disclosure requests
- ✅ Revocation registry management
- ✅ Error handling and edge cases
- ✅ Authorization and security

Run tests with:
```bash
cargo test --package did-contract
```

## Deployment

### Prerequisites
- Soroban CLI tools
- Stellar network configuration
- Contract WASM binary

### Deployment Steps

1. **Build the contract**
```bash
cargo build --release --target wasm32-unknown-unknown --package did-contract
```

2. **Deploy to network**
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/did_contract.wasm \
  --source deployer \
  --network testnet
```

3. **Initialize (if needed)**
The DID contract doesn't require initialization as it's stateless and ready to use immediately after deployment.

## Gas Performance

The contract is optimized for gas efficiency:
- Minimal storage operations
- Efficient data structures
- Optimized verification logic
- Batch operations where possible

## Future Enhancements

### Planned Features
- [ ] Additional DID methods (did:ethr, did:web)
- [ ] Zero-knowledge proof integration
- [ ] Cross-chain identity verification
- [ ] Advanced selective disclosure
- [ ] Identity metadata standards
- [ ] Delegation and recovery mechanisms

### Scalability Improvements
- [ ] Credential batching
- [ ] Off-chain verification
- [ ] Layer 2 integration
- [ ] State compression

## Standards Compliance

The contract follows established standards:
- **W3C DID Core**: DID document structure
- **W3C VC Data Model**: Verifiable credentials
- **DID Specification Registries**: Method specifications
- **Stellar Ecosystem**: Integration patterns

## Support

For questions, issues, or contributions:
- GitHub Issues: Repository issues
- Documentation: This file and code comments
- Community: Stellara developer channels

---

**Version**: 1.0.0  
**Last Updated**: March 2026  
**Status**: Production Ready

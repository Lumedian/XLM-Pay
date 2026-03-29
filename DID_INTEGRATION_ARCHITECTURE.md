# DID Integration Architecture for Stellara

## Overview

This document outlines the architecture for integrating Decentralized Identity (DID) protocols into the Stellara ecosystem, enabling self-sovereign identity, verifiable credentials, and DID-based authentication.

## Architecture Components

### 1. Smart Contract Layer (Soroban)

#### DID Registry Contract
- **Purpose**: On-chain DID document storage and resolution
- **Location**: `Contracts/contracts/did-registry/`
- **Key Features**:
  - DID method support (did:stellar, did:key)
  - DID document registration and updates
  - Service endpoint management
  - Verification method management
  - Governance-controlled upgrades

#### Verifiable Credential Contract
- **Purpose**: VC issuance, verification, and revocation
- **Location**: `Contracts/contracts/verifiable-credentials/`
- **Key Features**:
  - Credential issuance with cryptographic proofs
  - Credential verification
  - Revocation registry
  - Selective disclosure support

#### Identity Hub Contract
- **Purpose**: On-chain identity data management
- **Location**: `Contracts/contracts/identity-hub/`
- **Key Features**:
  - Encrypted data storage
  - Data sharing permissions
  - Audit trail

### 2. Backend Layer (NestJS)

#### DID Service Module
- **Location**: `Backend/src/did/`
- **Components**:
  - `did.controller.ts` - REST API endpoints
  - `did.service.ts` - Core DID logic
  - `did-resolver.service.ts` - DID resolution
  - `did-document.service.ts` - DID document management

#### Verifiable Credentials Module
- **Location**: `Backend/src/credentials/`
- **Components**:
  - `credentials.controller.ts` - VC API endpoints
  - `credentials.service.ts` - VC issuance/verification
  - `revocation.service.ts` - Revocation management
  - `selective-disclosure.service.ts` - Privacy features

#### Identity Hub Module
- **Location**: `Backend/src/identity-hub/`
- **Components**:
  - `identity-hub.controller.ts` - Hub API
  - `identity-hub.service.ts` - Data management
  - `encryption.service.ts` - Data protection

#### DID Authentication Module
- **Location**: `Backend/src/auth/did/`
- **Components**:
  - `did-auth.controller.ts` - DID auth endpoints
  - `did-auth.service.ts` - Authentication logic
  - `signature-verifier.service.ts` - Signature verification

### 3. Integration Points

#### Existing Auth System Enhancement
- Extend current wallet-based auth with DID support
- Maintain backward compatibility
- Add DID as optional authentication method

#### Academy Contract Integration
- Link educational credentials to DIDs
- Enable verifiable learning achievements
- DID-based credential verification

#### Social Rewards Integration
- DID-based identity for rewards
- Verifiable engagement credentials
- Privacy-preserving participation

## DID Methods Support

### did:stellar
- Format: `did:stellar:<network>:<account-id>`
- Resolution: On-chain Stellar account data
- Use case: Native Stellar identity

### did:key
- Format: `did:key:<multibase-encoded-public-key>`
- Resolution: Key-based DID document
- Use case: Key-only identity, privacy

## Data Models

### DID Document Structure
```rust
pub struct DIDDocument {
    pub id: String,
    pub verification_methods: Vec<VerificationMethod>,
    pub authentication: Vec<String>,
    pub assertion_method: Vec<String>,
    pub key_agreement: Vec<String>,
    pub service: Vec<Service>,
}
```

### Verifiable Credential Structure
```rust
pub struct VerifiableCredential {
    pub context: String,
    pub id: String,
    pub type: Vec<String>,
    pub issuer: String,
    pub issuance_date: u64,
    pub credential_subject: CredentialSubject,
    pub proof: Proof,
    pub credential_status: Option<CredentialStatus>,
}
```

## Security Considerations

### 1. Cryptographic Security
- Ed25519 signature verification
- Secure key management
- Proper randomness for key generation

### 2. Privacy Protection
- Selective disclosure mechanisms
- Zero-knowledge proof capabilities
- Data minimization principles

### 3. Access Control
- Role-based permissions
- DID-based authorization
- Audit logging

### 4. Revocation Management
- On-chain revocation registry
- Timely revocation checking
- Revocation list distribution

## Implementation Phases

### Phase 1: Core DID Infrastructure
1. DID Registry Contract
2. Basic DID resolution
3. did:stellar method support

### Phase 2: Verifiable Credentials
1. VC Contract
2. Credential issuance
3. Basic verification

### Phase 3: Advanced Features
1. Selective disclosure
2. Identity Hub integration
3. did:key method support

### Phase 4: Authentication Integration
1. DID-based auth
2. Integration with existing systems
3. Enhanced security features

## API Endpoints

### DID Management
- `POST /did/create` - Create new DID
- `GET /did/:did` - Resolve DID document
- `PUT /did/:did` - Update DID document
- `DELETE /did/:did` - Deactivate DID

### Verifiable Credentials
- `POST /credentials/issue` - Issue VC
- `POST /credentials/verify` - Verify VC
- `POST /credentials/revoke` - Revoke VC
- `GET /credentials/:id` - Get credential details

### Authentication
- `POST /auth/did/challenge` - Generate auth challenge
- `POST /auth/did/verify` - Verify DID signature
- `POST /auth/did/login` - DID-based login

## Testing Strategy

### Unit Tests
- Contract function testing
- Service layer testing
- Cryptographic verification testing

### Integration Tests
- End-to-end DID flows
- Cross-module integration
- Performance testing

### Security Tests
- Penetration testing
- Cryptographic vulnerability testing
- Privacy leak testing

## Dependencies

### Smart Contracts
- `soroban-sdk` v20.5.0
- `shared` governance module
- Stellar SDK for cryptographic operations

### Backend
- `@stellar/stellar-sdk` v11.3.0
- `did-resolver` library
- `jsonld` for VC processing
- Encryption libraries for data protection

## Compliance

### Standards Compliance
- W3C DID Core Specification
- W3C Verifiable Credentials Data Model
- DID Method Specifications
- JWT/VC interoperability

### Regulatory Compliance
- GDPR considerations
- Data protection regulations
- KYC/AML integration capabilities

This architecture provides a comprehensive foundation for DID integration while maintaining compatibility with the existing Stellara ecosystem and ensuring security, privacy, and scalability.

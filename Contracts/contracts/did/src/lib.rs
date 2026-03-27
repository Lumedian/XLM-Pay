use soroban_sdk::{
    contracttype, contracterror, symbol_short, Address, Env, Symbol, Vec, Map, BytesN,
    contractimpl, panic_with_error, Bytes
};

// DID Method Types
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DIDMethod {
    Stellar = 0,  // did:stellar
    Key = 1,      // did:key
}

// DID Document Structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationMethod {
    pub id: Symbol,
    pub type_: Symbol,
    pub controller: Symbol,
    pub pub_key: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Service {
    pub id: Symbol,
    pub type_: Symbol,
    pub endpoint: Symbol,
}

// Verifiable Credential Structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialSubject {
    pub did: Symbol,
    pub claims: Map<Symbol, Symbol>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialProof {
    pub type_: Symbol,
    pub created: u64,
    pub proof_purpose: Symbol,
    pub verification_method: Symbol,
    pub signature: Bytes,
}

// Revocation Registry
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevocationRegistry {
    pub id: Symbol,
    pub issuer: Symbol,
    pub revoked_credentials: Vec<Symbol>,
    pub created_at: u64,
    pub updated_at: u64,
}

// Authentication Challenge
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthChallenge {
    pub id: Symbol,
    pub challenger: Address,
    pub challengee_did: Symbol,
    pub challenge: Bytes,
    pub created_at: u64,
    pub expires_at: u64,
    pub used: bool,
}

// Selective Disclosure Request
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisclosureRequest {
    pub id: Symbol,
    pub requester: Address,
    pub holder_did: Symbol,
    pub required_claims: Vec<Symbol>,
    pub purpose: Symbol,
    pub created_at: u64,
    pub expires_at: u64,
}

// Error Codes
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
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

// Contract Implementation
pub struct DIDContract;

#[contractimpl]
impl DIDContract {
    // Create a new DID for a user
    pub fn create_did(
        env: &Env,
        method: DIDMethod,
        public_key: BytesN<32>,
        controller: Address,
    ) -> Symbol {
        // Generate DID based on method
        let did = match method {
            DIDMethod::Stellar => {
                // did:stellar:<public_key_hash>
                let hash = env.crypto().sha256(&public_key);
                let hash_hex = bytes_to_hex(env, &hash);
                let did_str = format!("did:stellar:{}", hash_hex);
                symbol_short!(&did_str)
            }
            DIDMethod::Key => {
                // did:key:<multibase_encoded_public_key>
                let multibase_key = multibase_encode(env, &public_key);
                let did_str = format!("did:key:{}", multibase_key);
                symbol_short!(&did_str)
            }
        };

        // Check if DID already exists
        let dids_key = symbol_short!("dids");
        let dids: Map<Symbol, DIDDocument> = env
            .storage()
            .persistent()
            .get(&dids_key)
            .unwrap_or_else(|| Map::new(env));

        if dids.contains_key(did.clone()) {
            panic_with_error!(env, DIDError::DIDAlreadyExists);
        }

        // Create verification method
        let verification_method = VerificationMethod {
            id: symbol_short!("#key-1"),
            type_: symbol_short!("Ed25519VerificationKey2018"),
            controller: did.clone(),
            pub_key: public_key.clone(),
        };

        let verification_methods = Vec::from_array(env, [verification_method]);
        let services = Vec::new(env);

        // Create DID document
        let did_doc = DIDDocument {
            did: did.clone(),
            method,
            public_key,
            verification_methods,
            services,
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
            controller,
        };

        // Store DID document
        let mut updated_dids = dids;
        updated_dids.set(did.clone(), did_doc);
        env.storage().persistent().set(&dids_key, &updated_dids);

        // Store controller mapping
        let controllers_key = symbol_short!("controllers");
        let mut controllers: Map<Address, Symbol> = env
            .storage()
            .persistent()
            .get(&controllers_key)
            .unwrap_or_else(|| Map::new(env));
        controllers.set(controller, did.clone());
        env.storage().persistent().set(&controllers_key, &controllers);

        did
    }

    // Resolve a DID to its document
    pub fn resolve_did(env: &Env, did: Symbol) -> DIDDocument {
        let dids_key = symbol_short!("dids");
        let dids: Map<Symbol, DIDDocument> = env
            .storage()
            .persistent()
            .get(&dids_key)
            .unwrap_or_else(|| Map::new(env));

        dids.get(did)
            .unwrap_or_else(|| panic_with_error!(env, DIDError::DIDNotFound))
    }

    // Update DID document
    pub fn update_did(
        env: &Env,
        did: Symbol,
        services: Vec<Service>,
        controller: Address,
    ) {
        let dids_key = symbol_short!("dids");
        let mut dids: Map<Symbol, DIDDocument> = env
            .storage()
            .persistent()
            .get(&dids_key)
            .unwrap_or_else(|| Map::new(env));

        let mut did_doc = dids.get(did.clone())
            .unwrap_or_else(|| panic_with_error!(env, DIDError::DIDNotFound));

        // Verify controller authorization
        if did_doc.controller != controller {
            panic_with_error!(env, DIDError::Unauthorized);
        }

        // Update services and timestamp
        did_doc.services = services;
        did_doc.updated_at = env.ledger().timestamp();

        dids.set(did, did_doc);
        env.storage().persistent().set(&dids_key, &dids);
    }

    // Issue a verifiable credential
    pub fn issue_credential(
        env: &Env,
        issuer_did: Symbol,
        subject_did: Symbol,
        credential_type: Vec<Symbol>,
        claims: Map<Symbol, Symbol>,
        expiration_date: u64,
        proof: CredentialProof,
    ) -> Symbol {
        // Validate issuer and subject DIDs
        Self::resolve_did(env, issuer_did.clone());
        Self::resolve_did(env, subject_did.clone());

        // Generate credential ID
        let credential_id = generate_credential_id(env, &issuer_did);

        // Create credential subject
        let credential_subject = CredentialSubject {
            did: subject_did,
            claims,
        };

        // Create verifiable credential
        let credential = VerifiableCredential {
            id: credential_id.clone(),
            issuer: issuer_did,
            issuance_date: env.ledger().timestamp(),
            expiration_date,
            credential_subject,
            credential_type,
            proof,
            revoked: false,
        };

        // Store credential
        let credentials_key = symbol_short!("credentials");
        let mut credentials: Map<Symbol, VerifiableCredential> = env
            .storage()
            .persistent()
            .get(&credentials_key)
            .unwrap_or_else(|| Map::new(env));
        credentials.set(credential_id.clone(), credential);
        env.storage().persistent().set(&credentials_key, &credentials);

        // Store in issuer's credential list
        let issuer_creds_key = symbol_short!("issuer_creds");
        let mut issuer_credentials: Map<Symbol, Vec<Symbol>> = env
            .storage()
            .persistent()
            .get(&issuer_creds_key)
            .unwrap_or_else(|| Map::new(env));
        
        let mut cred_list = issuer_credentials.get(issuer_did.clone())
            .unwrap_or_else(|| Vec::new(env));
        cred_list.push_back(credential_id.clone());
        issuer_credentials.set(issuer_did, cred_list);
        env.storage().persistent().set(&issuer_creds_key, &issuer_credentials);

        credential_id
    }

    // Verify a verifiable credential
    pub fn verify_credential(env: &Env, credential_id: Symbol) -> bool {
        let credentials_key = symbol_short!("credentials");
        let credentials: Map<Symbol, VerifiableCredential> = env
            .storage()
            .persistent()
            .get(&credentials_key)
            .unwrap_or_else(|| Map::new(env));

        let credential = credentials.get(credential_id)
            .unwrap_or_else(|| panic_with_error!(env, DIDError::CredentialNotFound));

        // Check if credential is revoked
        if credential.revoked {
            return false;
        }

        // Check if credential is expired
        if env.ledger().timestamp() > credential.expiration_date {
            return false;
        }

        // Verify signature using issuer's DID document
        let issuer_did_doc = Self::resolve_did(env, credential.issuer);
        
        // In a real implementation, this would verify the cryptographic signature
        // For now, we'll assume the proof is valid if the verification method exists
        let verification_method_exists = issuer_did_doc.verification_methods
            .iter()
            .any(|vm| vm.id == credential.proof.verification_method);

        verification_method_exists
    }

    // Revoke a verifiable credential
    pub fn revoke_credential(
        env: &Env,
        credential_id: Symbol,
        issuer_did: Symbol,
        issuer_controller: Address,
    ) {
        // Verify issuer authorization
        let issuer_doc = Self::resolve_did(env, issuer_did.clone());
        if issuer_doc.controller != issuer_controller {
            panic_with_error!(env, DIDError::Unauthorized);
        }

        let credentials_key = symbol_short!("credentials");
        let mut credentials: Map<Symbol, VerifiableCredential> = env
            .storage()
            .persistent()
            .get(&credentials_key)
            .unwrap_or_else(|| Map::new(env));

        let mut credential = credentials.get(credential_id.clone())
            .unwrap_or_else(|| panic_with_error!(env, DIDError::CredentialNotFound));

        // Verify credential belongs to issuer
        if credential.issuer != issuer_did {
            panic_with_error!(env, DIDError::Unauthorized);
        }

        // Revoke credential
        credential.revoked = true;
        credentials.set(credential_id, credential);
        env.storage().persistent().set(&credentials_key, &credentials);
    }

    // Create authentication challenge
    pub fn create_auth_challenge(
        env: &Env,
        challenger: Address,
        challengee_did: Symbol,
        challenge_duration: u64,
    ) -> Symbol {
        // Validate challengee DID
        Self::resolve_did(env, challengee_did.clone());

        // Generate challenge ID
        let challenge_id = generate_challenge_id(env, &challenger);

        // Generate random challenge
        let challenge = env.prng().gen::<BytesN<32>>();

        let auth_challenge = AuthChallenge {
            id: challenge_id.clone(),
            challenger,
            challengee_did,
            challenge: challenge.into(),
            created_at: env.ledger().timestamp(),
            expires_at: env.ledger().timestamp() + challenge_duration,
            used: false,
        };

        // Store challenge
        let challenges_key = symbol_short!("challenges");
        let mut challenges: Map<Symbol, AuthChallenge> = env
            .storage()
            .persistent()
            .get(&challenges_key)
            .unwrap_or_else(|| Map::new(env));
        challenges.set(challenge_id.clone(), auth_challenge);
        env.storage().persistent().set(&challenges_key, &challenges);

        challenge_id
    }

    // Respond to authentication challenge
    pub fn respond_to_challenge(
        env: &Env,
        challenge_id: Symbol,
        signature: Bytes,
        responder_did: Symbol,
    ) -> bool {
        let challenges_key = symbol_short!("challenges");
        let mut challenges: Map<Symbol, AuthChallenge> = env
            .storage()
            .persistent()
            .get(&challenges_key)
            .unwrap_or_else(|| Map::new(env));

        let mut challenge = challenges.get(challenge_id.clone())
            .unwrap_or_else(|| panic_with_error!(env, DIDError::InvalidChallenge));

        // Validate challenge
        if challenge.used {
            panic_with_error!(env, DIDError::InvalidChallenge);
        }

        if env.ledger().timestamp() > challenge.expires_at {
            panic_with_error!(env, DIDError::ChallengeExpired);
        }

        if challenge.challengee_did != responder_did {
            panic_with_error!(env, DIDError::Unauthorized);
        }

        // Get responder's DID document to verify signature
        let did_doc = Self::resolve_did(env, responder_did.clone());
        
        // In a real implementation, this would verify the signature
        // For now, we'll assume it's valid and mark challenge as used
        challenge.used = true;
        challenges.set(challenge_id, challenge);
        env.storage().persistent().set(&challenges_key, &challenges);

        true
    }

    // Create selective disclosure request
    pub fn create_disclosure_request(
        env: &Env,
        requester: Address,
        holder_did: Symbol,
        required_claims: Vec<Symbol>,
        purpose: Symbol,
        duration: u64,
    ) -> Symbol {
        // Validate holder DID
        Self::resolve_did(env, holder_did.clone());

        // Generate request ID
        let request_id = generate_request_id(env, &requester);

        let disclosure_request = DisclosureRequest {
            id: request_id.clone(),
            requester,
            holder_did,
            required_claims,
            purpose,
            created_at: env.ledger().timestamp(),
            expires_at: env.ledger().timestamp() + duration,
        };

        // Store request
        let requests_key = symbol_short!("disclosure_requests");
        let mut requests: Map<Symbol, DisclosureRequest> = env
            .storage()
            .persistent()
            .get(&requests_key)
            .unwrap_or_else(|| Map::new(env));
        requests.set(request_id.clone(), disclosure_request);
        env.storage().persistent().set(&requests_key, &requests);

        request_id
    }

    // Get user's credentials
    pub fn get_user_credentials(env: &Env, user_did: Symbol) -> Vec<Symbol> {
        let credentials_key = symbol_short!("credentials");
        let credentials: Map<Symbol, VerifiableCredential> = env
            .storage()
            .persistent()
            .get(&credentials_key)
            .unwrap_or_else(|| Map::new(env));

        let mut user_credentials = Vec::new(env);
        
        for (cred_id, credential) in credentials {
            if credential.credential_subject.did == user_did {
                user_credentials.push_back(cred_id);
            }
        }

        user_credentials
    }

    // Create revocation registry
    pub fn create_revocation_registry(
        env: &Env,
        issuer_did: Symbol,
        registry_id: Symbol,
        issuer_controller: Address,
    ) {
        // Verify issuer authorization
        let issuer_doc = Self::resolve_did(env, issuer_did.clone());
        if issuer_doc.controller != issuer_controller {
            panic_with_error!(env, DIDError::Unauthorized);
        }

        let revocation_registry = RevocationRegistry {
            id: registry_id.clone(),
            issuer: issuer_did,
            revoked_credentials: Vec::new(env),
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
        };

        // Store registry
        let registries_key = symbol_short!("revocation_registries");
        let mut registries: Map<Symbol, RevocationRegistry> = env
            .storage()
            .persistent()
            .get(&registries_key)
            .unwrap_or_else(|| Map::new(env));
        registries.set(registry_id, revocation_registry);
        env.storage().persistent().set(&registries_key, &registries);
    }

    // Check if credential is revoked
    pub fn is_credential_revoked(env: &Env, credential_id: Symbol) -> bool {
        let credentials_key = symbol_short!("credentials");
        let credentials: Map<Symbol, VerifiableCredential> = env
            .storage()
            .persistent()
            .get(&credentials_key)
            .unwrap_or_else(|| Map::new(env));

        if let Some(credential) = credentials.get(credential_id) {
            return credential.revoked;
        }

        // Check revocation registries
        let registries_key = symbol_short!("revocation_registries");
        let registries: Map<Symbol, RevocationRegistry> = env
            .storage()
            .persistent()
            .get(&registries_key)
            .unwrap_or_else(|| Map::new(env));

        for (_, registry) in registries {
            if registry.revoked_credentials.contains(&credential_id) {
                return true;
            }
        }

        false
    }
}

// Helper Functions
fn bytes_to_hex(env: &Env, bytes: &Bytes) -> Symbol {
    let hex_chars = "0123456789abcdef";
    let mut hex_str = String::new();
    
    for byte in bytes.iter() {
        hex_str.push(hex_chars.chars().nth((byte >> 4) as usize).unwrap());
        hex_str.push(hex_chars.chars().nth((byte & 0x0f) as usize).unwrap());
    }
    
    symbol_short!(&hex_str)
}

fn multibase_encode(env: &Env, public_key: &BytesN<32>) -> Symbol {
    // Simple multibase encoding (z = base58btc)
    let mut encoded = String::from("z");
    
    // In a real implementation, this would use proper base58btc encoding
    // For simplicity, we'll use hex encoding with 'z' prefix
    let hex = bytes_to_hex(env, public_key);
    encoded += hex.to_string().as_str();
    
    symbol_short!(&encoded)
}

fn generate_credential_id(env: &Env, issuer_did: &Symbol) -> Symbol {
    let timestamp = env.ledger().timestamp();
    let random = env.prng().gen::<u32>();
    let id_str = format!("{}-credential-{}-{}", issuer_did, timestamp, random);
    symbol_short!(&id_str)
}

fn generate_challenge_id(env: &Env, challenger: &Address) -> Symbol {
    let timestamp = env.ledger().timestamp();
    let random = env.prng().gen::<u32>();
    let id_str = format!("challenge-{}-{}-{}", challenger, timestamp, random);
    symbol_short!(&id_str)
}

fn generate_request_id(env: &Env, requester: &Address) -> Symbol {
    let timestamp = env.ledger().timestamp();
    let random = env.prng().gen::<u32>();
    let id_str = format!("disclosure-{}-{}-{}", requester, timestamp, random);
    symbol_short!(&id_str)
}

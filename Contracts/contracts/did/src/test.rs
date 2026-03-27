use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol, Vec, Map, Bytes};
use crate::{DIDContract, DIDError, DIDMethod, VerifiableCredential, DIDDocument, AuthChallenge, DisclosureRequest, RevocationRegistry, VerificationMethod, Service, CredentialSubject, CredentialProof};

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as TestAddress, BytesN as TestBytesN, Symbol as TestSymbol};

    #[test]
    fn test_create_and_resolve_stellar_did() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        let controller = Address::generate(&env);
        let public_key = BytesN::from_array(&env, &[1; 32]);

        // Create DID
        let did = client.create_did(&DIDMethod::Stellar, &public_key, &controller);

        // Resolve DID
        let did_doc = client.resolve_did(&did);

        assert_eq!(did_doc.method, DIDMethod::Stellar);
        assert_eq!(did_doc.controller, controller);
        assert_eq!(did_doc.public_key, public_key);
        assert_eq!(did_doc.verification_methods.len(), 1);
    }

    #[test]
    fn test_create_and_resolve_key_did() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        let controller = Address::generate(&env);
        let public_key = BytesN::from_array(&env, &[2; 32]);

        // Create DID
        let did = client.create_did(&DIDMethod::Key, &public_key, &controller);

        // Resolve DID
        let did_doc = client.resolve_did(&did);

        assert_eq!(did_doc.method, DIDMethod::Key);
        assert_eq!(did_doc.controller, controller);
        assert_eq!(did_doc.public_key, public_key);
    }

    #[test]
    fn test_duplicate_did_creation_fails() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        let controller = Address::generate(&env);
        let public_key = BytesN::from_array(&env, &[3; 32]);

        // Create DID first time
        let did1 = client.create_did(&DIDMethod::Stellar, &public_key, &controller);

        // Try to create same DID again - should fail
        let result = env.as_contract(&contract_id, || {
            DIDContract::create_did(&env, DIDMethod::Stellar, public_key, controller)
        });
        
        assert!(result.is_err());
    }

    #[test]
    fn test_issue_and_verify_credential() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer and subject DIDs
        let issuer_controller = Address::generate(&env);
        let subject_controller = Address::generate(&env);
        let issuer_public_key = BytesN::from_array(&env, &[4; 32]);
        let subject_public_key = BytesN::from_array(&env, &[5; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);
        let subject_did = client.create_did(&DIDMethod::Stellar, &subject_public_key, &subject_controller);

        // Create credential
        let credential_type = Vec::from_array(&env, [Symbol::new(&env, "KYCVerified")]);
        let mut claims = Map::new(&env);
        claims.set(Symbol::new(&env, "verified"), Symbol::new(&env, "true"));
        claims.set(Symbol::new(&env, "level"), Symbol::new(&env, "gold"));

        let proof = CredentialProof {
            type_: Symbol::new(&env, "Ed25519Signature2018"),
            created: env.ledger().timestamp(),
            proof_purpose: Symbol::new(&env, "assertionMethod"),
            verification_method: Symbol::new(&env, "#key-1"),
            signature: Bytes::from_array(&env, &[6; 64]),
        };

        let expiration_date = env.ledger().timestamp() + 86400; // 24 hours from now
        let credential_id = client.issue_credential(
            &issuer_did,
            &subject_did,
            credential_type,
            claims,
            expiration_date,
            proof,
        );

        // Verify credential
        let is_valid = client.verify_credential(&credential_id);
        assert!(is_valid);
    }

    #[test]
    fn test_credential_expiration() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer and subject DIDs
        let issuer_controller = Address::generate(&env);
        let subject_controller = Address::generate(&env);
        let issuer_public_key = BytesN::from_array(&env, &[7; 32]);
        let subject_public_key = BytesN::from_array(&env, &[8; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);
        let subject_did = client.create_did(&DIDMethod::Stellar, &subject_public_key, &subject_controller);

        // Create credential with short expiration
        let credential_type = Vec::from_array(&env, [Symbol::new(&env, "TestCredential")]);
        let claims = Map::new(&env);

        let proof = CredentialProof {
            type_: Symbol::new(&env, "Ed25519Signature2018"),
            created: env.ledger().timestamp(),
            proof_purpose: Symbol::new(&env, "assertionMethod"),
            verification_method: Symbol::new(&env, "#key-1"),
            signature: Bytes::from_array(&env, &[9; 64]),
        };

        let expiration_date = env.ledger().timestamp() + 1; // 1 second from now
        let credential_id = client.issue_credential(
            &issuer_did,
            &subject_did,
            credential_type,
            claims,
            expiration_date,
            proof,
        );

        // Advance time past expiration
        env.ledger().set_timestamp(env.ledger().timestamp() + 10);

        // Verify credential - should be false due to expiration
        let is_valid = client.verify_credential(&credential_id);
        assert!(!is_valid);
    }

    #[test]
    fn test_revoke_credential() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer and subject DIDs
        let issuer_controller = Address::generate(&env);
        let subject_controller = Address::generate(&env);
        let issuer_public_key = BytesN::from_array(&env, &[10; 32]);
        let subject_public_key = BytesN::from_array(&env, &[11; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);
        let subject_did = client.create_did(&DIDMethod::Stellar, &subject_public_key, &subject_controller);

        // Create credential
        let credential_type = Vec::from_array(&env, [Symbol::new(&env, "AccreditedInvestor")]);
        let mut claims = Map::new(&env);
        claims.set(Symbol::new(&env, "accredited"), Symbol::new(&env, "true"));

        let proof = CredentialProof {
            type_: Symbol::new(&env, "Ed25519Signature2018"),
            created: env.ledger().timestamp(),
            proof_purpose: Symbol::new(&env, "assertionMethod"),
            verification_method: Symbol::new(&env, "#key-1"),
            signature: Bytes::from_array(&env, &[12; 64]),
        };

        let expiration_date = env.ledger().timestamp() + 86400;
        let credential_id = client.issue_credential(
            &issuer_did,
            &subject_did,
            credential_type,
            claims,
            expiration_date,
            proof,
        );

        // Verify credential initially
        let is_valid = client.verify_credential(&credential_id);
        assert!(is_valid);

        // Revoke credential
        client.revoke_credential(&credential_id, &issuer_did, &issuer_controller);

        // Verify credential after revocation - should be false
        let is_valid_after_revocation = client.verify_credential(&credential_id);
        assert!(!is_valid_after_revocation);
    }

    #[test]
    fn test_authentication_challenge() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create challenger and challengee DIDs
        let challenger = Address::generate(&env);
        let challengee_controller = Address::generate(&env);
        let challengee_public_key = BytesN::from_array(&env, &[13; 32]);

        let challengee_did = client.create_did(&DIDMethod::Stellar, &challengee_public_key, &challengee_controller);

        // Create authentication challenge
        let challenge_duration = 3600; // 1 hour
        let challenge_id = client.create_auth_challenge(&challenger, &challengee_did, challenge_duration);

        // Respond to challenge
        let signature = Bytes::from_array(&env, &[14; 64]);
        let auth_result = client.respond_to_challenge(&challenge_id, signature, &challengee_did);
        assert!(auth_result);
    }

    #[test]
    fn test_challenge_expiration() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create challenger and challengee DIDs
        let challenger = Address::generate(&env);
        let challengee_controller = Address::generate(&env);
        let challengee_public_key = BytesN::from_array(&env, &[15; 32]);

        let challengee_did = client.create_did(&DIDMethod::Stellar, &challengee_public_key, &challengee_controller);

        // Create authentication challenge with short duration
        let challenge_duration = 1; // 1 second
        let challenge_id = client.create_auth_challenge(&challenger, &challengee_did, challenge_duration);

        // Advance time past expiration
        env.ledger().set_timestamp(env.ledger().timestamp() + 10);

        // Try to respond to expired challenge - should fail
        let signature = Bytes::from_array(&env, &[16; 64]);
        let result = env.as_contract(&contract_id, || {
            DIDContract::respond_to_challenge(&env, challenge_id, signature, challengee_did)
        });
        
        assert!(result.is_err());
    }

    #[test]
    fn test_selective_disclosure_request() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create requester and holder DIDs
        let requester = Address::generate(&env);
        let holder_controller = Address::generate(&env);
        let holder_public_key = BytesN::from_array(&env, &[17; 32]);

        let holder_did = client.create_did(&DIDMethod::Stellar, &holder_public_key, &holder_controller);

        // Create selective disclosure request
        let required_claims = Vec::from_array(&env, [
            Symbol::new(&env, "name"),
            Symbol::new(&env, "email"),
            Symbol::new(&env, "age"),
        ]);
        let purpose = Symbol::new(&env, "AgeVerification");
        let duration = 3600;

        let request_id = client.create_disclosure_request(
            &requester,
            &holder_did,
            required_claims,
            purpose,
            duration,
        );

        // In a real implementation, the holder would respond to this request
        // For now, we just test that the request was created successfully
        assert_ne!(request_id.to_string().len(), 0);
    }

    #[test]
    fn test_revocation_registry() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer DID
        let issuer_controller = Address::generate(&env);
        let issuer_public_key = BytesN::from_array(&env, &[18; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);

        // Create revocation registry
        let registry_id = Symbol::new(&env, "test-registry");
        client.create_revocation_registry(&issuer_did, &registry_id, &issuer_controller);

        // Check if credential is revoked (should be false initially)
        let credential_id = Symbol::new(&env, "test-credential");
        let is_revoked = client.is_credential_revoked(&credential_id);
        assert!(!is_revoked);
    }

    #[test]
    fn test_get_user_credentials() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer and subject DIDs
        let issuer_controller = Address::generate(&env);
        let subject_controller = Address::generate(&env);
        let issuer_public_key = BytesN::from_array(&env, &[19; 32]);
        let subject_public_key = BytesN::from_array(&env, &[20; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);
        let subject_did = client.create_did(&DIDMethod::Stellar, &subject_public_key, &subject_controller);

        // Issue multiple credentials to the subject
        let credential_types = [
            Vec::from_array(&env, [Symbol::new(&env, "KYCVerified")]),
            Vec::from_array(&env, [Symbol::new(&env, "AccreditedInvestor")]),
            Vec::from_array(&env, [Symbol::new(&env, "ProfessionalTrader")]),
        ];

        for credential_type in credential_types.iter() {
            let claims = Map::new(&env);
            let proof = CredentialProof {
                type_: Symbol::new(&env, "Ed25519Signature2018"),
                created: env.ledger().timestamp(),
                proof_purpose: Symbol::new(&env, "assertionMethod"),
                verification_method: Symbol::new(&env, "#key-1"),
                signature: Bytes::from_array(&env, &[21; 64]),
            };

            client.issue_credential(
                &issuer_did,
                &subject_did,
                credential_type.clone(),
                claims,
                env.ledger().timestamp() + 86400,
                proof,
            );
        }

        // Get user's credentials
        let user_credentials = client.get_user_credentials(&subject_did);
        assert_eq!(user_credentials.len(), 3);
    }

    #[test]
    fn test_unauthorized_credential_revocation() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, DIDContract);
        let client = DIDContractClient::new(&env, &contract_id);

        // Create issuer, subject, and unauthorized user DIDs
        let issuer_controller = Address::generate(&env);
        let subject_controller = Address::generate(&env);
        let unauthorized_controller = Address::generate(&env);
        
        let issuer_public_key = BytesN::from_array(&env, &[22; 32]);
        let subject_public_key = BytesN::from_array(&env, &[23; 32]);

        let issuer_did = client.create_did(&DIDMethod::Stellar, &issuer_public_key, &issuer_controller);
        let subject_did = client.create_did(&DIDMethod::Stellar, &subject_public_key, &subject_controller);

        // Create credential
        let credential_type = Vec::from_array(&env, [Symbol::new(&env, "TestCredential")]);
        let claims = Map::new(&env);
        let proof = CredentialProof {
            type_: Symbol::new(&env, "Ed25519Signature2018"),
            created: env.ledger().timestamp(),
            proof_purpose: Symbol::new(&env, "assertionMethod"),
            verification_method: Symbol::new(&env, "#key-1"),
            signature: Bytes::from_array(&env, &[24; 64]),
        };

        let credential_id = client.issue_credential(
            &issuer_did,
            &subject_did,
            credential_type,
            claims,
            env.ledger().timestamp() + 86400,
            proof,
        );

        // Try to revoke credential with unauthorized user - should fail
        let result = env.as_contract(&contract_id, || {
            DIDContract::revoke_credential(&env, credential_id, issuer_did, unauthorized_controller)
        });
        
        assert!(result.is_err());
    }
}

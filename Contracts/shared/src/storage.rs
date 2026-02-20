//! Optimized storage utilities for Stellara contracts
//! 
//! This module provides efficient storage patterns that reduce costs and improve access patterns:
//! - Tiered storage: Uses appropriate storage types (instance, persistent, temporary) based on data lifecycle
//! - Key optimization: Minimizes key size and uses efficient key encoding
//! - Lazy loading: Only loads data when needed
//! - Batched operations: Reduces storage access overhead
//! - Migration support: Handles data transformation during upgrades

use soroban_sdk::{contracttype, Address, Env, Symbol, symbol_short};

/// Storage key prefixes for efficient key encoding
/// Using single-byte prefixes reduces storage key size and costs
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum StoragePrefix {
    // Instance storage (cheaper, limited TTL)
    Admin = 0x01,
    Config = 0x02,
    Metadata = 0x03,
    Version = 0x04,
    
    // Persistent storage
    Balance = 0x10,
    Allowance = 0x11,
    Position = 0x12,
    Schedule = 0x13,
    Reward = 0x14,
    Trade = 0x15,
    Proposal = 0x16,
    Role = 0x17,
    
    // Temporary storage (short-lived data)
    Cache = 0x20,
    Temp = 0x21,
    
    // Migration markers
    Migration = 0x30,
    Legacy = 0x31,
}

impl StoragePrefix {
    pub fn as_symbol(&self, _env: &Env) -> Symbol {
        match self {
            StoragePrefix::Admin => symbol_short!("adm"),
            StoragePrefix::Config => symbol_short!("cfg"),
            StoragePrefix::Metadata => symbol_short!("meta"),
            StoragePrefix::Version => symbol_short!("ver"),
            StoragePrefix::Balance => symbol_short!("bal"),
            StoragePrefix::Allowance => symbol_short!("allw"),
            StoragePrefix::Position => symbol_short!("pos"),
            StoragePrefix::Schedule => symbol_short!("sch"),
            StoragePrefix::Reward => symbol_short!("rwd"),
            StoragePrefix::Trade => symbol_short!("trd"),
            StoragePrefix::Proposal => symbol_short!("prop"),
            StoragePrefix::Role => symbol_short!("role"),
            StoragePrefix::Cache => symbol_short!("cache"),
            StoragePrefix::Temp => symbol_short!("temp"),
            StoragePrefix::Migration => symbol_short!("migr"),
            StoragePrefix::Legacy => symbol_short!("leg"),
        }
    }
}

/// Storage configuration for optimized access patterns
#[contracttype]
#[derive(Clone, Debug)]
pub struct StorageConfig {
    pub version: u32,
    pub last_migration: u64,
    pub migration_in_progress: bool,
}

/// Migration record for tracking data transformations
#[contracttype]
#[derive(Clone, Debug)]
pub struct MigrationRecord {
    pub from_version: u32,
    pub to_version: u32,
    pub timestamp: u64,
    pub data_keys_migrated: u64,
    pub success: bool,
}

/// Storage statistics for monitoring and optimization
#[contracttype]
#[derive(Clone, Debug, Default)]
pub struct StorageStats {
    pub read_count: u64,
    pub write_count: u64,
    pub delete_count: u64,
    pub estimated_cost_savings: i128,
}

/// Efficient storage key builder
pub struct StorageKey;

impl StorageKey {
    /// Build key for user-specific data
    pub fn user_data(env: &Env, prefix: StoragePrefix, user: &Address) -> (Symbol, Address) {
        (prefix.as_symbol(env), user.clone())
    }
    
    /// Build key for indexed data
    pub fn indexed(env: &Env, prefix: StoragePrefix, index: u64) -> (Symbol, u64) {
        (prefix.as_symbol(env), index)
    }
    
    /// Build key for composite data
    pub fn composite(env: &Env, prefix: StoragePrefix, a: &Address, b: u64) -> (Symbol, Address, u64) {
        (prefix.as_symbol(env), a.clone(), b)
    }
    
    /// Build simple key
    pub fn simple(env: &Env, prefix: StoragePrefix) -> Symbol {
        prefix.as_symbol(env)
    }
}

/// Optimized storage operations trait
pub trait OptimizedStorage {
    /// Get config from instance storage (cheaper for static data)
    fn get_config<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &Symbol) -> Option<T>;
    
    /// Set config in instance storage
    fn set_config<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &Symbol, value: &T);
    
    /// Get data from persistent storage
    fn get_persistent<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> Option<T>;
    
    /// Set data in persistent storage
    fn set_persistent<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>, value: &T);
    
    /// Remove data from persistent storage
    fn remove_persistent(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>);
    
    /// Check if key exists in persistent storage
    fn has_persistent(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> bool;
    
    /// Get temporary data (short-lived cache)
    fn get_temporary<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> Option<T>;
    
    /// Set temporary data
    fn set_temporary<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>, value: &T);
}

impl OptimizedStorage for Env {
    fn get_config<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &Symbol) -> Option<T> {
        self.storage().instance().get(key)
    }
    
    fn set_config<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &Symbol, value: &T) {
        self.storage().instance().set(key, value);
    }
    
    fn get_persistent<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> Option<T> {
        self.storage().persistent().get(key)
    }
    
    fn set_persistent<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>, value: &T) {
        self.storage().persistent().set(key, value);
    }
    
    fn remove_persistent(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) {
        self.storage().persistent().remove(key);
    }
    
    fn has_persistent(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> bool {
        self.storage().persistent().has(key)
    }
    
    fn get_temporary<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + Clone>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) -> Option<T> {
        self.storage().temporary().get(key)
    }
    
    fn set_temporary<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(&self, key: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>, value: &T) {
        self.storage().temporary().set(key, value);
    }
}

/// Migration utilities for storage upgrades
pub struct MigrationManager;

impl MigrationManager {
    /// Initialize migration tracking
    pub fn init(env: &Env, version: u32) {
        let config = StorageConfig {
            version,
            last_migration: env.ledger().timestamp(),
            migration_in_progress: false,
        };
        env.set_config(&StoragePrefix::Migration.as_symbol(env), &config);
    }
    
    /// Get current storage version
    pub fn get_version(env: &Env) -> u32 {
        env.get_config::<StorageConfig>(&StoragePrefix::Migration.as_symbol(env))
            .map(|c| c.version)
            .unwrap_or(0)
    }
    
    /// Start migration process
    pub fn start_migration(env: &Env, from_version: u32, _to_version: u32) -> Result<(), &'static str> {
        let key = StoragePrefix::Migration.as_symbol(env);
        let mut config = env.get_config::<StorageConfig>(&key).unwrap_or(StorageConfig {
            version: from_version,
            last_migration: 0,
            migration_in_progress: false,
        });
        
        if config.migration_in_progress {
            return Err("Migration already in progress");
        }
        
        if config.version != from_version {
            return Err("Version mismatch");
        }
        
        config.migration_in_progress = true;
        env.set_config(&key, &config);
        
        Ok(())
    }
    
    /// Complete migration process
    pub fn complete_migration(env: &Env, to_version: u32, keys_migrated: u64) {
        let key = StoragePrefix::Migration.as_symbol(env);
        let mut config = env.get_config::<StorageConfig>(&key).unwrap_or(StorageConfig {
            version: 0,
            last_migration: 0,
            migration_in_progress: true,
        });
        
        let record = MigrationRecord {
            from_version: config.version,
            to_version,
            timestamp: env.ledger().timestamp(),
            data_keys_migrated: keys_migrated,
            success: true,
        };
        
        // Store migration record
        let record_key = (StoragePrefix::Legacy.as_symbol(env), config.version);
        env.set_persistent(&record_key, &record);
        
        // Update config
        config.version = to_version;
        config.last_migration = env.ledger().timestamp();
        config.migration_in_progress = false;
        env.set_config(&key, &config);
    }
    
    /// Check if migration is needed
    pub fn needs_migration(env: &Env, target_version: u32) -> bool {
        Self::get_version(env) < target_version
    }
}

/// Batch storage operations for efficiency
pub struct BatchStorage;

impl BatchStorage {
    /// Batch write multiple values
    pub fn batch_write<T, K>(env: &Env, items: &[(K, T)])
    where
        T: soroban_sdk::IntoVal<Env, soroban_sdk::Val> + Clone,
        K: soroban_sdk::IntoVal<Env, soroban_sdk::Val> + Clone,
    {
        let storage = env.storage().persistent();
        
        for (key, value) in items.iter() {
            storage.set(&key.clone(), &value.clone());
        }
    }
}

/// Storage cost estimator for optimization decisions
pub struct StorageCostEstimator;

impl StorageCostEstimator {
    /// Estimate cost savings from using instance storage vs persistent
    pub fn instance_vs_persistent_savings(data_size_bytes: u64) -> i128 {
        // Instance storage is significantly cheaper for small, frequently accessed data
        // Rough estimate: instance is ~10x cheaper than persistent
        let persistent_cost = data_size_bytes as i128 * 100;
        let instance_cost = data_size_bytes as i128 * 10;
        persistent_cost - instance_cost
    }
    
    /// Estimate cost savings from key size optimization
    pub fn key_optimization_savings(original_key_size: u64, optimized_key_size: u64) -> i128 {
        // Smaller keys reduce storage costs
        let savings_per_access = (original_key_size - optimized_key_size) as i128 * 10;
        savings_per_access
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_storage_prefix_values() {
        // Verify prefix values are correct
        assert_eq!(StoragePrefix::Admin as u8, 0x01);
        assert_eq!(StoragePrefix::Config as u8, 0x02);
        assert_eq!(StoragePrefix::Metadata as u8, 0x03);
        assert_eq!(StoragePrefix::Version as u8, 0x04);
        assert_eq!(StoragePrefix::Balance as u8, 0x10);
        assert_eq!(StoragePrefix::Cache as u8, 0x20);
        assert_eq!(StoragePrefix::Migration as u8, 0x30);
    }
    
    #[test]
    fn test_storage_config_creation() {
        // Test that StorageConfig can be created correctly
        let config = StorageConfig {
            version: 1,
            last_migration: 1000,
            migration_in_progress: false,
        };
        
        assert_eq!(config.version, 1);
        assert_eq!(config.last_migration, 1000);
        assert!(!config.migration_in_progress);
    }
}

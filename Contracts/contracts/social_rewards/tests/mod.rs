// Re-export all test modules
mod property_based;
mod fuzzing;
mod edge_cases;
mod integration;

// Make tests discoverable
pub use property_based::*;
pub use fuzzing::*;
pub use edge_cases::*;
pub use integration::*;
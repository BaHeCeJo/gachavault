use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rand::Rng;
use sha2::{Digest, Sha256};

/// Pin the Argon2id work factors explicitly instead of relying on
/// `Argon2::default()` whose values can shift across crate releases. These
/// match OWASP 2024 guidance for password storage: 19 MiB memory, 2 time
/// rounds, 1 thread.
///
/// Verification still works against hashes produced with other params
/// because Argon2 stores them in the PHC-format hash string — only NEW
/// hashes pick up these settings.
fn argon2() -> Argon2<'static> {
    let params = Params::new(19_456, 2, 1, None).expect("argon2 params are valid");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("Failed to hash password: {}", e))
}

pub fn verify_password(password: &str, hash: &str) -> anyhow::Result<bool> {
    let parsed =
        PasswordHash::new(hash).map_err(|e| anyhow::anyhow!("Invalid password hash: {}", e))?;
    Ok(argon2()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn generate_token() -> String {
    let bytes: Vec<u8> = (0..32).map(|_| rand::thread_rng().gen::<u8>()).collect();
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

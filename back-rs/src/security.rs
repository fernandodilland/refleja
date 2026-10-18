//! JWT HS256 compatible con PyJWT, hashes/HMAC y contraseñas Argon2id.
//! Replica `back/app/security.py`.
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::sync::Semaphore;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------- hashes
pub fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

/// HMAC-SHA256 del id de visitante: lo único que se guarda, nunca el vid en claro.
pub fn hmac_vid(key: &str, vid: &str) -> String {
    let mut m = HmacSha256::new_from_slice(key.as_bytes()).expect("hmac acepta cualquier longitud");
    m.update(vid.as_bytes());
    hex::encode(m.finalize().into_bytes())
}

/// Identificador aleatorio de visitante (128 bits, hex).
pub fn new_vid() -> String {
    let mut b = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

pub fn new_jti() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ---------------------------------------------------------------- JWT
#[derive(Debug, PartialEq)]
pub enum JwtError {
    Expired,
    Invalid,
}

const HEADER_B64: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"; // {"alg":"HS256","typ":"JWT"}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn sign(secret: &str, signing_input: &str) -> Vec<u8> {
    let mut m = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac");
    m.update(signing_input.as_bytes());
    m.finalize().into_bytes().to_vec()
}

/// Emite un JWT HS256 con `iat`/`exp` añadidos al final (mismo orden que PyJWT).
pub fn encode_jwt(secret: &str, claims: Vec<(&str, Value)>, ttl_secs: i64) -> String {
    let now = now_secs();
    let mut map = Map::new();
    for (k, v) in claims {
        map.insert(k.to_string(), v);
    }
    map.insert("iat".into(), Value::from(now));
    map.insert("exp".into(), Value::from(now + ttl_secs));
    let payload = serde_json::to_vec(&Value::Object(map)).expect("json");
    let signing_input = format!("{}.{}", HEADER_B64, URL_SAFE_NO_PAD.encode(payload));
    let sig = URL_SAFE_NO_PAD.encode(sign(secret, &signing_input));
    format!("{signing_input}.{sig}")
}

/// Valida firma, caducidad y `typ`; devuelve los claims.
pub fn decode_jwt(
    secret: &str,
    token: &str,
    expected_typ: &str,
) -> Result<Map<String, Value>, JwtError> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(JwtError::Invalid);
    }
    let header: Value = URL_SAFE_NO_PAD
        .decode(parts[0])
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .ok_or(JwtError::Invalid)?;
    if header.get("alg").and_then(|a| a.as_str()) != Some("HS256") {
        return Err(JwtError::Invalid);
    }
    let sig = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| JwtError::Invalid)?;
    let mut m = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac");
    m.update(format!("{}.{}", parts[0], parts[1]).as_bytes());
    m.verify_slice(&sig).map_err(|_| JwtError::Invalid)?;
    let payload: Value = URL_SAFE_NO_PAD
        .decode(parts[1])
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .ok_or(JwtError::Invalid)?;
    let claims = match payload {
        Value::Object(m) => m,
        _ => return Err(JwtError::Invalid),
    };
    let now = now_secs();
    if let Some(iat) = claims.get("iat") {
        match iat.as_f64() {
            Some(i) if i <= now as f64 => {}
            _ => return Err(JwtError::Invalid),
        }
    }
    if let Some(sub) = claims.get("sub") {
        if !sub.is_string() {
            return Err(JwtError::Invalid);
        }
    }
    if let Some(exp) = claims.get("exp") {
        match exp.as_f64() {
            Some(e) if e > now as f64 => {}
            Some(_) => return Err(JwtError::Expired),
            None => return Err(JwtError::Invalid),
        }
    }
    if claims.get("typ").and_then(|t| t.as_str()) != Some(expected_typ) {
        return Err(JwtError::Invalid);
    }
    Ok(claims)
}

// ---------------------------------------------------------------- Argon2id
const M_COST: u32 = 65536; // 64 MiB
const T_COST: u32 = 3;
const PARALLELISM: u32 = 4;
const HASH_LEN: usize = 32;
const SALT_LEN: usize = 16;

fn hasher() -> Argon2<'static> {
    let params = Params::new(M_COST, T_COST, PARALLELISM, Some(HASH_LEN)).expect("params argon2");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

fn hash_blocking(password: &str) -> String {
    let mut salt = [0u8; SALT_LEN];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    let salt = SaltString::encode_b64(&salt).expect("salt");
    hasher()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2")
        .to_string()
}

fn verify_blocking(stored: &str, password: &str) -> bool {
    match PasswordHash::new(stored) {
        Ok(h) => Argon2::default()
            .verify_password(password.as_bytes(), &h)
            .is_ok(),
        Err(_) => false,
    }
}

/// Equivalente de `PasswordHasher.check_needs_rehash` de argon2-cffi.
pub fn needs_rehash(stored: &str) -> bool {
    let Ok(h) = PasswordHash::new(stored) else {
        return false;
    };
    if h.algorithm.as_str() != "argon2id" || h.version != Some(0x13) {
        return true;
    }
    let get = |k: &str| h.params.get_decimal(k);
    if get("m") != Some(M_COST) || get("t") != Some(T_COST) || get("p") != Some(PARALLELISM) {
        return true;
    }
    if h.hash.map(|x| x.len()) != Some(HASH_LEN) {
        return true;
    }
    let mut buf = [0u8; 64];
    match h
        .salt
        .and_then(|s| s.decode_b64(&mut buf).ok().map(|b| b.len()))
    {
        Some(n) => n != SALT_LEN,
        None => true,
    }
}

/// Servicio de contraseñas: Argon2 en `spawn_blocking` con semáforo (acota los 64 MiB simultáneos).
#[derive(Clone)]
pub struct Passwords {
    sem: Arc<Semaphore>,
}

impl Passwords {
    pub fn new(concurrency: usize) -> Self {
        Passwords {
            sem: Arc::new(Semaphore::new(concurrency.max(1))),
        }
    }
    pub async fn hash(&self, password: String) -> String {
        let _p = self.sem.acquire().await.expect("semáforo");
        tokio::task::spawn_blocking(move || hash_blocking(&password))
            .await
            .expect("hash")
    }
    pub async fn verify(&self, stored: String, password: String) -> bool {
        let _p = self.sem.acquire().await.expect("semáforo");
        tokio::task::spawn_blocking(move || verify_blocking(&stored, &password))
            .await
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn jwt_roundtrip_and_typ() {
        let t = encode_jwt(
            "s3cret",
            vec![("typ", "access".into()), ("sub", "1".into())],
            60,
        );
        assert!(decode_jwt("s3cret", &t, "access").is_ok());
        assert_eq!(decode_jwt("s3cret", &t, "refresh"), Err(JwtError::Invalid));
        assert_eq!(decode_jwt("otro", &t, "access"), Err(JwtError::Invalid));
        let e = encode_jwt("s3cret", vec![("typ", "access".into())], -5);
        assert_eq!(decode_jwt("s3cret", &e, "access"), Err(JwtError::Expired));
    }
    #[test]
    fn argon_roundtrip() {
        let h = hash_blocking("clave-ñ");
        assert!(h.starts_with("$argon2id$v=19$m=65536,t=3,p=4$"));
        assert!(verify_blocking(&h, "clave-ñ"));
        assert!(!verify_blocking(&h, "otra"));
        assert!(!needs_rehash(&h));
    }
}

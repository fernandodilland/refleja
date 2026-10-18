//! Refleja API — reescritura en Rust del backend FastAPI (`back/`).
//! Cada módulo cita la ubicación del código Python que replica.
pub mod app;
pub mod client;
pub mod config;
pub mod db;
pub mod error;
pub mod form_meta;
pub mod http;
pub mod municipios;
pub mod rate_limit;
pub mod repo;
pub mod routes;
pub mod security;
pub mod timefmt;
pub mod turnstile;
pub mod validate;

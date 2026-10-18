//! Rate limit en memoria, ventana deslizante de 60 s, LRU acotado. Replica `public.py:34-60`.
use lru::LruCache;
use std::collections::VecDeque;
use std::num::NonZeroUsize;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_KEYS: usize = 50_000;

pub struct RateLimiter {
    inner: Mutex<LruCache<String, VecDeque<f64>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        RateLimiter { inner: Mutex::new(LruCache::new(NonZeroUsize::new(MAX_KEYS).unwrap())) }
    }

    pub fn allow(&self, key: &str, limit: usize) -> bool {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0);
        self.allow_at(key, limit, now)
    }

    pub fn allow_at(&self, key: &str, limit: usize, now: f64) -> bool {
        let cutoff = now - 60.0;
        let mut g = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let w = g.get_or_insert_mut(key.to_string(), VecDeque::new);
        while matches!(w.front(), Some(t) if *t <= cutoff) {
            w.pop_front();
        }
        let allowed = w.len() < limit;
        if allowed {
            w.push_back(now);
        }
        allowed
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn window_and_limit() {
        let r = RateLimiter::new();
        for i in 0..3 { assert!(r.allow_at("k", 3, 100.0 + i as f64)); }
        assert!(!r.allow_at("k", 3, 110.0));
        assert!(r.allow_at("k", 3, 161.0)); // expiran las marcas de t<=101
        assert!(r.allow_at("otra", 3, 110.0));
    }
}

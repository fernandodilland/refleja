//! IP, país y parsers de User-Agent. Replica `back/app/deps.py:11-23` y `analytics.py:53-92`.
use axum::http::HeaderMap;
use std::net::SocketAddr;

/// País desde `CF-IPCountry` (k-anónimo). Nunca la IP.
pub fn client_country(h: &HeaderMap) -> Option<String> {
    let c = h.get("cf-ipcountry")?.to_str().ok()?;
    if c != "XX" && c != "T1" && c.chars().count() == 2 {
        Some(c.to_uppercase())
    } else {
        None
    }
}

/// IP de conexión; solo transitoria (Turnstile y rate limit). No se guarda.
pub fn client_ip(h: &HeaderMap, peer: Option<SocketAddr>) -> Option<String> {
    if let Some(v) = h.get("cf-connecting-ip").and_then(|v| v.to_str().ok()) {
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    peer.map(|p| p.ip().to_string())
}

pub fn user_agent(h: &HeaderMap) -> Option<String> {
    h.get("user-agent").and_then(|v| v.to_str().ok()).map(|s| s.to_string())
}

pub fn device_from_ua(ua: Option<&str>) -> &'static str {
    let ua = match ua {
        Some(u) if !u.is_empty() => u.to_lowercase(),
        _ => return "desktop",
    };
    if ua.contains("ipad") || ua.contains("tablet") {
        "tablet"
    } else if ["mobi", "android", "iphone", "ipod"].iter().any(|k| ua.contains(k)) {
        "mobile"
    } else {
        "desktop"
    }
}

pub fn browser_from_ua(ua: Option<&str>) -> Option<&'static str> {
    let ua = match ua {
        Some(u) if !u.is_empty() => u,
        _ => return None,
    };
    Some(if ua.contains("Edg") {
        "Edge"
    } else if ua.contains("OPR") || ua.contains("Opera") {
        "Opera"
    } else if ua.contains("Chrome") && !ua.contains("Chromium") {
        "Chrome"
    } else if ua.contains("Firefox") {
        "Firefox"
    } else if ua.contains("Safari") {
        "Safari"
    } else {
        "Otro"
    })
}

pub fn os_from_ua(ua: Option<&str>) -> Option<&'static str> {
    let ua = match ua {
        Some(u) if !u.is_empty() => u,
        _ => return None,
    };
    Some(if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iOS") {
        "iOS"
    } else if ua.contains("Mac OS X") || ua.contains("Macintosh") {
        "macOS"
    } else if ua.contains("Android") {
        "Android"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "Otro"
    })
}

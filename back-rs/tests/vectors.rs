//! Vectores generados con el backend Python (PyJWT, argon2-cffi, analytics.py) para garantizar paridad.
//! Los secretos y contraseñas son valores de prueba sin relación con producción.
use refleja_api::client::{browser_from_ua, device_from_ua, os_from_ua};
use refleja_api::municipios::normalize_municipio;
use refleja_api::security::{decode_jwt, hmac_vid, needs_rehash, JwtError, Passwords};

#[test]
fn ua_vectors_match_python() {
    let rows: [(&str, &str, Option<&str>, Option<&str>); 12] = [
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari",
            "mobile",
            Some("Safari"),
            Some("iOS"),
        ),
        (
            "Mozilla/5.0 (iPad; CPU OS 17_0) Safari",
            "tablet",
            Some("Safari"),
            Some("iOS"),
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/120 Safari/537 Edg/120",
            "desktop",
            Some("Edge"),
            Some("Windows"),
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0) Chrome/120 OPR/100",
            "desktop",
            Some("Opera"),
            Some("Windows"),
        ),
        (
            "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
            "desktop",
            Some("Firefox"),
            Some("Linux"),
        ),
        (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Version/17 Safari/605",
            "desktop",
            Some("Safari"),
            Some("macOS"),
        ),
        (
            "Mozilla/5.0 (Linux; Android 13; Pixel) Chrome/120 Mobile Safari",
            "mobile",
            Some("Chrome"),
            Some("Android"),
        ),
        (
            "Mozilla/5.0 (Linux; Android 13; SM-T500) Chrome Chromium/1 Tablet",
            "tablet",
            Some("Otro"),
            Some("Android"),
        ),
        ("curl/8.7.1", "desktop", Some("Otro"), Some("Otro")),
        ("", "desktop", None, None),
        ("Googlebot/2.1", "desktop", Some("Otro"), Some("Otro")),
        (
            "Mozilla/5.0 (Linux; Android 10) Opera Mini",
            "mobile",
            Some("Opera"),
            Some("Android"),
        ),
    ];
    for (ua, dev, br, os) in rows {
        assert_eq!(device_from_ua(Some(ua)), dev, "device {ua}");
        assert_eq!(browser_from_ua(Some(ua)), br, "browser {ua}");
        assert_eq!(os_from_ua(Some(ua)), os, "os {ua}");
    }
    assert_eq!(device_from_ua(None), "desktop");
}

#[test]
fn municipio_vectors_match_python() {
    let rows: [(&str, Option<&str>); 10] = [
        (" Monterrey ", Some("monterrey")),
        ("San Nicolas De Los Garza", Some("san-nicolas-de-los-garza")),
        ("Cadereyta Jiménez", None),
        ("GENERAL ZUAZUA", Some("general-zuazua")),
        (
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            None,
        ),
        ("-monterrey-", Some("monterrey")),
        ("los  herreras", None),
        ("MIER Y NORIEGA", Some("mier-y-noriega")),
        ("otro", Some("otro")),
        ("", None),
    ];
    for (input, expected) in rows {
        assert_eq!(
            normalize_municipio(Some(input)).as_deref(),
            expected,
            "{input:?}"
        );
    }
}

const PYJWT_PUBLIC: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXAiOiJwdWJsaWMiLCJ2aWQiOiJhYmMxMjMiLCJpYXQiOjE3OTIzMDYyOTgsImV4cCI6Mjc5MjMwNjI5OH0.CfsacDIGHSEkT0_0qT9Px9P_Y6Gr54HBWMECJfYnSpI";

#[test]
fn jwt_from_pyjwt_validates() {
    let secret = "p".repeat(48);
    let c = decode_jwt(&secret, PYJWT_PUBLIC, "public").expect("token de PyJWT válido");
    assert_eq!(c["vid"], "abc123");
    assert_eq!(
        decode_jwt(&secret, PYJWT_PUBLIC, "access"),
        Err(JwtError::Invalid)
    );
    assert_eq!(
        decode_jwt(&"x".repeat(48), PYJWT_PUBLIC, "public"),
        Err(JwtError::Invalid)
    );
    // `alg: none` y firma recortada se rechazan
    let mut parts: Vec<&str> = PYJWT_PUBLIC.split('.').collect();
    parts[2] = "";
    assert_eq!(
        decode_jwt(&secret, &parts.join("."), "public"),
        Err(JwtError::Invalid)
    );
}

#[test]
fn hmac_matches_python() {
    assert_eq!(
        hmac_vid(&"v".repeat(48), "abc123"),
        "b8639cf0ef0ffe09440e0c2d07017e2d76828df209383dfdc4ad80a4bc5b04d2"
    );
}

#[tokio::test]
async fn argon2_hash_from_argon2_cffi_verifies() {
    let h = "$argon2id$v=19$m=65536,t=3,p=4$mAoI8NihRe52igOzK8a0Dg$nlemBuUZFWP89673C8A8D89k35B5A5AaBv2OqNONlww";
    let p = Passwords::new(1);
    assert!(p.verify(h.into(), "clave-ñ-Ü".into()).await);
    assert!(!p.verify(h.into(), "otra".into()).await);
    assert!(!p.verify("no-es-un-hash".into(), "x".into()).await);
    assert!(!needs_rehash(h));
    assert!(needs_rehash("$argon2id$v=19$m=1024,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"));
}

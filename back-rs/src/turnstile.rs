//! Verificación de Cloudflare Turnstile (siteverify). Replica `back/app/turnstile.py`.
use std::time::Duration;

#[derive(Clone)]
pub struct Turnstile {
    client: reqwest::Client,
    url: String,
    bypass: bool,
    pub secret_login: String,
    pub secret_invisible: String,
}

impl Turnstile {
    pub fn new(url: String, bypass: bool, secret_login: String, secret_invisible: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .expect("cliente http");
        Turnstile {
            client,
            url,
            bypass,
            secret_login,
            secret_invisible,
        }
    }

    /// `true` solo si Cloudflare confirma `success`; cualquier error ⇒ `false` (fail-closed).
    pub async fn verify(&self, token: Option<&str>, secret: &str, remote_ip: Option<&str>) -> bool {
        if self.bypass && token == Some("dev-bypass") {
            return true;
        }
        let token = match token {
            Some(t) if !t.is_empty() => t,
            _ => return false,
        };
        if secret.is_empty() {
            return false;
        }
        let body = {
            let mut f = form_urlencoded::Serializer::new(String::new());
            f.append_pair("secret", secret)
                .append_pair("response", token);
            if let Some(ip) = remote_ip {
                if !ip.is_empty() {
                    f.append_pair("remoteip", ip);
                }
            }
            f.finish()
        };
        let resp = self
            .client
            .post(&self.url)
            .header("content-type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await;
        let Ok(resp) = resp else { return false };
        if !resp.status().is_success() {
            return false;
        }
        match resp
            .bytes()
            .await
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .ok_or(())
        {
            Ok(v) => v
                .get("success")
                .map(|s| match s {
                    serde_json::Value::Bool(b) => *b,
                    serde_json::Value::Null => false,
                    serde_json::Value::Number(n) => n.as_f64().map(|x| x != 0.0).unwrap_or(false),
                    serde_json::Value::String(s) => !s.is_empty(),
                    serde_json::Value::Array(a) => !a.is_empty(),
                    serde_json::Value::Object(o) => !o.is_empty(),
                })
                .unwrap_or(false),
            Err(_) => false,
        }
    }

    pub async fn verify_login(&self, token: Option<&str>, ip: Option<&str>) -> bool {
        self.verify(token, &self.secret_login, ip).await
    }
    pub async fn verify_invisible(&self, token: Option<&str>, ip: Option<&str>) -> bool {
        self.verify(token, &self.secret_invisible, ip).await
    }
}

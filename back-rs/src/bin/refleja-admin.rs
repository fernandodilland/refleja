//! CLI operativa (reemplaza `python -m app.seed` y el comando de hash de `seed.example.sql`).
//!
//!   printf '%s' 'contraseña' | refleja-admin hash-password
//!   REFLEJA_ADMIN_PASSWORD='...' refleja-admin create-admin --username NOMBRE   (o contraseña por stdin)
//!
//! La contraseña NUNCA se pasa como argumento (quedaría en el historial del shell).
use refleja_api::config::Settings;
use refleja_api::security::Passwords;
use std::io::Read;

fn read_password() -> String {
    if let Ok(p) = std::env::var("REFLEJA_ADMIN_PASSWORD") {
        return p;
    }
    let mut s = String::new();
    let _ = std::io::stdin().read_to_string(&mut s);
    s.trim_end_matches(['\n', '\r']).to_string()
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(|s| s.as_str()) {
        Some("hash-password") => {
            let pw = read_password();
            if pw.is_empty() {
                eprintln!("contraseña vacía");
                std::process::exit(1);
            }
            println!("{}", Passwords::new(1).hash(pw).await);
        }
        Some("create-admin") => {
            let username = match args
                .iter()
                .position(|a| a == "--username")
                .and_then(|i| args.get(i + 1))
            {
                Some(u) if !u.is_empty() && u.chars().count() <= 64 => u.clone(),
                _ => {
                    eprintln!("uso: refleja-admin create-admin --username NOMBRE (contraseña por REFLEJA_ADMIN_PASSWORD o stdin)");
                    std::process::exit(2);
                }
            };
            let pw = read_password();
            if pw.chars().count() < 12 || pw == "admin" {
                eprintln!("la contraseña debe tener al menos 12 caracteres");
                std::process::exit(1);
            }
            let settings = Settings::load().unwrap_or_else(|e| {
                eprintln!("Configuración inválida: {e}");
                std::process::exit(1);
            });
            let pool = refleja_api::db::connect(&settings)
                .await
                .unwrap_or_else(|e| {
                    eprintln!("No se pudo conectar a la base de datos: {e}");
                    std::process::exit(1);
                });
            let hash = Passwords::new(1).hash(pw).await;
            let res = sqlx::query(
                "INSERT INTO admin_user (username, password_hash, is_active) \
                 SELECT ?, ?, 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM admin_user WHERE username = ?)",
            )
            .bind(&username)
            .bind(&hash)
            .bind(&username)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| {
                eprintln!("error de base de datos: {e}");
                std::process::exit(1);
            });
            if res.rows_affected() == 1 {
                println!("Usuario administrador '{username}' creado (Argon2id).");
            } else {
                println!("El usuario '{username}' ya existe; no se modificó.");
            }
        }
        _ => {
            eprintln!("uso: refleja-admin <hash-password|create-admin --username NOMBRE>");
            std::process::exit(2);
        }
    }
}

use refleja_api::app::{build_router, AppState};
use refleja_api::config::Settings;
use refleja_api::db;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_target(false)
        .init();

    let settings = match Settings::load() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Configuración inválida: {e}");
            std::process::exit(1);
        }
    };
    let pool = match db::connect(&settings).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("No se pudo conectar a la base de datos: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = db::verify_schema(&pool).await {
        eprintln!("{e}");
        std::process::exit(1);
    }
    // `--check`: valida configuración, conexión y esquema y termina (lo usa el instalador del servidor
    // antes de cambiar de release; equivale a `sis-cli migrar --estado` del backend de sistema).
    if std::env::args().any(|a| a == "--check") {
        println!(
            "OK: configuración válida (ENV={}), base de datos accesible y esquema completo",
            settings.env
        );
        return;
    }
    let (host, port, env) = (
        settings.app_host.clone(),
        settings.app_port,
        settings.env.clone(),
    );
    let state = AppState::new(settings, pool).await;
    let app = build_router(state);

    let addr: SocketAddr = match format!("{host}:{port}").parse() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("APP_HOST/APP_PORT inválidos: {e}");
            std::process::exit(1);
        }
    };
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("No se pudo escuchar en {addr}: {e}");
            std::process::exit(1);
        }
    };
    tracing::info!("Refleja API lista (ENV={env}, puerto={port})");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await
    .expect("servidor");
}

async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
}

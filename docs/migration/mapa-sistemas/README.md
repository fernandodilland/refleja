# Parche del Mapa de Sistemas (NO aplicado)

`refleja-rust.patch` hace que `https://sistema.fernandodilland.com/sistemas#mapa` muestre la API de Refleja en Rust como viva
(`hv-refleja-rs`, puerto 20834), deje la del Python en gris como «obsoleto» con su sustituto, y que el agente vigile
`refleja-api-rs.service` y la salud en `:20834`. Comprobado con `git apply --check` contra `~/git/Personal/sistema.fernandodilland`
(2026-10-18); **no se aplicó** porque el mapa debe cambiar solo cuando Rust esté desplegado.

Se aplica **a mano, después del día D** (no dentro de ningún script), cuando el propietario lo indique:

```bash
cd ~/git/Personal/sistema.fernandodilland
git apply ~/git/Personal/"refleja 4"/docs/migration/mapa-sistemas/refleja-rust.patch
sed -i '' 's/\[FECHA\]/<día D>/; s/\[DÍA_D\] //' static/js/sistemas-servidor.js static/js/sistemas-datos.js   # fecha real
# anotar el cambio en SISTEMAS.md y commitear SOLO estos archivos (el repo tiene otros cambios del propietario)
# copiar agentes/hivelocity/supervisar.json a /etc/sistemas-agente/supervisar.json en el servidor y reiniciar el agente
```

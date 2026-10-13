# Zentra Basico

Edicion para demostraciones y replicas de clientes sin interfaz ni API medica.

## Alcance

- Autenticacion y administracion.
- Articulos, inventario, proveedores, compras y ventas.
- Caja, cuentas por cobrar, estados de cuenta, gastos y reportes.
- Sin pacientes, medicinas, historia clinica, hospitalizaciones, ordenes medicas ni agenda.

## Compatibilidad de datos

El esquema SQL historico se conserva porque varios controladores contables actuales todavia admiten referencias opcionales a pacientes y medicinas. Estas tablas no se exponen por interfaz ni API en esta edicion. Antes de usar esta carpeta como producto generico definitivo, conviene migrar esas referencias a clientes y articulos.

## Inicio

1. Configure `.env` desde `.env.example`.
2. Ejecute `npm install` dentro de `backend`.
3. Ejecute `npm start` dentro de `backend`.
4. Sirva la raiz con `node frontend-server.js`.

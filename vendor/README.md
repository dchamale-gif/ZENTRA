# Librerías de terceros servidas desde /vendor

Se sirven desde el mismo dominio para no depender de un CDN externo
(si el CDN falla, los iconos y las gráficas dejan de verse).

| Carpeta | Versión | Origen | Cambios locales |
|---|---|---|---|
| `fontawesome/` | 6.4.0 | `@fortawesome/fontawesome-free` (npm) | Solo `css/all.min.css` y las fuentes `.woff2`. `font-display:block` cambiado a `swap` para que el texto se vea sin esperar la fuente. |
| `chartjs/` | 4.4.0 | `chart.js` (npm), `dist/chart.umd.js` | Ninguno. Se carga bajo demanda con `loadLibrary('chart')` (js/auth-utils.js). |

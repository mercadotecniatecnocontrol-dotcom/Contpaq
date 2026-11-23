# Módulo Fiscal SAT — Portal Operativo Tecnocontrol

Frontend completo en **React + Vite + Tailwind CSS** listo para compilar y publicar en **GitHub Pages**, cubriendo los **17 apartados** de la Guía de Desarrollo con identidad visual propia de Tecnocontrol y datos de demostración interactivos para **HEDMA TECNOCONTROL S.A. DE C.V.** (más 2 empresas adicionales para validar operación multi-RFC).

## Ejecución local

```bash
npm install
npm run dev
```

## Compilación para GitHub Pages

```bash
npm run build
```

- `vite.config.ts` usa `base: './'` y el módulo utiliza rutas por hash (`#fiscal/...`), por lo que funciona directamente en GitHub Pages sin errores 404.
- Incluye workflow automático en `.github/workflows/deploy-pages.yml`.

## Inventario de 17 apartados implementados

| # | Apartado | Ruta | Fase |
|---|----------|------|------|
| 1 | Selector de empresas (tarjetas/lista, búsqueda, orden, favoritas, alta) | `#fiscal/empresas` | 0 |
| 2 | e.firma (FIEL, alertas 30/15/5 días, carga segura sin guardar `.key`) | `#fiscal/efirma` | 0 |
| 3 | Usuarios e Invitaciones (roles RLS + bitácora de auditoría) | `#fiscal/usuarios` | 0 |
| 4 | Sincronización SAT (bitácora 5/10/25, carga manual XML real, histórico) | `#fiscal/sincronizacion` | 1 |
| 5 | CFDIs emitidos (tarjetas, estatus, PUE/PPD, columnas configurables, XML/PDF) | `#fiscal/emitidos` | 1 |
| 6 | CFDIs recibidos (componente compartido por dirección) | `#fiscal/recibidos` | 1 |
| 7 | Dashboard (KPIs periodo/ejercicio, gráfica Ene–Dic, opinión SAT, desglose) | `#fiscal/dashboard` | 2 |
| 8 | Impuestos IVA (flujo PUE + PPD proporcional REP, exclusión con motivo) | `#fiscal/iva` | 2 |
| 9 | Impuestos ISR (ingresos cobrados + deducciones excluyendo cancelados/S01/69-B) | `#fiscal/isr` | 2 |
| 10 | Ocultar montos (ícono de ojo global `•••••` recordado por usuario) | Global (TopBar) | 2 |
| 11 | Conciliación SAT / Visor SAT (corte SAT, diferencias, descarga de faltantes) | `#fiscal/visor` | 3 |
| 12 | Datos fiscales (CSF, Opinión SAT 32-D e IMSS con vista previa PDF) | `#fiscal/documentos` | 3 |
| 13 | Indicadores (13 reglas SAT + grupos + constructor + crear con IA) | `#fiscal/indicadores` | 3 |
| 14 | ADD y Bitácora contable (Aspel SAE) | `#fiscal/contable` | 3 |
| 15 | Vinculaciones Aspel SAE (estado contable y póliza por UUID) | `#fiscal/vinculaciones` | 3 |
| 16 | Usos y consumos (históricos, ejercicio vs límite, consultas IA, storage) | `#fiscal/consumo` | 3 |
| 17 | Asistente Tecno IA + Botón flotante + Centro de notificaciones | `#fiscal/asistente` + Campana | 4 |

## Preparado para conectar Supabase después

- Todos los tipos en `src/types/fiscal.ts` replican el esquema `fiscal` de 15 tablas.
- La capa de persistencia en `src/services/fiscalRepository.ts` está aislada para reemplazar `localStorage` por `@supabase/supabase-js` sin reescribir las pantallas.
- Las funciones puras en `src/services/fiscalCalculations.ts` reflejan las vistas `v_resumen_mensual`, `v_isr_cobrado` y las reglas de indicadores.

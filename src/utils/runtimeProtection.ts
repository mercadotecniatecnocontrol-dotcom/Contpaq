// Protección en tiempo de ejecución del cliente (Portal Operativo Tecnocontrol)
// 1. Aviso formal anti Self-XSS + blindaje de consola
// 2. Prevención de Clickjacking (frame-busting)
// 3. Disuasión de inspección de código (F12, Ctrl+Shift+I/J/C, Ctrl+U y menú contextual fuera de inputs)

let initialized = false;

export function initRuntimeSecurity(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // 1. Protección anti-Clickjacking (impide incrustar el portal en iframes no autorizados)
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = window.self.location.href;
    }
  } catch {
    // Si el origen padre bloquea acceso cross-origin, ocultamos el contenido sensible
    document.documentElement.style.display = 'none';
  }

  // 2. Aviso formal de seguridad en consola (anti Self-XSS) y silenciamiento de métodos de depuración
  const rawLog = window.console?.log?.bind(window.console);
  try {
    rawLog?.(
      '%c¡DETENTE! — Seguridad Tecnocontrol',
      'color: #c9362b; font-size: 22px; font-weight: 800;',
    );
    rawLog?.(
      '%cEsta consola está restringida a ingeniería autorizada. No pegue código externo aquí; podría comprometer la información fiscal de su empresa.',
      'color: #0e4b85; font-size: 13px; font-weight: 600;',
    );
  } catch {
    // Ignorar en entornos sin consola gráfica
  }

  const noop = () => undefined;
  const methodsToSilence = [
    'log',
    'info',
    'debug',
    'warn',
    'table',
    'dir',
    'dirxml',
    'trace',
    'group',
    'groupCollapsed',
    'groupEnd',
  ] as const;

  for (const method of methodsToSilence) {
    try {
      Object.defineProperty(window.console, method, {
        value: noop,
        writable: false,
        configurable: false,
      });
    } catch {
      try {
        (window.console as unknown as Record<string, unknown>)[method] = noop;
      } catch {
        // Algunos navegadores protegen propiedades de console
      }
    }
  }

  // 3. Disuasión de atajos de inspección y ver código fuente (F12, Ctrl+Shift+I/J/C, Ctrl+U)
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      const isDevToolsShortcut =
        e.key === 'F12' ||
        (ctrlOrCmd && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (ctrlOrCmd && key === 'u') ||
        (ctrlOrCmd && e.altKey && (key === 'i' || key === 'j' || key === 'u'));

      if (isDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // 4. Bloquear menú contextual ("Inspeccionar" / "Ver código fuente") excepto dentro de campos editables
  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);
      if (!isEditable) {
        e.preventDefault();
      }
    },
    true,
  );
}

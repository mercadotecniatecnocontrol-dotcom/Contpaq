import React, { useEffect, useRef, useState } from 'react';
import { Settings2, RotateCcw } from 'lucide-react';

export interface ColumnOption {
  key: string;
  label: string;
  locked?: boolean;
}

interface ColumnConfigMenuProps {
  columns: ColumnOption[];
  visibleKeys: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
}

export const ColumnConfigMenu: React.FC<ColumnConfigMenuProps> = ({
  columns,
  visibleKeys,
  onChange,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (key: string) => {
    if (visibleKeys.includes(key)) {
      onChange(visibleKeys.filter((k) => k !== key));
    } else {
      onChange([...visibleKeys, key]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Configurar columnas visibles"
        className="btn-tactile group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        <Settings2
          className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-300 ${
            open ? 'rotate-90 text-blue-600' : 'group-hover:rotate-45'
          }`}
        />
        <span className="hidden sm:inline">Columnas</span>
      </button>

      {open && (
        <div className="animate-popover absolute right-0 z-40 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-700">Columnas visibles</span>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Restablecer
            </button>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {columns.map((col) => {
              const checked = visibleKeys.includes(col.key);
              return (
                <label
                  key={col.key}
                  className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-xs ${
                    col.locked
                      ? 'text-slate-400 cursor-not-allowed'
                      : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={col.locked}
                    checked={checked}
                    onChange={() => !col.locked && toggle(col.key)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{col.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

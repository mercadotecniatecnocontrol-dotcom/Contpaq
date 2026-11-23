import React, { useEffect, useRef, useState } from 'react';
import { useFiscal } from '../../context/FiscalContext';
import { formatMoney } from '../../utils/format';

interface MoneyProps {
  value: number;
  moneda?: string;
  className?: string;
  showSign?: boolean;
  animate?: boolean;
}

export const Money: React.FC<MoneyProps> = ({
  value,
  moneda = 'MXN',
  className = '',
  showSign = false,
  animate = false,
}) => {
  const { ocultarMontos } = useFiscal();
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);
  const prevRef = useRef(animate ? 0 : value);

  useEffect(() => {
    if (!animate || ocultarMontos) {
      setDisplayValue(value);
      prevRef.current = value;
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (Math.abs(to - from) < 0.01) {
      setDisplayValue(to);
      return;
    }

    const duration = 480;
    const start = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = from + (to - from) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplayValue(to);
        prevRef.current = to;
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, animate, ocultarMontos]);

  const effectiveVal = animate ? displayValue : value;
  const text = formatMoney(Math.abs(effectiveVal), ocultarMontos, moneda);
  const prefix = ocultarMontos ? '' : effectiveVal < -0.005 ? '-' : showSign && effectiveVal > 0 ? '+' : '';

  return (
    <span
      className={`tabular-nums inline-block transition-all duration-200 ${
        ocultarMontos ? 'tracking-wider opacity-80' : ''
      } ${className}`}
    >
      {prefix}
      {text}
    </span>
  );
};

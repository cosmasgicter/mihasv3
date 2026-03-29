import { useEffect } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
}

export function useKeyboardShortcut(config: ShortcutConfig) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== config.key) return;
      if (config.ctrl && !e.ctrlKey) return;
      if (config.shift && !e.shiftKey) return;
      if (config.alt && !e.altKey) return;
      if (!config.ctrl && e.ctrlKey) return;
      if (!config.shift && e.shiftKey) return;
      if (!config.alt && e.altKey) return;

      e.preventDefault();
      config.callback();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config]);
}

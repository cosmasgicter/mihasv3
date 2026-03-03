import { useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: ToastAction;
  duration: number;
}

interface AddToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (options: AddToastOptions | ToastType, message?: string) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  errorWithRetry: (title: string, onRetry: () => void, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

let toastCounter = 0;
function nextId(): string {
  return `toast-${Date.now()}-${++toastCounter}`;
}

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;

function scheduleRemoval(id: string, duration: number) {
  if (duration <= 0) return;
  setTimeout(() => {
    useToastStore.getState().removeToast(id);
  }, duration);
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (optionsOrType, message?) => {
    const id = nextId();

    // Support legacy signature: addToast('error', 'Something failed')
    if (typeof optionsOrType === 'string') {
      const type = optionsOrType as ToastType;
      const duration = type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
      set((state) => ({
        toasts: [...state.toasts, { id, type, title: message || '', duration }],
      }));
      scheduleRemoval(id, duration);
      return;
    }

    // Object signature: addToast({ type, title, message?, action?, duration? })
    const opts = optionsOrType;
    const duration = opts.duration ?? (opts.type === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          type: opts.type,
          title: opts.title,
          message: opts.message,
          action: opts.action,
          duration,
        },
      ],
    }));
    scheduleRemoval(id, duration);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  success: (title, message?) => {
    const id = nextId();
    set((state) => ({
      toasts: [...state.toasts, { id, type: 'success', title, message, duration: DEFAULT_DURATION }],
    }));
    scheduleRemoval(id, DEFAULT_DURATION);
  },

  error: (title, message?) => {
    const id = nextId();
    set((state) => ({
      toasts: [...state.toasts, { id, type: 'error', title, message, duration: ERROR_DURATION }],
    }));
    scheduleRemoval(id, ERROR_DURATION);
  },

  errorWithRetry: (title, onRetry, message?) => {
    const id = nextId();
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          type: 'error',
          title,
          message,
          action: { label: 'Retry', onClick: onRetry },
          duration: ERROR_DURATION,
        },
      ],
    }));
    scheduleRemoval(id, ERROR_DURATION);
  },

  warning: (title, message?) => {
    const id = nextId();
    set((state) => ({
      toasts: [...state.toasts, { id, type: 'warning', title, message, duration: DEFAULT_DURATION }],
    }));
    scheduleRemoval(id, DEFAULT_DURATION);
  },

  info: (title, message?) => {
    const id = nextId();
    set((state) => ({
      toasts: [...state.toasts, { id, type: 'info', title, message, duration: DEFAULT_DURATION }],
    }));
    scheduleRemoval(id, DEFAULT_DURATION);
  },
}));

// Alias for backward compatibility
export const useToast = useToastStore;

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none sm:max-w-md"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const typeStyles = {
  success: 'border-green-300 bg-green-50 text-green-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-blue-300 bg-blue-50 text-blue-900',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-900',
};

const iconStyles = {
  success: 'text-green-600',
  error: 'text-red-600',
  info: 'text-blue-600',
  warning: 'text-yellow-600',
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = iconMap[toast.type];
  const isError = toast.type === 'error';
  const itemRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;
    // Force reflow then remove the initial transform
    el.getBoundingClientRect();
    el.style.transform = 'translateX(0)';
    el.style.opacity = '1';
  }, []);

  const handleClose = () => {
    const el = itemRef.current;
    if (el) {
      el.style.transform = 'translateX(100%)';
      el.style.opacity = '0';
      setTimeout(onClose, 200);
    } else {
      onClose();
    }
  };

  const handleRetry = () => {
    if (toast.action) {
      toast.action.onClick();
      handleClose();
    }
  };

  return (
    <div
      ref={itemRef}
      role={isError ? 'alert' : 'status'}
      aria-atomic="true"
      className={cn(
        'pointer-events-auto rounded-lg border shadow-lg p-4 min-w-[280px]',
        'transition-all duration-200 ease-out',
        typeStyles[toast.type]
      )}
      style={{ transform: 'translateX(100%)', opacity: '0' }}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconStyles[toast.type])} aria-hidden="true" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.message && (
            <p className="text-sm mt-1 opacity-80">{toast.message}</p>
          )}

          {toast.action && (
            <button
              onClick={handleRetry}
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 text-sm font-medium',
                'rounded-md px-3 py-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500',
                'bg-red-100 hover:bg-red-200 text-red-800'
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {toast.action.label}
            </button>
          )}
        </div>

        <button
          onClick={handleClose}
          className={cn(
            'p-1 rounded-sm transition-colors flex-shrink-0',
            'hover:bg-black/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current'
          )}
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

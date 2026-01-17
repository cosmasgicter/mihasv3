import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = Date.now().toString();
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })), 5000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
  success: (title, message) => {
    const id = Date.now().toString();
    const msg = message || title;
    set((state) => ({ toasts: [...state.toasts, { id, type: 'success', message: msg }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })), 5000);
  },
  error: (title, message) => {
    const id = Date.now().toString();
    const msg = message || title;
    set((state) => ({ toasts: [...state.toasts, { id, type: 'error', message: msg }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })), 5000);
  },
  info: (title, message) => {
    const id = Date.now().toString();
    const msg = message || title;
    set((state) => ({ toasts: [...state.toasts, { id, type: 'info', message: msg }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })), 5000);
  },
}))

// Export useToast as an alias for backward compatibility
export const useToast = useToastStore;

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };
  const Icon = icons[toast.type];

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-4 min-w-[300px] animate-slide-up flex items-start gap-3">
      <Icon className={cn(
        'h-5 w-5 flex-shrink-0',
        toast.type === 'success' && 'text-green-500',
        toast.type === 'error' && 'text-destructive',
        toast.type === 'info' && 'text-blue-500'
      )} />
      <p className="text-sm text-foreground flex-1">{toast.message}</p>
      <button 
        onClick={onClose} 
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

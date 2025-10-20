import { useState, useEffect } from 'react';
import { Search, Command } from 'lucide-react';
import { Dialog } from './Dialog';
import { Input } from './Input';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

interface Command {
  id: string;
  label: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  commands: Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useKeyboardShortcut({ key: 'k', ctrl: true, callback: () => setOpen(true) });

  const filtered = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase()) ||
    cmd.keywords?.some(k => k.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="pl-10"
            autoFocus
          />
        </div>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {filtered.map(cmd => (
            <button
              key={cmd.id}
              onClick={() => { cmd.action(); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors"
            >
              {cmd.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No commands found</p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Command className="h-3 w-3" />
          <span>Press Ctrl+K to open</span>
        </div>
      </div>
    </Dialog>
  );
}

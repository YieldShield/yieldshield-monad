import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string; href?: string };
type ToastInput = Omit<Toast, "id">;

const ToastCtx = createContext<{ toast: (t: ToastInput) => void }>({ toast: () => {} });

/** Push a transient toast (success/error/info), optionally with a link (e.g. explorer). */
export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: ToastInput) => {
    const id = ++nextId;
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+1rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-8">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-[420px] items-center gap-2.5 rounded-input px-4 py-3 text-[14px] font-semibold shadow-panel animate-fade-up",
              t.kind === "success" && "bg-ink text-white",
              t.kind === "error" && "bg-amber-tint text-amber-deep",
              t.kind === "info" && "bg-surface text-ink",
            )}
          >
            {t.kind === "success" && <CheckIcon className="h-4.5 w-4.5 text-white" />}
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            {t.href && (
              <a href={t.href} target="_blank" rel="noreferrer" className="underline opacity-80 hover:opacity-100">
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

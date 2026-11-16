"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  width = 720,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="nb pop-in flex max-h-[90vh] w-full flex-col outline-none"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between gap-4 border-b-[3px] border-ink px-5 py-3.5">
          <h2 className="display text-[22px]">{title}</h2>
          <button className="ic-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} strokeWidth={2.6} />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t-[3px] border-ink px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className={"nb-btn " + (danger ? "coral" : "sun")}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[16px] leading-snug">{message}</p>
    </Modal>
  );
}

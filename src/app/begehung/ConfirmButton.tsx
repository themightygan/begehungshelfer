"use client";

// Submit-Button mit Rückfrage (für irreversible Aktionen wie den Abschluss).
export function ConfirmButton({
  children,
  className,
  message,
}: {
  children: React.ReactNode;
  className?: string;
  message: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

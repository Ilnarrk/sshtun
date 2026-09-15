import type { ReactNode } from "react";

export function Field({ label, htmlFor, error, className = "", required = false, children }: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
      {error && <small className="field-error" id={`${htmlFor}-error`}>{error}</small>}
    </div>
  );
}

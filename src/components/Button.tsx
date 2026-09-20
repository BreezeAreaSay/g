import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-slate-900 text-white active:bg-slate-700 disabled:bg-slate-300",
  secondary: "bg-white text-slate-900 border border-slate-300 active:bg-slate-100",
  danger: "bg-red-600 text-white active:bg-red-700 disabled:bg-red-200",
  ghost: "bg-transparent text-slate-600 active:bg-slate-100",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Big, thumb-friendly button — spec §29 "крупные кнопки". */
export function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      className={`min-h-14 w-full rounded-2xl px-6 text-base font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}

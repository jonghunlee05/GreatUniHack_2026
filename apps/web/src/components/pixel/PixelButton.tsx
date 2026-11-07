import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  variant?: "copper" | "ghost";
  size?: "md" | "lg";
  /** Renders a link instead of a button. */
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function PixelButton({
  variant = "copper",
  size = "md",
  href,
  className = "",
  children,
  ...rest
}: Props) {
  const classes = [
    "px-btn",
    variant === "ghost" && "px-btn--ghost",
    size === "lg" && "px-btn--lg",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={rest["aria-label"]}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}

interface ActionButtonProps {
  label: string;
  variant?: "primary" | "prominent" | "muted" | "destructive";
  size?: "sm" | "md";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

const variantStyles = {
  primary: "bg-btn-primary text-text-primary hover:opacity-90",
  prominent: "bg-btn-prominent text-btn-prominent-text hover:opacity-90",
  muted: "bg-btn-muted text-text-primary hover:bg-bg-elevated",
  destructive: "bg-accent-red text-text-primary hover:opacity-90",
};

export function ActionButton({
  label,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  className = "",
}: ActionButtonProps) {
  const sizeClass = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-base";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        font-semibold rounded-md transition-all
        ${sizeClass}
        ${variantStyles[variant]}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
    >
      {label}
    </button>
  );
}

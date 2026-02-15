interface OptionButtonProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function OptionButton({ label, selected, disabled, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        px-3 py-1.5 rounded-md text-sm font-medium transition-all border
        ${selected
          ? "bg-accent-blue text-text-primary border-accent-blue"
          : "bg-bg-elevated text-text-secondary border-border-subtle hover:border-border-active hover:text-text-primary"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {label}
    </button>
  );
}

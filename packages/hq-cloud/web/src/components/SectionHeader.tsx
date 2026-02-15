interface SectionHeaderProps {
  title: string;
  className?: string;
}

export function SectionHeader({ title, className = "" }: SectionHeaderProps) {
  return (
    <h2
      className={`text-[13px] font-semibold uppercase tracking-[1.2px] text-text-secondary ${className}`}
    >
      {title}
    </h2>
  );
}

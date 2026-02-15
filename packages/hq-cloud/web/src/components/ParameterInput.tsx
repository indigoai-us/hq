import type { WorkerSkillParameter } from "@/types/worker";

interface ParameterInputProps {
  param: WorkerSkillParameter;
  value: string;
  onChange: (name: string, value: string) => void;
}

export function ParameterInput({ param, value, onChange }: ParameterInputProps) {
  if (param.type === "boolean") {
    return (
      <label className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(param.name, e.target.checked ? "true" : "false")}
          className="w-4 h-4 rounded border-border-subtle bg-bg-tertiary accent-accent-blue"
        />
        <div>
          <span className="text-sm text-text-primary">{param.label}</span>
          {param.required && <span className="text-accent-red text-xs ml-1">*</span>}
        </div>
      </label>
    );
  }

  if (param.type === "select" && param.options) {
    return (
      <div className="py-2">
        <label className="block text-sm text-text-secondary mb-1">
          {param.label}
          {param.required && <span className="text-accent-red ml-1">*</span>}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(param.name, e.target.value)}
          className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none"
        >
          <option value="">Select...</option>
          {param.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="py-2">
      <label className="block text-sm text-text-secondary mb-1">
        {param.label}
        {param.required && <span className="text-accent-red ml-1">*</span>}
      </label>
      <input
        type={param.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(param.name, e.target.value)}
        placeholder={param.placeholder}
        className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none"
      />
    </div>
  );
}

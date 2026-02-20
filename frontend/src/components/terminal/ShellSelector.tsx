import { useCallback } from 'react';
import type { ShellType } from '@webterm/shared/models';

export interface ShellOption {
  value: ShellType;
  label: string;
  description?: string;
  icon?: string;
}

const defaultShellOptions: ShellOption[] = [
  { value: 'default', label: 'Default', description: 'System default shell' },
  { value: 'powershell', label: 'PowerShell', description: 'Windows PowerShell' },
  { value: 'pwsh', label: 'PowerShell Core', description: 'Cross-platform PowerShell' },
  { value: 'cmd', label: 'CMD', description: 'Windows Command Prompt' },
  { value: 'bash', label: 'Bash', description: 'Bourne Again Shell' },
  { value: 'zsh', label: 'Zsh', description: 'Z Shell' },
  { value: 'sh', label: 'sh', description: 'POSIX Shell' },
];

export interface ShellSelectorProps {
  /** Currently selected shell */
  value?: ShellType;
  /** Callback when shell is selected */
  onChange: (shell: ShellType) => void;
  /** Available shell options */
  options?: ShellOption[];
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/** Shell selection dropdown */
export function ShellSelector({
  value = 'default',
  onChange,
  options = defaultShellOptions,
  disabled = false,
  className = '',
}: ShellSelectorProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as ShellType);
    },
    [onChange]
  );

  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="
          appearance-none
          w-full
          px-3 py-2 pr-8
          bg-gray-900 
          border border-gray-700 
          rounded-md
          text-sm text-gray-200
          cursor-pointer
          hover:border-green-600
          focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        "
        aria-label="Select shell"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-gray-900 text-gray-200"
          >
            {option.label}
          </option>
        ))}
      </select>

      {/* Dropdown arrow */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Selected shell description tooltip */}
      {!disabled && (
        <div className="absolute left-0 -bottom-6 text-xs text-gray-500">
          {options.find((o) => o.value === value)?.description}
        </div>
      )}
    </div>
  );
}

export default ShellSelector;

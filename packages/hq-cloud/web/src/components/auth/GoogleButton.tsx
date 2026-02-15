interface GoogleButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
}

/**
 * GoogleButton displays the "Continue with Google" OAuth button
 * with Indigo brand styling (purple). Uses inline SVG for the Google icon.
 */
export function GoogleButton({
  onClick,
  isLoading = false,
  label = 'Continue with Google',
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      className={`bg-[rgba(174,96,248,0.8)] box-border content-stretch flex gap-2.5 items-center justify-center overflow-clip px-5 py-2.5 relative rounded-[10px] shrink-0 w-full ${
        isLoading
          ? 'opacity-70 pointer-events-none'
          : 'hover:bg-[rgba(174,96,248,0.9)] cursor-pointer'
      }`}
      aria-busy={isLoading}
      disabled={isLoading}
      onClick={() => !isLoading && onClick()}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          <div className="overflow-clip relative shrink-0 size-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="white"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <span className="font-medium leading-[0] relative shrink-0 text-[14px] text-[rgba(255,255,255,0.9)] text-center text-nowrap">
            <span className="leading-[20px] whitespace-pre">{label}</span>
          </span>
        </>
      )}
    </button>
  );
}

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * AuthLayout provides the standard dark theme background and centered layout
 * used across all authentication pages. Matches the Indigo webauth styling.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="bg-[#141414] overflow-clip relative rounded-[16px] size-full min-h-screen">
      <div className="absolute content-stretch flex flex-col gap-8 items-center justify-start left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
        {children}
      </div>
    </div>
  );
}

interface AuthContentProps {
  children: React.ReactNode;
}

export function AuthContent({ children }: AuthContentProps) {
  return (
    <div className="content-stretch flex flex-col gap-6 items-center justify-start relative shrink-0">
      {children}
    </div>
  );
}

interface AuthTitleProps {
  children: React.ReactNode;
}

export function AuthTitle({ children }: AuthTitleProps) {
  return (
    <div className="font-semibold leading-[0] relative shrink-0 text-[#ffffff] text-[24px] text-center text-nowrap tracking-[-0.24px]">
      <p className="leading-[32px] whitespace-pre">{children}</p>
    </div>
  );
}

interface AuthErrorTitleProps {
  children: React.ReactNode;
}

export function AuthErrorTitle({ children }: AuthErrorTitleProps) {
  return (
    <div className="font-semibold text-[24px] text-[#e53e3e] text-center tracking-[-0.24px]">
      <p className="leading-[32px]">{children}</p>
    </div>
  );
}

interface AuthSubtitleProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthSubtitle({ children, className = '' }: AuthSubtitleProps) {
  return (
    <div
      className={`font-normal text-[14px] text-[rgba(255,255,255,0.6)] text-center ${className}`}
    >
      <p className="leading-[20px]">{children}</p>
    </div>
  );
}

interface AuthButtonsContainerProps {
  children: React.ReactNode;
}

export function AuthButtonsContainer({ children }: AuthButtonsContainerProps) {
  return (
    <div className="content-stretch flex flex-col gap-4 items-center justify-start relative shrink-0">
      <div className="content-stretch flex flex-col gap-4 items-start justify-start relative shrink-0 w-80">
        {children}
      </div>
    </div>
  );
}

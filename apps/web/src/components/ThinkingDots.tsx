interface ThinkingDotsProps {
  className?: string;
}

export function ThinkingDots({ className = '' }: ThinkingDotsProps) {
  return (
    <span className={`thinking-dots ${className}`.trim()} aria-label="pensando" role="status">
      <span className="thinking-dots__dot" aria-hidden="true" />
      <span className="thinking-dots__dot" aria-hidden="true" />
      <span className="thinking-dots__dot" aria-hidden="true" />
    </span>
  );
}

import logoUrl from '../assets/LogoSokrAiDef.png';

interface SokrAiLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

const SIZE_CLASS: Record<NonNullable<SokrAiLogoProps['size']>, string> = {
  xs: 'sokrai-logo--xs',
  sm: 'sokrai-logo--sm',
  md: 'sokrai-logo--md',
  lg: 'sokrai-logo--lg',
  xl: 'sokrai-logo--xl',
};

export function SokrAiLogo({
  className = '',
  size = 'sm',
  animated = false,
}: SokrAiLogoProps) {
  return (
    <img
      className={[
        'sokrai-logo',
        SIZE_CLASS[size],
        animated ? 'sokrai-logo--animated' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      src={logoUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function SokrAiLogoLoader({
  className = '',
  size = 'sm',
}: Omit<SokrAiLogoProps, 'animated'>) {
  return <SokrAiLogo className={className} size={size} animated />;
}

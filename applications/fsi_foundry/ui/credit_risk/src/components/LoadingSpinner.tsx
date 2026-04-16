export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div
      className={`${sizeMap[size]} border-[3px] rounded-full animate-spin`}
      style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
    />
  );
}

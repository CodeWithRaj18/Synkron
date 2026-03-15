type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md ${className}`.trim()} />;
}

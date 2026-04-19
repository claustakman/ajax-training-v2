export function Skeleton({ width, height, style }: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  );
}

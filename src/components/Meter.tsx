export function Meter({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </span>
  );
}

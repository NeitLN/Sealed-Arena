export function LandingIcon({
  name,
  size = 20,
}: {
  name: "arrow" | "key" | "check" | "layers" | "pause" | "play" | "cross";
  size?: number;
}) {
  const paths = {
    arrow: "M5 12h14m-5-5 5 5-5 5",
    key: "M12 8a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM11 11l9 9m-5-5 3-3m-1 5 3-3",
    check: "m5 12 4 4L19 6",
    layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8V4Z",
    cross: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

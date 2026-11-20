import { useMemo } from "react";
import qrcode from "./vendor/qrcode.mjs";

/** Local generation, with a four-module quiet zone on every side. */
export function ArenaQr({ url, label }: { url: string; label: string }) {
  const qr = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(url);
    code.make();
    const size = code.getModuleCount();
    const cells: string[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (code.isDark(y, x)) cells.push(`M${x + 4},${y + 4}h1v1h-1z`);
    return { size: size + 8, path: cells.join("") };
  }, [url]);
  return (
    <svg
      className="arena-qr"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <title>{label}</title>
      <path fill="#fff" d={`M0 0h${qr.size}v${qr.size}H0z`} />
      <path fill="#000" d={qr.path} />
    </svg>
  );
}

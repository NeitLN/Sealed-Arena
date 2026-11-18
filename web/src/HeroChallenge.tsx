import { arenaText } from "./arenaText.js";
import type { Lang } from "./i18n.js";
import { TryPayment } from "./TryPayment.js";
import { useArenaLive } from "./useArenaLive.js";

export default function HeroChallenge({ lang }: { lang: Lang }) {
  const live = useArenaLive(1);
  return (
    <TryPayment
      t={arenaText(lang)}
      view={live.view}
      onSent={() => void live.refreshChain()}
      onReportBreach={() => {
        location.href = "/arena#on-chain-check";
      }}
    />
  );
}

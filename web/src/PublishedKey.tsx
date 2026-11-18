import { Button } from "@astryxdesign/core/Button";
import { useState } from "react";
import { ARENA } from "./arena.config.js";
import { arenaText } from "./arenaText.js";
import { designText } from "./designText.js";
import type { Lang } from "./i18n.js";

export function PublishedKey({ lang }: { lang: Lang }) {
  const t = arenaText(lang);
  const d = designText(lang);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ARENA.agentPrivateKey);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <section className="published-key" aria-label={t.keyTitle}>
      <div className="published-key-header">
        <p className="micro-label">
          {t.privateKey} / {lang === "vi" ? "CÔNG BỐ CÓ CHỦ ĐÍCH" : "PUBLIC ON PURPOSE"}
        </p>
        <Button
          label={copied ? d.keyCopied : d.keyCopy}
          variant="secondary"
          onClick={() => void copy()}
        />
      </div>
      <code className="published-key-value">{ARENA.agentPrivateKey}</code>
      <p>{t.keyWarning}</p>
      <p className="copy-feedback" role="status">
        {failed ? d.keyCopyFailed : copied ? d.keyCopied : ""}
      </p>
    </section>
  );
}

import "./global.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ArenaPage from "./ArenaPage.js";
import OwnerPage from "./OwnerPage.js";
import RulesPage from "./RulesPage.js";

/** Three pages, chosen by path (the host rewrites every path to index.html). */
function Page() {
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/arena/rules") return <RulesPage />;
  if (path === "/arena") return <ArenaPage />;
  return <OwnerPage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>
    <Theme theme={neutralTheme} mode="light">
      <Page />
    </Theme>
  </StrictMode>,
);

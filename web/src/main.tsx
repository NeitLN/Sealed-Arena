import "./global.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OwnerPage from "./OwnerPage.js";

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>
    <Theme theme={neutralTheme} mode="light">
      <OwnerPage />
    </Theme>
  </StrictMode>,
);

import "./global.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { Component, lazy, type ReactNode, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const ArenaPage = lazy(() => import("./ArenaPage.js"));
const BusinessPage = lazy(() => import("./BusinessPage.js"));
const ComparePage = lazy(() => import("./ComparePage.js"));
const LandingPage = lazy(() => import("./LandingPage.js"));
const OwnerPage = lazy(() => import("./OwnerPage.js"));
const RulesPage = lazy(() => import("./RulesPage.js"));

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <main className="route-fallback">
          <h1>Sealed Arena</h1>
          <p>This page could not load. / Không tải được trang.</p>
          <a href={location.pathname}>Reload / Tải lại</a>
        </main>
      );
    return this.props.children;
  }
}

/** Pages chosen by path (the host rewrites every path to index.html). */
function Page() {
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/arena/rules") return <RulesPage />;
  if (path === "/arena") return <ArenaPage />;
  if (path === "/compare") return <ComparePage />;
  if (path === "/business") return <BusinessPage />;
  if (path === "/console") return <OwnerPage />;
  return <LandingPage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>
    <Theme theme={neutralTheme} mode="light">
      <PageBoundary>
        <Suspense
          fallback={
            <div className="route-fallback" role="status">
              Sealed Arena · Loading / Đang tải…
            </div>
          }
        >
          <Page />
        </Suspense>
      </PageBoundary>
    </Theme>
  </StrictMode>,
);

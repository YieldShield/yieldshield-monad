import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const scrollPositions = new Map<string, number>();

/** Restore the app's content scroller on Back/Forward; query-only edits keep focus. */
export function RouteNavigation() {
  const { key, pathname, search, hash } = useLocation();
  const navigation = useNavigationType();
  const previousPath = useRef<string | null>(null);
  const previousHash = useRef<string | null>(null);
  useLayoutEffect(() => {
    const scroller = document.getElementById("app-scroll");
    const scrollTo = (top: number) => (scroller ?? window).scrollTo({ top, left: 0, behavior: "instant" });
    const changedPage = previousPath.current !== pathname;
    if (navigation === "POP") {
      scrollTo(scrollPositions.get(key) ?? 0);
    } else if (changedPage) {
      scrollTo(0);
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
    if (hash && (changedPage || previousHash.current !== hash) && !(navigation === "POP" && scrollPositions.has(key))) {
      try {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      } catch {
        /* Ignore malformed fragment IDs. */
      }
    }
    previousPath.current = pathname;
    previousHash.current = hash;
    return () => {
      scrollPositions.set(key, scroller?.scrollTop ?? window.scrollY);
      if (scrollPositions.size > 50) scrollPositions.delete(scrollPositions.keys().next().value!);
    };
  }, [key, pathname, search, hash, navigation]);
  return null;
}

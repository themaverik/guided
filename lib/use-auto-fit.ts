"use client";

/*
 * Auto-fit — guarantees no step page overflows its A4 sheet. Direct port of
 * `fitSteps()` from design-references/Guidebook A4.html.
 *
 * Each step's image rows are laid out at their natural, width-driven heights.
 * If the combined stack is taller than the space left under the header/title,
 * every image slot on that page is scaled down uniformly (aspect preserved, so
 * nothing is cropped) until the stack fits, floored at MIN_SLOT_PX.
 *
 * The critical detail (preserved here): in each shrink pass, SNAPSHOT every
 * slot's size BEFORE mutating any, then scale each from its own snapshot.
 * Reading and writing in one pass lets converting one slot to flex:0 0 auto
 * reflow its row-mates, which makes the two slots of a `double` row diverge.
 *
 * Runs in useLayoutEffect (measures the real DOM before paint), and re-runs
 * after webfonts settle and on window load, since text height shifts the budget.
 */
import { useEffect, useLayoutEffect, useRef } from "react";

/** Use layout effect in the browser; fall back to effect during SSR to avoid
 *  React's "useLayoutEffect does nothing on the server" warning. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Never shrink a slot below this width/height (px). */
export const MIN_SLOT_PX = 60;

/** Run one fit pass over every `.page.step` inside `container`. Returns the
 *  data-screen-labels of pages that still overflow after scaling. */
export function fitSteps(container: HTMLElement): string[] {
  const overflows: string[] = [];

  container.querySelectorAll<HTMLElement>(".page.step").forEach((page) => {
    const inner = page.querySelector<HTMLElement>(".page-inner");
    const body = page.querySelector<HTMLElement>(".step-body");
    if (!inner || !body) return;

    // Reset any previous fit so re-runs measure from the natural layout.
    body.querySelectorAll<HTMLElement>(".img-slot").forEach((s) => {
      s.style.width = "";
      s.style.height = "";
      s.style.maxWidth = "";
      s.style.flex = "";
      s.style.aspectRatio = "";
    });

    const cs = getComputedStyle(inner);
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;

    // Vertical budget the step-body may occupy = page height minus inner
    // padding minus everything stacked above it (head, title, instruction)
    // and the flex gaps between them. The absolute footer is excluded.
    const flowKids = [...inner.children].filter(
      (c) =>
        !c.classList.contains("page-foot") &&
        !c.classList.contains("page-foot-rule"),
    ) as HTMLElement[];
    let consumed = gap * Math.max(0, flowKids.length - 1);
    flowKids.forEach((c) => {
      if (c !== body) consumed += c.offsetHeight;
    });
    const budget = page.clientHeight - padT - padB - consumed;

    // Shrink iteratively with a damped ratio to avoid overshoot.
    let guard = 0;
    while (body.scrollHeight > budget + 1 && guard < 80) {
      const ratio = budget / body.scrollHeight; // < 1
      const step = 1 - (1 - ratio) * 0.5; // damped
      const slots = [...body.querySelectorAll<HTMLElement>(".img-slot")];

      // READ phase — snapshot every slot's current size BEFORE mutating any.
      const snap = slots.map((s) => s.getBoundingClientRect());

      // WRITE phase — scale each from its own snapshot.
      let hitFloor = true;
      slots.forEach((s, i) => {
        const w = Math.max(MIN_SLOT_PX, snap[i].width * step);
        const h = Math.max(MIN_SLOT_PX, snap[i].height * step);
        if (w > MIN_SLOT_PX + 0.5 || h > MIN_SLOT_PX + 0.5) hitFloor = false;
        s.style.width = `${w}px`;
        s.style.height = `${h}px`;
        s.style.maxWidth = "none";
        s.style.flex = "0 0 auto";
        s.style.aspectRatio = "auto";
      });
      guard++;
      if (hitFloor) break; // images can't shrink further (callouts dominate)
    }

    if (body.scrollHeight > budget + 2) {
      const label = page.getAttribute("data-screen-label") || "";
      overflows.push(label);
      console.warn(
        `fitSteps: "${label}" still overflows after scaling — the callouts ` +
          `are taller than the page allows. Trim callouts or split into another step.`,
      );
    }
  });

  return overflows;
}

/**
 * Attach auto-fit to a container ref. Re-runs whenever `deps` change (pass a
 * content key like `bookFitKey(book)`), after `document.fonts.ready`, and on
 * window `load`. `onReport` receives the overflowing page labels each pass.
 */
export function useAutoFit(
  ref: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList,
  onReport?: (overflows: string[]) => void,
): void {
  const reportRef = useRef(onReport);
  useEffect(() => {
    reportRef.current = onReport;
  }, [onReport]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const overflows = fitSteps(el);
      reportRef.current?.(overflows);
    };

    run();

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(run).catch(() => {});
    }
    window.addEventListener("load", run);

    return () => {
      cancelled = true;
      window.removeEventListener("load", run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

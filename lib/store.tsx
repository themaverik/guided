"use client";

/*
 * Editor store. Per-render-tree instance (created in a context provider) so it
 * is SSR-safe — no module-level singleton shared across requests. The `book`
 * object is the single source of truth; UI selection state is kept separate.
 *
 * Structural mutations are delegated to the pure helpers in book-mutations.ts;
 * the actions here apply them and keep the selection coherent after removes.
 */
import { createContext, useContext, useRef } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  Annotation,
  Background,
  Book,
  Border,
  Callout,
  Chapter,
  Connector,
  Ending,
  ImageFit,
  ImageRow,
  PageConfig,
  SectionFont,
  StackedObject,
  Step,
  Surface,
  Theme,
  ThemeSection,
  Watermark,
} from "./book-schema";
import { DEFAULT_WATERMARK_OPACITY, DEFAULT_PAGE_CONFIG } from "./book-schema";
import * as M from "./book-mutations";
import { DEFAULT_STROKE, DEFAULT_SWATCH_ID } from "./annotation-palette";

export interface Selection {
  chapterIndex: number;
  /** null = the chapter intro page is selected (no specific step). */
  stepIndex: number | null;
  rowIndex: number | null;
  slotIndex: number | null;
  /** Selected grid cell column (within rowIndex), grid mode only. */
  cellIndex?: number | null;
  /** Selected cell object id (a floating callout), grid mode only. */
  objectId?: string | null;
}

export type AnnotationTool =
  | "select"
  | "box"
  | "line"
  | "bracket"
  | "diamond"
  | "text"
  | "connector";

export interface EditorState {
  /** The project this editor is editing (its slug). */
  projectSlug: string;
  book: Book;
  selection: Selection;
  /** id of the focused annotation (shows its drag handles on the preview). */
  selectedAnnotation: string | null;
  /** data-screen-labels of pages that still overflow after the last fit pass. */
  overflows: string[];
  /** Transient: hide grid editor chrome (guides + handles) for a clean preview. */
  hideGridChrome: boolean;
  /** Transient: the active annotation tool (drives on-canvas drawing). */
  activeTool: AnnotationTool;
  /** Transient: stroke color applied to newly-drawn shapes. */
  drawColor: string;
  /** Transient: stroke width applied to newly-drawn shapes. */
  drawWidth: number;
  /** Transient: swatch id (palette token) applied to newly-drawn shapes. */
  drawSwatch: string;
  /** Transient: the annotation queued for delete-confirmation, or null. */
  pendingDelete: { ci: number; si: number; id: string } | null;

  // selection
  selectChapter: (chapterIndex: number) => void;
  selectStep: (chapterIndex: number, stepIndex: number) => void;
  selectRow: (chapterIndex: number, stepIndex: number, rowIndex: number) => void;
  selectCell: (ci: number, si: number, ri: number, cellIndex: number) => void;
  selectCellObject: (ci: number, si: number, ri: number, cellIndex: number, objectId: string) => void;
  toggleGridChrome: () => void;

  // book meta
  updateBookMeta: (
    patch: Partial<Pick<Book, "title" | "subtitle" | "author" | "edition">>,
  ) => void;
  updateWatermark: (patch: Partial<Watermark>) => void;
  updateTheme: (section: ThemeSection, patch: Partial<SectionFont>) => void;
  updateBackground: (patch: Partial<Background>) => void;
  updatePageConfig: (patch: Partial<PageConfig>) => void;
  updateEnding: (patch: Partial<Ending>) => void;
  setOverflows: (overflows: string[]) => void;

  // chapters
  addChapter: () => void;
  removeChapter: (ci: number) => void;
  moveChapter: (ci: number, dir: -1 | 1) => void;
  updateChapter: (
    ci: number,
    patch: Partial<Pick<Chapter, "id" | "title" | "description">>,
  ) => void;

  // steps
  addStep: (ci: number) => void;
  removeStep: (ci: number, si: number) => void;
  moveStep: (ci: number, si: number, dir: -1 | 1) => void;
  updateStep: (
    ci: number,
    si: number,
    patch: Partial<Pick<Step, "title" | "instruction" | "layoutMode">>,
  ) => void;
  setStepLayoutMode: (ci: number, si: number, mode: "legacy" | "grid") => void;

  // rows
  addRow: (ci: number, si: number) => void;
  removeRow: (ci: number, si: number, ri: number) => void;
  moveRow: (ci: number, si: number, ri: number, dir: -1 | 1) => void;
  updateRow: (
    ci: number,
    si: number,
    ri: number,
    patch: Partial<ImageRow>,
  ) => void;
  resizeGridRow: (
    ci: number,
    si: number,
    dividerIndex: number,
    deltaFr: number,
  ) => void;
  resizeGridColumn: (
    ci: number,
    si: number,
    ri: number,
    dividerIndex: number,
    deltaFr: number,
  ) => void;
  addGridRow: (ci: number, si: number) => void;
  removeGridRow: (ci: number, si: number, ri: number) => void;
  addGridColumn: (ci: number, si: number, ri: number) => void;
  removeGridColumn: (ci: number, si: number, ri: number, cellIndex: number) => void;

  // cell objects (grid mode)
  setCellImage: (ci: number, si: number, ri: number, cellIndex: number, filename: string) => void;
  removeCellImage: (ci: number, si: number, ri: number, cellIndex: number) => void;
  setCellImageFit: (ci: number, si: number, ri: number, cellIndex: number, fit: ImageFit) => void;
  addCellCallout: (ci: number, si: number, ri: number, cellIndex: number) => void;
  updateCellCallout: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, patch: Partial<Callout>) => void;
  removeCellObject: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number) => void;
  moveCellObject: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, dir: -1 | 1) => void;
  addCellText: (ci: number, si: number, ri: number, cellIndex: number) => void;
  updateCellText: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, text: string) => void;
  updateCellObjectPlacement: (ci: number, si: number, ri: number, cellIndex: number, objectId: string, patch: Partial<Pick<StackedObject, "positioned" | "x" | "y" | "w">>) => void;
  setCellTextAlign: (ci: number, si: number, ri: number, cellIndex: number, objIndex: number, align: "left" | "center" | "right") => void;
  setCellImageBorder: (ci: number, si: number, ri: number, cellIndex: number, border: Border) => void;

  // callouts
  setCalloutCount: (ci: number, si: number, ri: number, n: number) => void;
  updateCallout: (
    ci: number,
    si: number,
    ri: number,
    k: number,
    patch: Partial<Callout>,
  ) => void;
  removeCallout: (ci: number, si: number, ri: number, k: number) => void;
  moveCallout: (
    ci: number,
    si: number,
    ri: number,
    k: number,
    dir: -1 | 1,
  ) => void;

  // annotations (page-level)
  addAnnotation: (ci: number, si: number, ann: Annotation) => void;
  updateAnnotation: (
    ci: number,
    si: number,
    id: string,
    patch: Partial<Surface> & Partial<Connector>,
  ) => void;
  removeAnnotation: (ci: number, si: number, id: string) => void;
  selectAnnotation: (id: string | null) => void;
  setActiveTool: (tool: AnnotationTool) => void;
  setDrawColor: (color: string) => void;
  setDrawWidth: (width: number) => void;
  setDrawSwatch: (id: string) => void;
  requestDeleteAnnotation: (ci: number, si: number, id: string) => void;
  cancelDeleteAnnotation: () => void;
}

export type EditorStore = StoreApi<EditorState>;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

function reconcileColumnRemoval(
  sel: Selection,
  ci: number,
  si: number,
  ri: number,
  cellIndex: number,
): Selection {
  if (sel.chapterIndex !== ci || sel.stepIndex !== si || sel.rowIndex !== ri || sel.cellIndex == null) return sel;
  if (sel.cellIndex === cellIndex) return { ...sel, cellIndex: null };
  if (sel.cellIndex > cellIndex) return { ...sel, cellIndex: sel.cellIndex - 1 };
  return sel;
}

function reconcileRowRemoval(
  sel: Selection,
  ci: number,
  si: number,
  ri: number,
): Selection {
  if (sel.chapterIndex !== ci || sel.stepIndex !== si || sel.rowIndex == null) return sel;
  if (sel.rowIndex === ri) return { ...sel, cellIndex: null };
  if (sel.rowIndex > ri) return { ...sel, rowIndex: sel.rowIndex - 1 };
  return sel;
}

export function createEditorStore(
  initialBook: Book,
  projectSlug: string,
): EditorStore {
  return createStore<EditorState>()((set) => ({
    projectSlug,
    book: initialBook,
    selection: {
      chapterIndex: 0,
      stepIndex: null,
      rowIndex: null,
      slotIndex: null,
    },
    selectedAnnotation: null,
    overflows: [],
    hideGridChrome: false,
    activeTool: "select",
    drawColor: DEFAULT_STROKE,
    drawWidth: 2,
    drawSwatch: DEFAULT_SWATCH_ID,
    pendingDelete: null,

    // ── selection ──
    selectChapter: (chapterIndex) =>
      set({
        selection: {
          chapterIndex,
          stepIndex: null,
          rowIndex: null,
          slotIndex: null,
        },
        selectedAnnotation: null,
      }),
    selectStep: (chapterIndex, stepIndex) =>
      set({
        selection: {
          chapterIndex,
          stepIndex,
          rowIndex: 0,
          slotIndex: null,
        },
        selectedAnnotation: null,
      }),
    selectRow: (chapterIndex, stepIndex, rowIndex) =>
      set({
        selection: {
          chapterIndex,
          stepIndex,
          rowIndex,
          slotIndex: null,
        },
      }),
    selectCell: (chapterIndex, stepIndex, rowIndex, cellIndex) =>
      set({
        selection: { chapterIndex, stepIndex, rowIndex, slotIndex: null, cellIndex },
        selectedAnnotation: null,
      }),
    selectCellObject: (chapterIndex, stepIndex, rowIndex, cellIndex, objectId) =>
      set({
        selection: { chapterIndex, stepIndex, rowIndex, slotIndex: null, cellIndex, objectId },
        selectedAnnotation: null,
      }),

    // ── book meta ──
    updateBookMeta: (patch) =>
      set((s) => ({ book: { ...s.book, ...patch } })),
    updateWatermark: (patch) =>
      set((s) => {
        const current: Watermark = s.book.watermark ?? {
          enabled: false,
          position: "center",
          opacity: DEFAULT_WATERMARK_OPACITY,
        };
        return { book: { ...s.book, watermark: { ...current, ...patch } } };
      }),
    updateTheme: (section, patch) =>
      set((s) => {
        const theme: Theme = { ...(s.book.theme ?? {}) };
        const merged: SectionFont = { ...(theme[section] ?? {}), ...patch };
        // Drop empty values so unset sections fall back to defaults.
        (Object.keys(merged) as (keyof SectionFont)[]).forEach((k) => {
          if (!merged[k]) delete merged[k];
        });
        if (Object.keys(merged).length === 0) delete theme[section];
        else theme[section] = merged;
        return { book: { ...s.book, theme } };
      }),
    updateBackground: (patch) =>
      set((s) => {
        const current: Background = s.book.background ?? {};
        const next: Background = { ...current, ...patch };
        return { book: { ...s.book, background: next } };
      }),
    updatePageConfig: (patch) =>
      set((s) => {
        const current: PageConfig = s.book.pageConfig ?? DEFAULT_PAGE_CONFIG;
        return { book: { ...s.book, pageConfig: { ...current, ...patch } } };
      }),
    updateEnding: (patch) =>
      set((s) => {
        const current: Ending = s.book.ending ?? {};
        return { book: { ...s.book, ending: { ...current, ...patch } } };
      }),
    setOverflows: (overflows) => set({ overflows }),
    toggleGridChrome: () => set((s) => ({ hideGridChrome: !s.hideGridChrome })),

    // ── chapters ──
    addChapter: () =>
      set((s) => {
        const book = M.addChapter(s.book);
        return {
          book,
          selection: {
            chapterIndex: book.chapters.length - 1,
            stepIndex: null,
            rowIndex: null,
            slotIndex: null,
          },
        };
      }),
    removeChapter: (ci) =>
      set((s) => {
        const book = M.removeChapter(s.book, ci);
        const chapterIndex = clamp(
          s.selection.chapterIndex,
          0,
          Math.max(0, book.chapters.length - 1),
        );
        return {
          book,
          selection: {
            chapterIndex,
            stepIndex: null,
            rowIndex: null,
            slotIndex: null,
          },
        };
      }),
    moveChapter: (ci, dir) =>
      set((s) => ({ book: M.moveChapter(s.book, ci, dir) })),
    updateChapter: (ci, patch) =>
      set((s) => ({ book: M.updateChapter(s.book, ci, patch) })),

    // ── steps ──
    addStep: (ci) =>
      set((s) => {
        const book = M.addStep(s.book, ci);
        return {
          book,
          selection: {
            chapterIndex: ci,
            stepIndex: book.chapters[ci].steps.length - 1,
            rowIndex: 0,
            slotIndex: null,
          },
        };
      }),
    removeStep: (ci, si) =>
      set((s) => {
        const book = M.removeStep(s.book, ci, si);
        const count = book.chapters[ci]?.steps.length ?? 0;
        return {
          book,
          selection: {
            chapterIndex: ci,
            stepIndex: count > 0 ? clamp(si, 0, count - 1) : null,
            rowIndex: count > 0 ? 0 : null,
            slotIndex: null,
          },
        };
      }),
    moveStep: (ci, si, dir) =>
      set((s) => ({ book: M.moveStep(s.book, ci, si, dir) })),
    updateStep: (ci, si, patch) =>
      set((s) => ({ book: M.updateStep(s.book, ci, si, patch) })),
    setStepLayoutMode: (ci, si, mode) =>
      set((s) => ({ book: M.setStepLayoutMode(s.book, ci, si, mode) })),

    // ── rows ──
    addRow: (ci, si) =>
      set((s) => ({ book: M.addRow(s.book, ci, si) })),
    removeRow: (ci, si, ri) =>
      set((s) => {
        const book = M.removeRow(s.book, ci, si, ri);
        const rowIndex =
          s.selection.rowIndex != null ? Math.max(0, s.selection.rowIndex - (s.selection.rowIndex >= ri ? 1 : 0)) : 0;
        return { book, selection: { ...s.selection, rowIndex } };
      }),
    moveRow: (ci, si, ri, dir) =>
      set((s) => ({ book: M.moveRow(s.book, ci, si, ri, dir) })),
    updateRow: (ci, si, ri, patch) =>
      set((s) => ({ book: M.updateRow(s.book, ci, si, ri, patch) })),
    resizeGridRow: (ci, si, dividerIndex, deltaFr) =>
      set((s) => ({ book: M.resizeGridRow(s.book, ci, si, dividerIndex, deltaFr) })),
    resizeGridColumn: (ci, si, ri, dividerIndex, deltaFr) =>
      set((s) => ({ book: M.resizeGridColumn(s.book, ci, si, ri, dividerIndex, deltaFr) })),
    addGridRow: (ci, si) => set((s) => ({ book: M.addGridRow(s.book, ci, si) })),
    removeGridRow: (ci, si, ri) =>
      set((s) => {
        const book = M.removeGridRow(s.book, ci, si, ri);
        if (book === s.book) return { book };
        return { book, selection: reconcileRowRemoval(s.selection, ci, si, ri) };
      }),
    addGridColumn: (ci, si, ri) =>
      set((s) => ({ book: M.addGridColumn(s.book, ci, si, ri) })),
    removeGridColumn: (ci, si, ri, cellIndex) =>
      set((s) => {
        const book = M.removeGridColumn(s.book, ci, si, ri, cellIndex);
        if (book === s.book) return { book };
        return { book, selection: reconcileColumnRemoval(s.selection, ci, si, ri, cellIndex) };
      }),

    // ── cell objects ──
    setCellImage: (ci, si, ri, cellIndex, filename) =>
      set((s) => ({ book: M.setCellImage(s.book, ci, si, ri, cellIndex, filename) })),
    removeCellImage: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.removeCellImage(s.book, ci, si, ri, cellIndex) })),
    setCellImageFit: (ci, si, ri, cellIndex, fit) =>
      set((s) => ({ book: M.setCellImageFit(s.book, ci, si, ri, cellIndex, fit) })),
    addCellCallout: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.addCellCallout(s.book, ci, si, ri, cellIndex) })),
    updateCellCallout: (ci, si, ri, cellIndex, objIndex, patch) =>
      set((s) => ({ book: M.updateCellCallout(s.book, ci, si, ri, cellIndex, objIndex, patch) })),
    removeCellObject: (ci, si, ri, cellIndex, objIndex) =>
      set((s) => ({ book: M.removeCellObject(s.book, ci, si, ri, cellIndex, objIndex) })),
    moveCellObject: (ci, si, ri, cellIndex, objIndex, dir) =>
      set((s) => ({ book: M.moveCellObject(s.book, ci, si, ri, cellIndex, objIndex, dir) })),
    addCellText: (ci, si, ri, cellIndex) =>
      set((s) => ({ book: M.addCellText(s.book, ci, si, ri, cellIndex) })),
    updateCellText: (ci, si, ri, cellIndex, objIndex, text) =>
      set((s) => ({ book: M.updateCellText(s.book, ci, si, ri, cellIndex, objIndex, text) })),
    updateCellObjectPlacement: (ci, si, ri, cellIndex, objectId, patch) =>
      set((s) => ({ book: M.updateCellObjectPlacement(s.book, ci, si, ri, cellIndex, objectId, patch) })),
    setCellTextAlign: (ci, si, ri, cellIndex, objIndex, align) =>
      set((s) => ({ book: M.setCellTextAlign(s.book, ci, si, ri, cellIndex, objIndex, align) })),
    setCellImageBorder: (ci, si, ri, cellIndex, border) =>
      set((s) => ({ book: M.setCellImageBorder(s.book, ci, si, ri, cellIndex, border) })),

    // ── callouts ──
    setCalloutCount: (ci, si, ri, n) =>
      set((s) => ({ book: M.setCalloutCount(s.book, ci, si, ri, n) })),
    updateCallout: (ci, si, ri, k, patch) =>
      set((s) => ({ book: M.updateCallout(s.book, ci, si, ri, k, patch) })),
    removeCallout: (ci, si, ri, k) =>
      set((s) => ({ book: M.removeCallout(s.book, ci, si, ri, k) })),
    moveCallout: (ci, si, ri, k, dir) =>
      set((s) => ({ book: M.moveCallout(s.book, ci, si, ri, k, dir) })),

    addAnnotation: (ci, si, ann) =>
      set((s) => ({ book: M.addAnnotation(s.book, ci, si, ann) })),
    updateAnnotation: (ci, si, id, patch) =>
      set((s) => ({ book: M.updateAnnotation(s.book, ci, si, id, patch) })),
    removeAnnotation: (ci, si, id) =>
      set((s) => ({
        book: M.removeAnnotation(s.book, ci, si, id),
        selectedAnnotation:
          s.selectedAnnotation === id ? null : s.selectedAnnotation,
      })),
    selectAnnotation: (id) => set({ selectedAnnotation: id }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setDrawColor: (color) => set({ drawColor: color }),
    setDrawWidth: (width) => set({ drawWidth: width }),
    setDrawSwatch: (id) => set({ drawSwatch: id }),
    requestDeleteAnnotation: (ci, si, id) => set({ pendingDelete: { ci, si, id } }),
    cancelDeleteAnnotation: () => set({ pendingDelete: null }),
  }));
}

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorStoreProvider({
  initialBook,
  projectSlug,
  children,
}: {
  initialBook: Book;
  projectSlug: string;
  children: React.ReactNode;
}) {
  const ref = useRef<EditorStore | null>(null);
  if (ref.current === null) {
    ref.current = createEditorStore(initialBook, projectSlug);
  }
  return (
    <EditorStoreContext.Provider value={ref.current}>
      {children}
    </EditorStoreContext.Provider>
  );
}

/** Subscribe to a slice of the editor store. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error("useEditor must be used within an EditorStoreProvider");
  }
  return useStore(store, selector);
}

/* One step = one page. Port of `renderStep`; supports both authoring forms. */
import type {
  Background,
  Chapter,
  Step,
  Watermark as WatermarkData,
} from "@/lib/book-schema";
import { stepLayoutMode } from "@/lib/book-schema";
import { pad2, resolveStepRows } from "@/lib/book-render";
import GridStep from "./GridStep";
import AnnotationLayer from "./AnnotationLayer";
import ImageRow from "./ImageRow";
import PageBackground from "./PageBackground";
import PageFooter from "./PageFooter";
import RichText from "./RichText";
import Watermark from "./Watermark";

export default function StepPage({
  chapter,
  chapterIndex,
  step,
  stepIndex,
  watermark,
  background,
  assetBase,
}: {
  chapter: Chapter;
  chapterIndex: number;
  step: Step;
  stepIndex: number;
  watermark?: WatermarkData;
  background?: Background;
  assetBase: string;
}) {
  const chNum = pad2(chapterIndex + 1);
  const stepNum = pad2(stepIndex + 1);
  const total = pad2(chapter.steps.length);
  const { rows, showRowHead } = resolveStepRows(step);
  const mode = stepLayoutMode(step);

  return (
    <section
      className="page step"
      data-screen-label={`${chNum}.${stepNum} ${chapter.title}`}
    >
      <PageBackground background={background} />
      <Watermark watermark={watermark} />
      <div className="page-inner">
        <div className="step-head">
          <span className="step-eyebrow">
            Step {stepNum} of {total}
          </span>
          <span className="step-chap-label">
            Ch. {chNum} — {chapter.title}
          </span>
        </div>
        <h2 className="step-title">{step.title || `Step ${stepNum}`}</h2>
        {step.instruction ? (
          <div className="step-instruction">
            <span className="step-instruction-num">{stepNum}</span>
            <RichText
              className="step-instruction-body"
              as="div"
              block
              text={step.instruction}
            />
          </div>
        ) : null}
        {mode === "grid" && step.grid && step.grid.length > 0 ? (
          <GridStep grid={step.grid} chapter={chapter} assetBase={assetBase} />
        ) : (
          <div className="step-body">
            {rows.map((row, i) => (
              <ImageRow
                key={i}
                chapter={chapter}
                row={row}
                showHead={showRowHead}
                assetBase={assetBase}
              />
            ))}
          </div>
        )}
      </div>
      <PageFooter
        left={`Chapter ${chNum} — ${chapter.title}`}
        right={`Step ${stepNum} / ${total}`}
      />
      {/* Page-level annotations overlay the whole page (above content). */}
      <AnnotationLayer annotations={step.annotations} />
    </section>
  );
}

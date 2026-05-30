/*
 * One callout card. Carries a type icon and (in `below` mode) an auto-numbered
 * marker so it can pin to a labelled spot on the screenshot; in `side` mode it
 * has the icon but no marker. The deprecated `warn` type renders as `warning`.
 */
import type { Callout as CalloutData } from "@/lib/book-schema";
import { normalizeCalloutType } from "@/lib/book-schema";
import CalloutIcon from "./CalloutIcon";
import RichText from "./RichText";

export interface CalloutProps {
  data: CalloutData;
  /** 1-based marker shown in `below` mode; omit for `side` mode. */
  marker?: number;
  /** Width styling (grid-column span in below mode, max-width in side mode). */
  style?: React.CSSProperties;
}

export default function Callout({ data, marker, style }: CalloutProps) {
  const type = normalizeCalloutType(data.type);
  const hasTitle = Boolean(data.title);

  return (
    <div className={`callout callout--${type}`} style={style}>
      {hasTitle || marker != null ? (
        <span className="callout-title">
          {marker != null ? (
            <span className="callout-marker">{marker}</span>
          ) : null}
          <CalloutIcon type={type} />
          {data.title}
        </span>
      ) : (
        <CalloutIcon type={type} />
      )}
      <RichText className="callout-body" as="div" block text={data.body} />
    </div>
  );
}

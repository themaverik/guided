/** Running footer: a hairline rule at 14mm and a mono line at 8mm. */
export default function PageFooter({
  left,
  right,
}: {
  left: string;
  right: string;
}) {
  return (
    <>
      <div className="page-foot-rule" />
      <div className="page-foot">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </>
  );
}

"use client";

/*
 * Installs the Delete/Backspace shortcut and renders the annotation delete
 * confirmation modal, driven by the store's pendingDelete. Mounted once inside
 * the editor store provider (EditorApp's body is outside the provider, so this
 * store-consuming logic lives here). Editor-only.
 */
import ConfirmDialog from "./ConfirmDialog";
import { useAnnotationDeleteKey } from "./use-annotation-delete-key";
import { useEditor } from "@/lib/store";

export default function AnnotationDeleteController() {
  useAnnotationDeleteKey();
  const pendingDelete = useEditor((s) => s.pendingDelete);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const cancelDeleteAnnotation = useEditor((s) => s.cancelDeleteAnnotation);

  return (
    <ConfirmDialog
      open={pendingDelete != null}
      title="Delete annotation?"
      message="This removes the selected annotation and can't be undone."
      confirmLabel="Delete"
      tone="danger"
      onConfirm={() => {
        if (pendingDelete) {
          removeAnnotation(pendingDelete.ci, pendingDelete.si, pendingDelete.id);
        }
        cancelDeleteAnnotation();
      }}
      onCancel={cancelDeleteAnnotation}
    />
  );
}

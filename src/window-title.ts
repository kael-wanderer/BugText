// The native window title: macOS lists it in the Dock menu and the Window menu,
// so each window must say what it shows.
export type WindowTitleInput = {
  fileName: string | null;
  dirty: boolean;
  folderName: string | null;
  workspaceName: string | null;
};

export function windowTitle({ fileName, dirty, folderName, workspaceName }: WindowTitleInput): string {
  const place = workspaceName || folderName;
  if (!fileName) return place || "BugText";
  const file = dirty ? `● ${fileName}` : fileName;
  return place ? `${file} — ${place}` : file;
}

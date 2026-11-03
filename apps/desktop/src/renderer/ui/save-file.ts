// Hands a file the engine made to the person: the app's download asks where to keep it.
export function saveTextFile(file: { name: string; mediaType: string; content: string }): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mediaType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

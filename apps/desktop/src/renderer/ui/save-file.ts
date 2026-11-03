// Hands a file to the person: the app asks where to save it.
export function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // The download reads the address on the click; free it once that has happened.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Hands a file the engine made to the person: the app's download asks where to keep it.
export function saveTextFile(file: { name: string; mediaType: string; content: string }): void {
  saveFile(new Blob([file.content], { type: file.mediaType }), file.name);
}

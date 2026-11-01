// The message to send from the composer, or null when it is empty or another message is still on its way.
export function draftToSend(text: string, pending: boolean): string | null {
  const message = text.trim();
  return pending || message === "" ? null : message;
}

// After a send settles: a failed message comes back into the field unless the user already started a new one.
export function draftAfterSend(current: string, message: string, sent: boolean): string {
  return !sent && current === "" ? message : current;
}

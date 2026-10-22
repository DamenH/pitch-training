// Brief confirmations ("Saved", "Link copied") shown above the tab bar.

export const toast = $state({ message: '', id: 0 });

let timer: number | undefined;

export function showToast(message: string): void {
  toast.message = message;
  toast.id += 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    toast.message = '';
  }, 2600);
}

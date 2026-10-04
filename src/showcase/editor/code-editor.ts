/**
 * F4 — Code editor wrapper.
 *
 * Production builds integrate CodeMirror 6; this lightweight implementation
 * provides a dependency-free textarea editor with line numbers, debounced
 * change events and undo/redo (native). It exposes the same surface so a
 * CodeMirror 6 backend can be dropped in later.
 */
export interface EditorOptions {
  value: string;
  onChange(value: string): void;
  debounceMs?: number;
}

export class CodeEditor {
  private textarea: HTMLTextAreaElement;
  private gutter: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly element: HTMLElement;

  constructor(private options: EditorOptions) {
    this.element = document.createElement('div');
    this.element.style.cssText = 'display:flex;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;height:100%';

    this.gutter = document.createElement('div');
    this.gutter.style.cssText =
      'padding:10px 8px;color:#7d8590;text-align:right;user-select:none;background:rgba(0,0,0,.15);overflow:hidden;min-width:2.5em';
    this.element.appendChild(this.gutter);

    this.textarea = document.createElement('textarea');
    this.textarea.value = options.value;
    this.textarea.spellcheck = false;
    this.textarea.style.cssText =
      'flex:1;background:transparent;color:inherit;border:0;outline:0;resize:none;padding:10px;font:inherit;line-height:1.6;white-space:pre;overflow:auto';
    this.textarea.addEventListener('input', () => {
      this.updateGutter();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => options.onChange(this.textarea.value), options.debounceMs ?? 300);
    });
    this.element.appendChild(this.textarea);
    this.updateGutter();
  }

  private updateGutter(): void {
    const lines = this.textarea.value.split('\n').length;
    this.gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  }

  get value(): string {
    return this.textarea.value;
  }

  setValue(value: string): void {
    this.textarea.value = value;
    this.updateGutter();
  }
}

/**
 * F5 — Props visual panel.
 * Renders a control panel from a component's `meta.json` props schema:
 *   string  → text input
 *   enum    → select
 *   boolean → switch
 *   number  → range slider
 *   event   → description only (not editable)
 */
export interface PropSchema {
  type: 'string' | 'enum' | 'boolean' | 'number' | 'event' | string;
  default?: unknown;
  options?: string[];
  description?: string;
}

export interface PropsPanelOptions {
  props: Record<string, PropSchema>;
  defaults?: Record<string, unknown>;
  onChange(values: Record<string, unknown>): void;
}

export function createPropsPanel({ props, defaults = {}, onChange }: PropsPanelOptions): HTMLElement {
  const values: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(props)) {
    values[name] = defaults[name] ?? schema.default;
  }

  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:12px';

  const emit = (): void => onChange({ ...values });

  for (const [name, schema] of Object.entries(props)) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:inherit';

    const label = document.createElement('span');
    label.textContent = schema.description ? `${name} — ${schema.description}` : name;
    label.style.fontWeight = '600';
    row.appendChild(label);

    if (schema.type === 'event') {
      const note = document.createElement('span');
      note.textContent = '(event — not editable)';
      note.style.opacity = '0.6';
      row.appendChild(note);
    } else if (schema.type === 'boolean') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(values[name]);
      input.addEventListener('change', () => {
        values[name] = input.checked;
        emit();
      });
      row.appendChild(input);
    } else if (schema.type === 'enum' && schema.options) {
      const select = document.createElement('select');
      for (const option of schema.options) {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (values[name] === option) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        values[name] = select.value;
        emit();
      });
      row.appendChild(select);
    } else if (schema.type === 'number') {
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.value = String(values[name] ?? 0);
      range.addEventListener('input', () => {
        values[name] = Number(range.value);
        emit();
      });
      row.appendChild(range);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = String(values[name] ?? '');
      input.addEventListener('input', () => {
        values[name] = input.value;
        emit();
      });
      row.appendChild(input);
    }

    panel.appendChild(row);
  }

  return panel;
}

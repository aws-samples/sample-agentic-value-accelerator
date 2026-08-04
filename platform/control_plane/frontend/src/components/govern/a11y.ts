/**
 * a11y — shared accessibility helpers for the Govern module.
 *
 * Many tables and card grids use onClick on non-button elements (<tr>, <div>)
 * to open drawers or toggle detail rows. rowButtonProps() makes those elements
 * keyboard-operable (Enter/Space) and exposes them to assistive tech as buttons,
 * without restructuring the markup into real <button>s.
 */
import type { KeyboardEvent } from 'react';

/**
 * Spread onto a clickable non-button element (e.g. <tr>, <div>) to give it
 * button semantics and keyboard activation.
 *
 *   <tr {...rowButtonProps(() => setOpen(id))} className="cursor-pointer ...">
 */
export function rowButtonProps(activate: () => void, label?: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: activate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    },
  };
}

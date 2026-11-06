/**
 * Decorates a notice: a short, bordered advisory the reader should not miss.
 * Variants come from the block name, e.g. `Notice (warning)`.
 *
 * @param {Element} block The notice block element
 */
export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div');
  if (cell) cell.classList.add('notice-body');
  block.setAttribute('role', 'note');
}

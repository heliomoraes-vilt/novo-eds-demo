/**
 * Decorates the hero.
 *
 * One cell keeps the classic behaviour: a picture behind the heading.
 * Two cells produce the split hero used by the global partnerships catalogue —
 * eyebrow, heading and lead on the left, a note with calls to action on the right.
 * Authors can leave either part out; the block decorates whatever is there.
 *
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  const row = block.querySelector(':scope > div');
  if (!row) return;

  const cells = [...row.children];
  if (cells.length > 1) {
    block.classList.add('hero-split');
    cells[0].classList.add('hero-content');
    cells[1].classList.add('hero-aside');
  } else if (cells.length === 1) {
    cells[0].classList.add('hero-content');
  }

  const content = block.querySelector('.hero-content');
  if (!content) return;

  const heading = content.querySelector('h1, h2');
  if (!heading) return;

  const eyebrow = heading.previousElementSibling;
  if (eyebrow && eyebrow.tagName === 'P') eyebrow.classList.add('hero-eyebrow');

  const lead = heading.nextElementSibling;
  if (lead && lead.tagName === 'P' && !lead.classList.contains('button-wrapper')) {
    lead.classList.add('hero-lead');
  }
}

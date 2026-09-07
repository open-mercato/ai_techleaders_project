// @vitest-environment jsdom
// jsdom has no clipping geometry; collision placement is verified in the browser.
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from './popover';
import { overlayHarness, slot } from './overlay.test-helpers';

describe('Popover', () => {
  const dom = overlayHarness();

  it('opens from its trigger, exposes a real heading and restores focus on Escape', async () => {
    const title = createRef<HTMLHeadingElement>();
    const onOpenChange = vi.fn();
    await dom.render(<Popover onOpenChange={onOpenChange}>
      <PopoverAnchor><PopoverTrigger>Time zone information</PopoverTrigger></PopoverAnchor>
      <PopoverContent avoidCollisions={false} aria-labelledby="zone-title" aria-describedby="zone-description" className="custom">
        <PopoverHeader><PopoverTitle id="zone-title" ref={title}>Europe/Warsaw</PopoverTitle><PopoverDescription id="zone-description">Times follow your selected zone.</PopoverDescription></PopoverHeader>
        <a href="#time-zone-settings">Open time zone settings</a>
      </PopoverContent>
    </Popover>);
    const trigger = slot('popover-trigger');
    await dom.focus(trigger);
    await dom.click(trigger);
    expect(slot('popover-content').getAttribute('role')).toBe('dialog');
    expect(title.current?.tagName).toBe('H2');
    expect(slot('popover-content').className).toContain('dm-popover-content custom');
    expect(slot('popover-content').dataset.align).toBe('center');
    expect(slot('popover-content').contains(document.activeElement)).toBe(true);
    await dom.key(slot('popover-content'), 'Escape');
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onOpenChange.mock.calls.map(call => call[0])).toEqual([true, false]);
  });

  it('forwards controlled visibility, placement, refs and trigger props', async () => {
    const content = createRef<HTMLDivElement>();
    await dom.render(<Popover open><PopoverTrigger disabled>Unavailable settings</PopoverTrigger><PopoverContent avoidCollisions={false} ref={content} align="start" sideOffset={12} side="right" aria-label="Preferences"><PopoverTitle>Preferences</PopoverTitle></PopoverContent></Popover>);
    expect(content.current).toBe(slot('popover-content'));
    expect(slot('popover-content').dataset.align).toBe('start');
    expect((slot('popover-trigger') as HTMLButtonElement).disabled).toBe(true);
  });
});

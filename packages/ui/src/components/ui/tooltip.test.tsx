// @vitest-environment jsdom
// jsdom has no clipping geometry; collision placement is verified in the browser.
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { overlayHarness, slot } from './overlay.test-helpers';

describe('Tooltip', () => {
  const dom = overlayHarness();

  it('describes a focusable trigger on keyboard focus and closes with Escape', async () => {
    await dom.render(<TooltipProvider><Tooltip><TooltipTrigger aria-label="Session visibility">Visibility</TooltipTrigger><TooltipContent avoidCollisions={false}>Only session participants can view this.</TooltipContent></Tooltip></TooltipProvider>);
    const trigger = slot('tooltip-trigger');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await dom.focus(trigger);
    const descriptionId = trigger.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toBe('Only session participants can view this.');
    await dom.key(trigger, 'Escape');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports a provider delay and custom content placement, class and ref', async () => {
    const ref = createRef<HTMLDivElement>();
    await dom.render(<TooltipProvider delayDuration={300}><Tooltip open><TooltipTrigger asChild><button>Help</button></TooltipTrigger><TooltipContent avoidCollisions={false} ref={ref} sideOffset={8} side="bottom" className="custom">Supplementary hint</TooltipContent></Tooltip></TooltipProvider>);
    expect(ref.current).toBe(slot('tooltip-content'));
    expect(ref.current?.className).toContain('dm-tooltip-content custom');
    expect(document.querySelector('.dm-tooltip-arrow')?.getAttribute('width')).toBe('12');
  });
});

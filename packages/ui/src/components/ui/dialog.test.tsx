// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { overlayHarness, slot } from './overlay.test-helpers';

describe('Dialog', () => {
  const dom = overlayHarness();

  it('opens a labelled modal in a portal, traps focus and restores it after Escape', async () => {
    const ref = createRef<HTMLDivElement>();
    const onOpenChange = vi.fn();
    await dom.render(<Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button>Open details</Button></DialogTrigger>
      <DialogContent ref={ref} className="custom">
        <DialogHeader><DialogTitle>Session details</DialogTitle><DialogDescription>Review your session.</DialogDescription></DialogHeader>
        <DialogClose asChild><Button variant="outline">Done</Button></DialogClose>
        <DialogFooter><span>Private to participants</span></DialogFooter>
      </DialogContent>
    </Dialog>);
    const trigger = slot('dialog-trigger');
    await dom.focus(trigger);
    await dom.click(trigger);
    const dialog = slot('dialog-content');
    expect(ref.current).toBe(dialog);
    expect(dialog.className).toContain('dm-dialog-content custom');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Session details');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Review your session.');
    expect(slot('dialog-overlay')).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await dom.focus(trigger);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.querySelectorAll('[data-slot="dialog-close"]')).toHaveLength(2);
    await dom.key(dialog, 'Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onOpenChange.mock.calls.map(call => call[0])).toEqual([true, false]);
  });

  it('supports explicit close composition without the default icon', async () => {
    await dom.render(<Dialog defaultOpen>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>Preferences</DialogTitle><DialogDescription>Choose local display options.</DialogDescription></DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>);
    expect(document.querySelector('.dm-dialog-dismiss')).toBeNull();
    const close = slot('dialog-footer').querySelector('button')!;
    expect(close.textContent).toBe('Close');
    await dom.click(close);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes from the visible dismiss control', async () => {
    await dom.render(<Dialog defaultOpen><DialogContent><DialogTitle>Details</DialogTitle><DialogDescription>Information</DialogDescription></DialogContent></Dialog>);
    await dom.click(document.querySelector('.dm-dialog-dismiss')!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

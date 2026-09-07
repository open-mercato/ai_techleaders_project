// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog';
import { overlayHarness, slot } from './overlay.test-helpers';

describe('AlertDialog', () => {
  const dom = overlayHarness();

  it('focuses the safe cancel action and returns focus after cancellation', async () => {
    const action = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    await dom.render(<AlertDialog>
      <AlertDialogTrigger>Discard draft</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia aria-hidden="true">!</AlertDialogMedia>
          <AlertDialogTitle>Discard unsaved draft?</AlertDialogTitle>
          <AlertDialogDescription>This affects only the local draft.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel ref={ref}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={action}>Discard</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>);
    const trigger = slot('alert-dialog-trigger');
    await dom.focus(trigger);
    await dom.click(trigger);
    const dialog = slot('alert-dialog-content');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('data-size')).toBe('default');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Discard unsaved draft?');
    expect(document.activeElement).toBe(ref.current);
    expect(slot('alert-dialog-overlay')).toBeTruthy();
    await dom.click(slot('alert-dialog-cancel'));
    expect(action).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('forwards action variant, sizing and click, and supports Escape', async () => {
    const action = vi.fn();
    await dom.render(<AlertDialog defaultOpen><AlertDialogContent size="sm" className="compact">
      <AlertDialogTitle>Discard draft?</AlertDialogTitle><AlertDialogDescription>Cannot recover this draft.</AlertDialogDescription>
      <AlertDialogFooter><AlertDialogCancel variant="ghost" size="xs">Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" size="sm" className="confirm" onClick={action}>Discard</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>);
    expect(slot('alert-dialog-content').dataset.size).toBe('sm');
    expect(slot('alert-dialog-action').className).toContain('dm-button-error');
    expect(slot('alert-dialog-action').className).toContain('confirm');
    expect(slot('alert-dialog-cancel').className).toContain('dm-button-xs');
    await dom.click(slot('alert-dialog-action'));
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('keeps a disabled action inert while Escape cancels', async () => {
    const action = vi.fn();
    await dom.render(<AlertDialog defaultOpen><AlertDialogContent><AlertDialogTitle>Pending confirmation</AlertDialogTitle><AlertDialogDescription>Please wait.</AlertDialogDescription><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled onClick={action}>Confirm</AlertDialogAction></AlertDialogContent></AlertDialog>);
    await dom.click(slot('alert-dialog-action'));
    expect(action).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await dom.key(slot('alert-dialog-content'), 'Escape');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

# Quavi quality pass — 19 October 2026

This is a focused client hardening pass on `mobile/social-delivery`, after TestFlight 1.0 (16). It is not a release certification or a claim that every screen/device has passed.

## Fixed

- Story photos show loading, connection, signed-out and failure states; reading views offer a 44px retry control. Reconnect and foreground resume retry resolution. Editable thumbnails retain their existing parent action without nested buttons.
- Photo rendering is keyed to the current account and source; stale responses from a previous account cannot repopulate the UI. Signing out immediately hides managed photos.
- Sheets isolate the background with `inert` and `aria-hidden`, include selects in keyboard navigation, trap focus, handle Escape once and restore the prior focus/background attributes on close.
- Cloud/outing retry controls appear for pending or failed writes, rather than while already saving, offline, empty or requiring sign-in. Outing conflict choices are separate touch targets and still require confirmation; cancellation does not replace either version.
- Long profile names truncate within their allotted space. Avatar setup now uses a shared row so the name cannot overlap Surprise me. Surprise uses the existing spark icon. Stop swap and map-photo credit controls have larger touch targets.

## Verified

- `npm test`: 46 tests pass, including new real-component tests for photo failure/manual retry, reconnect, account switching, stale responses, editable thumbnails, save-status action gating and conflict cancellation/confirmation.
- `npm run build`: TypeScript and production bundle pass.
- `npm run lint`: completes with existing warnings; no errors. The new photo effect has explicit source/account identity dependencies.
- Xcode Debug Simulator build succeeds; latest client assets installed on Quavi iPhone 17 QA and Quavi iPhone SE QA.
- Native iPhone 17 walkthrough: retained demo profile, About, Interests, avatar customization and Home; mood/opening choices and numbered sample walking-route detail inspected. Latest long-name fix visually verified after rebuilding.
- Browser 375×667: Settings background is hidden from assistive navigation, Tab/Shift-Tab stay in the sheet, Escape closes it and focus returns to Settings. No horizontal overflow in that checked view. No verification/reset email was resent by this pass.
- Existing review-board screen IDs and all 29 annotations preserved; screen 4 updated with the actual native long-name capture. Other screenshots retain their original provenance.

## Still to verify before release

- Small iPhone content scrolling: the Interests continuation is below the first viewport. Simulator scroll/drag actions did not reach it, then native input lost window access. This could be native scrolling or automation input; it is unresolved. A temporary scroll-switch experiment was reverted without claiming a fix. No native config change is included.
- Complete native end-to-end outing and social walkthrough on the final build, plus large Dynamic Type, VoiceOver, Dark Mode, landscape/iPad, native camera/share and physical push acceptance.
- A real iPhone outing means physically walking a generated route, validating GPS arrival and actual entrances, locking/reopening, adding a note/photo in airplane mode, reconnecting and confirming the same saved progress from another session. Current tracking is foreground-only; no locked-phone background tracking is promised.
- A signed Release archive containing these fixes was uploaded as 1.0 (17) on October 19 at 6:14 PM EDT. Processing completed; build 17 is verified Testing in Quavi Development with the existing internal tester included and What to Test notes saved. Install via TestFlight → Update; these release steps do not complete the pending physical acceptance checks.

No backend schema or cloud deployment changes are part of this pass.

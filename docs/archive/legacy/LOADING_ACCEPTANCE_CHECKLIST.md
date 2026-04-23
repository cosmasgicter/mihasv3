# Loading Acceptance Checklist (Mobile + Desktop)

Use this checklist after every loading-system change.

## Initial Route Hydration
- [ ] Exactly one loader appears during initial app hydration.
- [ ] There is no sequential “double loader” effect (e.g., static preloader followed by route loader).
- [ ] Users do not see a text-only `Loading...` flash.
- [ ] First route transition feels smooth (no hard flicker before content).

## Mobile (Phone)
- [ ] Loader is centered and readable on small screens.
- [ ] Message copy is short and branded (for example: “Preparing MIHAS”).
- [ ] Transition from loader to first route feels smooth on throttled network.

## Desktop
- [ ] Loader remains visually consistent with the design system.
- [ ] No mixed spinner styles are visible during route/page load.
- [ ] Transition from loader to first route is smooth with no abrupt jump.

# App layout landmark architecture

`AppLayout` owns the application's single primary content landmark.

- Exactly one `<main>` is rendered for the app shell, inside `AppLayout`.
- The canonical main landmark id is `app-main-content` (`APP_MAIN_CONTENT_ID`).
- Skip links (`SkipLink`/`SkipLinks`) should target only this id for the app shell.
- `App.tsx` mounts routes as children of `AppLayout` and must not add an additional `<main>`.

This keeps keyboard skip navigation stable and avoids duplicate main landmarks.

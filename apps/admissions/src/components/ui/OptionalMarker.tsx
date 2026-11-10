/**
 * The one optional-field marker (platform-simplification task 24.4, Requirement 16.5).
 *
 * A required field carries no mark: it is announced through `required` and
 * `aria-required`, which stay on every control. An optional field says so in words,
 * "(optional)", in the label. There is no asterisk anywhere.
 */
export function OptionalMarker() {
  return <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
}

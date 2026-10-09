# Page snapshot

```yaml
- alert [ref=e4]:
  - img [ref=e6]
  - generic [ref=e10]:
    - heading "Something went wrong" [level=3] [ref=e11]
    - paragraph [ref=e12]: Cannot read properties of undefined (reading 'SessionMonitor')
  - generic [ref=e13]:
    - button "Try Again" [ref=e14] [cursor=pointer]:
      - img
      - text: Try Again
    - link "Contact Support" [ref=e15] [cursor=pointer]:
      - /url: /contact
      - img [ref=e16]
      - text: Contact Support
```
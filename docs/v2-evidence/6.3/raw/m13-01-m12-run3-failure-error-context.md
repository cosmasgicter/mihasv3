# Page snapshot

```yaml
- generic [ref=e5]:
  - link "Beanola home" [ref=e6] [cursor=pointer]:
    - /url: /
    - img "Beanola Admissions" [ref=e7]
    - generic [ref=e8]: Beanola
  - main [active] [ref=e9]:
    - generic [ref=e10]:
      - heading "Sign in to your application" [level=1] [ref=e11]
      - paragraph [ref=e12]:
        - text: Welcome back. Pick up where you left off.
        - link "New here? Create an account" [ref=e13] [cursor=pointer]:
          - /url: /auth/signup
    - generic [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Email*
        - textbox "Email" [ref=e18]
      - generic [ref=e19]:
        - generic [ref=e20]: Password*
        - generic [ref=e21]:
          - textbox "Password" [ref=e22]
          - button "Show password" [ref=e23] [cursor=pointer]:
            - img [ref=e24]
      - button "Sign in" [ref=e27] [cursor=pointer]
  - navigation "Auth alternatives" [ref=e29]:
    - link "Forgot your password?" [ref=e30] [cursor=pointer]:
      - /url: /auth/forgot-password
    - link "Create a new account" [ref=e31] [cursor=pointer]:
      - /url: /auth/signup
  - paragraph [ref=e33]: Your session lasts 7 days. We never share your information.
```
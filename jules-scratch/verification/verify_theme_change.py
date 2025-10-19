from playwright.sync_api import sync_playwright
import random
import string

def random_string(length=10):
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Sign up
        page.goto("http://localhost:5173/auth/signup")
        email = f"testuser_{random_string()}@example.com"
        password = "password123"
        page.fill("input[name='email']", email)
        page.fill("input[name='password']", password)
        page.fill("input[name='confirmPassword']", password)
        page.click("button[type='submit']")

        # Log in
        page.goto("http://localhost:5173/auth/signin")
        page.fill("input[name='email']", email)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")

        page.wait_for_selector(".fade-out-preloader", state="detached")
        page.screenshot(path="jules-scratch/verification/after_login.png")
        page.click("button[aria-label='Toggle theme']")
        page.wait_for_timeout(1000)
        page.screenshot(path="jules-scratch/verification/verification.png")
        browser.close()

run()

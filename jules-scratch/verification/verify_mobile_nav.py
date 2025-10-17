from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 375, 'height': 812},
        is_mobile=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
    )
    page = context.new_page()

    # Log in as student
    page.goto("http://localhost:5173/auth/signin")
    page.get_by_label("Email").fill("cosmaskanchepa8@gmail.com")
    page.get_by_label("Password").fill("Beanola2025")
    page.get_by_role("button", name="Sign In").click()
    expect(page).to_have_url("http://localhost:5173/student/dashboard")

    # Test authenticated navigation
    page.get_by_test_id("auth-nav-mobile-toggle").click()
    page.wait_for_selector('[data-testid="auth-nav-mobile-menu"]')
    page.screenshot(path="jules-scratch/verification/authenticated_nav.png")

    # Log out
    page.get_by_role("button", name="Sign Out").click(force=True)
    page.reload()
    page.wait_for_timeout(1000)
    expect(page.get_by_role("button", name="Sign In")).to_be_visible()

    # Test unauthenticated navigation
    page.get_by_role("button", name="Open menu").click()
    page.wait_for_selector('[aria-label="Close menu"]')
    page.screenshot(path="jules-scratch/verification/unauthenticated_nav.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1920, 'height': 1080},
    )
    page = context.new_page()

    # Log in as admin
    page.goto("http://localhost:5173/auth/signin")
    page.get_by_label("Email").fill("cosmas@beanola.com")
    page.get_by_label("Password").fill("Beanola2025")
    page.get_by_role("button", name="Sign In").click()
    expect(page).to_have_url("http://localhost:5173/admin")

    # Check for the applications table
    expect(page.get_by_role("table")).to_be_visible()

    # Check for at least one application row
    expect(page.locator("tbody tr")).to_have_count(greater_than=0)

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
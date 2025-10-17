from playwright.sync_api import sync_playwright, expect
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1920, 'height': 1080},
    )
    page = context.new_page()

    # Log in as student
    page.goto("http://localhost:5173/auth/signin")
    page.get_by_label("Email").fill("cosmaskanchepa8@gmail.com")
    page.get_by_label("Password").fill("Beanola2025")
    page.get_by_role("button", name="Sign In").click()
    expect(page).to_have_url("http://localhost:5173/student/dashboard")

    # Navigate to the application wizard
    page.get_by_role("link", name="Start new application").click()
    expect(page).to_have_url("http://localhost:5173/student/application-wizard")

    # Fill out the form
    page.get_by_label("First Name").fill("Test")
    page.get_by_label("Last Name").fill("Student")
    page.get_by_label("Date of Birth").fill("2000-01-01")
    page.get_by_label("Phone Number").fill("1234567890")
    page.get_by_label("Address").fill("123 Test Street")

    # Create a dummy file for upload
    with open("dummy_document.pdf", "w") as f:
        f.write("This is a dummy PDF document.")

    # Upload document
    page.set_input_files('input[type="file"]', "dummy_document.pdf")

    # Submit the application
    page.get_by_role("button", name="Submit Application").click()

    # Verify submission
    expect(page.get_by_text("Application Submitted Successfully")).to_be_visible()

    # Clean up dummy file
    os.remove("dummy_document.pdf")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)